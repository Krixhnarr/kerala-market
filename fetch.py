"""Fetch today's rates and store them. Safe to run repeatedly (upserts).

    python fetch.py
"""
from __future__ import annotations

import logging
import sys

import db
import scraper

log = logging.getLogger("fetch")


def run() -> dict:
    """Fetch + store. Returns a summary dict; never raises (logs to fetch_log instead)."""
    with db.connect() as conn:
        try:
            rate_date, rates = scraper.scrape()
            n = db.store_rates(conn, rates)
            db.log_fetch(conn, "ok", rate_date, n)
            log.info("stored %d rates for %s", n, rate_date)
            return {"status": "ok", "date": rate_date.isoformat(), "rows": n}
        except Exception as exc:  # network / format errors
            db.log_fetch(conn, "error", None, 0, f"{type(exc).__name__}: {exc}")
            log.exception("fetch failed")
            return {"status": "error", "message": f"{type(exc).__name__}: {exc}"}


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    result = run()
    print(result)
    sys.exit(0 if result["status"] == "ok" else 1)
