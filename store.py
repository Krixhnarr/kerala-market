"""Write rates to Supabase (Postgres) through the upsert_snapshot RPC.

Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment (or in a
.env file next to this module). The service-role key bypasses row-level
security and is the only key allowed to call upsert_snapshot - never ship it
to a browser.
"""
from __future__ import annotations

import os
from datetime import date
from pathlib import Path

from supabase import Client, create_client

from scraper import Rate


def _load_dotenv() -> None:
    env = Path(__file__).with_name(".env")
    if not env.exists():
        return
    for line in env.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip("'\""))


def client() -> Client:
    _load_dotenv()
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise SystemExit("set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see .env.example)")
    return create_client(url, key)


def store_rates(sb: Client, rates: list[Rate]) -> int:
    """Upsert one day's markets, items and rates in a single transaction. Returns rates written."""
    markets: dict[int, dict] = {}
    items: dict[int, dict] = {}
    rows: list[dict] = []
    for r in rates:
        d = r.date.isoformat()
        markets[r.market_id] = {
            "id": r.market_id, "name": r.market, "name_ml": r.market_ml, "rank": r.market_rank, "last_seen": d,
        }
        items[r.item_id] = {
            "id": r.item_id, "market_id": r.market_id, "section": r.section, "section_ml": r.section_ml,
            "name": r.item, "name_ml": r.item_ml, "last_seen": d,
        }
        rows.append({
            "date": d, "item_id": r.item_id, "price_low": r.price_low, "price_high": r.price_high, "raw": r.raw,
        })
    result = sb.rpc(
        "upsert_snapshot",
        {"p_markets": list(markets.values()), "p_items": list(items.values()), "p_rates": rows},
    ).execute()
    return int(result.data)


def log_fetch(sb: Client, status: str, rate_date: date | None, rows: int, message: str = "") -> None:
    sb.table("fetch_log").insert(
        {"status": status, "rate_date": rate_date.isoformat() if rate_date else None, "rows": rows, "message": message}
    ).execute()


def stored_dates(sb: Client) -> set[str]:
    """Every date that has at least one rate (for backfill's skip-existing)."""
    result = sb.rpc("stored_dates", {}).execute()
    return set(result.data or [])
