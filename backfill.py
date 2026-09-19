"""Backfill historical rates from Wayback Machine snapshots of the JSON feed.

    python backfill.py                  # everything the archive has (from Jan 2025)
    python backfill.py --since 2026-01-01
    python backfill.py --no-skip-existing  # re-fetch dates already in the DB

The archive holds roughly one snapshot per day. Each snapshot is the feed as it
was at that moment, keyed by the rate date inside it, so duplicates collapse.
Snapshots are processed newest-first; archive.org rate-limits, so keep --delay
around 3s (the whole history takes ~30-40 minutes).
"""
from __future__ import annotations

import argparse
import sys
import time

import requests

import scraper
import store

CDX_URL = "https://web.archive.org/cdx/search/cdx"
SNAPSHOT_URL = "https://web.archive.org/web/{ts}id_/" + scraper.FEED_URL


def get_with_retry(url: str, *, params: dict | None = None, tries: int = 5, timeout: int = 60) -> requests.Response:
    """archive.org returns 503/429 sporadically; back off and retry."""
    delay = 2.0
    for attempt in range(1, tries + 1):
        try:
            resp = requests.get(url, params=params, headers=scraper.HEADERS, timeout=timeout)
            if resp.status_code in (429, 503, 504) and attempt < tries:
                raise requests.HTTPError(f"{resp.status_code} from archive", response=resp)
            resp.raise_for_status()
            return resp
        except (requests.HTTPError, requests.ConnectionError, requests.Timeout):
            if attempt == tries:
                raise
            time.sleep(delay)
            delay *= 2
    raise RuntimeError("unreachable")


def list_snapshots(since: str | None) -> list[str]:
    params = {
        "url": scraper.FEED_URL,
        "output": "json",
        "fl": "timestamp",
        "filter": "statuscode:200",
        "collapse": "timestamp:8",  # one per calendar day
        "limit": "5000",
    }
    if since:
        params["from"] = since.replace("-", "")
    rows = get_with_retry(CDX_URL, params=params).json()
    return [r[0] for r in rows[1:]]  # first row is the header


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--since", help="YYYY-MM-DD; only snapshots on/after this date")
    ap.add_argument("--no-skip-existing", action="store_true", help="re-fetch dates already stored")
    ap.add_argument("--delay", type=float, default=3.0, help="seconds between archive requests (archive.org rate-limits)")
    args = ap.parse_args()

    # Newest first, so the most useful history lands early and can be watched on the dashboard.
    stamps = sorted(list_snapshots(args.since), reverse=True)
    print(f"{len(stamps)} archived snapshots", flush=True)

    sb = store.client()
    have = store.stored_dates(sb)
    stored = skipped = failed = streak = 0
    for i, ts in enumerate(stamps, 1):
        snap_day = f"{ts[:4]}-{ts[4:6]}-{ts[6:8]}"
        # A snapshot taken on day D carries D's rates (or D-1's if captured
        # before the morning update); skip only when D itself is stored.
        if not args.no_skip_existing and snap_day in have:
            skipped += 1
            continue
        try:
            data = get_with_retry(SNAPSHOT_URL.format(ts=ts)).json()
            rate_date, rates = scraper.parse_feed(data)
        except Exception as exc:  # archive hiccups are common; keep going
            failed += 1
            streak += 1
            print(f"  [{i}/{len(stamps)}] {ts}: FAILED {type(exc).__name__}: {exc}", flush=True)
            if streak >= 5:
                print("5 failures in a row - archive.org is probably throttling this machine. "
                      "Stopping; re-run later, it resumes where it left off.", flush=True)
                break
            time.sleep(args.delay)
            continue
        streak = 0
        iso = rate_date.isoformat()
        if not args.no_skip_existing and iso in have:
            skipped += 1
        else:
            store.store_rates(sb, rates)
            have.add(iso)
            stored += 1
            print(f"  [{i}/{len(stamps)}] {ts} -> {iso}: {len(rates)} rates", flush=True)
        time.sleep(args.delay)
    store.log_fetch(sb, "backfill", None, stored, f"stored={stored} skipped={skipped} failed={failed}")
    print(f"done: stored {stored} days, skipped {skipped}, failed {failed}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
