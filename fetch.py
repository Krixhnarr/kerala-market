"""Fetch today's rates and store them in Supabase. Safe to run repeatedly (upserts).

    python fetch.py
"""
from __future__ import annotations

import logging
import sys

import scraper
import store

log = logging.getLogger("fetch")


def run() -> dict:
    """Fetch + store. Returns a summary dict; never raises (logs to fetch_log instead)."""
    sb = store.client()
    try:
        rate_date, rates = scraper.scrape()
        n = store.store_rates(sb, rates)
        store.log_fetch(sb, "ok", rate_date, n)
        log.info("stored %d rates for %s", n, rate_date)
        return {"status": "ok", "date": rate_date.isoformat(), "rows": n}
    except Exception as exc:  # network / format errors
        log.exception("fetch failed")
        try:
            store.log_fetch(sb, "error", None, 0, f"{type(exc).__name__}: {exc}")
        except Exception:  # if Supabase itself is the problem, the log line above is all we have
            log.exception("could not write fetch_log")
        return {"status": "error", "message": f"{type(exc).__name__}: {exc}"}


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    result = run()
    print(result)
    sys.exit(0 if result["status"] == "ok" else 1)
