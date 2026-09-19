"""One-off: push the history collected by the old SQLite version into Supabase.

    python migrate_sqlite.py [path/to/market.db]

Idempotent - re-running upserts the same rows. Favourites from the SQLite
version are not migrated (they were not tied to an account).
"""
from __future__ import annotations

import sqlite3
import sys
from datetime import date

import store
from scraper import Rate


def main() -> int:
    path = sys.argv[1] if len(sys.argv) > 1 else "market.db"
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        """
        SELECT r.date, r.price_low, r.price_high, r.raw,
               i.id AS item_id, i.name, i.name_ml, i.section, i.section_ml,
               m.id AS market_id, m.name AS market, m.name_ml AS market_ml, m.rank
        FROM rates r JOIN items i ON i.id = r.item_id JOIN markets m ON m.id = i.market_id
        ORDER BY r.date
        """
    ).fetchall()
    if not rows:
        print("nothing to migrate")
        return 0

    by_day: dict[str, list[Rate]] = {}
    for r in rows:
        by_day.setdefault(r["date"], []).append(
            Rate(
                date=date.fromisoformat(r["date"]),
                market_id=r["market_id"], market_rank=r["rank"], market=r["market"], market_ml=r["market_ml"],
                section=r["section"], section_ml=r["section_ml"],
                item_id=r["item_id"], item=r["name"], item_ml=r["name_ml"],
                price_low=r["price_low"], price_high=r["price_high"], raw=r["raw"],
            )
        )

    sb = store.client()
    total = 0
    for i, (day, rates) in enumerate(sorted(by_day.items()), 1):
        n = store.store_rates(sb, rates)
        total += n
        print(f"  [{i}/{len(by_day)}] {day}: {n} rates", flush=True)
    store.log_fetch(sb, "migrate", None, total, f"from {path}: {len(by_day)} days")
    print(f"done: {total} rates over {len(by_day)} days")
    return 0


if __name__ == "__main__":
    sys.exit(main())
