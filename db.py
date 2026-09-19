"""SQLite storage for daily rates.

Tables
  markets(id, name, name_ml, rank, last_seen)
  items(id, market_id, section, section_ml, name, name_ml, last_seen)   -- id is Manorama's itemId
  rates(date, item_id, price_low, price_high, raw)           -- one row per item per day
  fetch_log(fetched_at, rate_date, rows, status, message)
  favourites(market_id)                                      -- starred markets
"""
from __future__ import annotations

import os
import sqlite3
from contextlib import contextmanager
from datetime import date, datetime

from scraper import Rate

DB_PATH = os.environ.get("MARKET_DB", os.path.join(os.path.dirname(__file__), "market.db"))

SCHEMA = """
CREATE TABLE IF NOT EXISTS markets (
    id        INTEGER PRIMARY KEY,
    name      TEXT NOT NULL,
    name_ml   TEXT NOT NULL DEFAULT '',
    rank      INTEGER NOT NULL DEFAULT 0,
    last_seen TEXT NOT NULL DEFAULT ''   -- ISO date of the newest feed that carried this market
);
CREATE TABLE IF NOT EXISTS items (
    id         INTEGER PRIMARY KEY,
    market_id  INTEGER NOT NULL REFERENCES markets(id),
    section    TEXT NOT NULL DEFAULT '',
    section_ml TEXT NOT NULL DEFAULT '',
    name       TEXT NOT NULL DEFAULT '',
    name_ml    TEXT NOT NULL DEFAULT '',
    last_seen  TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS rates (
    date       TEXT    NOT NULL,   -- ISO yyyy-mm-dd
    item_id    INTEGER NOT NULL REFERENCES items(id),
    price_low  REAL,
    price_high REAL,
    raw        TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (date, item_id)
);
CREATE INDEX IF NOT EXISTS rates_item_date ON rates(item_id, date);
CREATE TABLE IF NOT EXISTS favourites (
    market_id INTEGER PRIMARY KEY REFERENCES markets(id)
);
CREATE TABLE IF NOT EXISTS fetch_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    fetched_at TEXT NOT NULL,
    rate_date  TEXT,
    rows       INTEGER NOT NULL DEFAULT 0,
    status     TEXT NOT NULL,
    message    TEXT NOT NULL DEFAULT ''
);
"""


@contextmanager
def connect(path: str = DB_PATH):
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    try:
        conn.executescript(SCHEMA)
        yield conn
        conn.commit()
    finally:
        conn.close()


def store_rates(conn: sqlite3.Connection, rates: list[Rate]) -> int:
    """Upsert markets/items and insert the day's rates. Returns rows written.

    Item/market metadata is only overwritten by data from the same day or newer
    (backfill runs oldest-first) and never by an empty string - older feeds lack
    the English names.
    """
    keep = "CASE WHEN excluded.last_seen >= {t}.last_seen AND excluded.{c} != '' THEN excluded.{c} ELSE {t}.{c} END"
    for r in rates:
        d = r.date.isoformat()
        conn.execute(
            "INSERT INTO markets(id, name, name_ml, rank, last_seen) VALUES (?, ?, ?, ?, ?) "
            "ON CONFLICT(id) DO UPDATE SET "
            + ", ".join(f"{c}={keep.format(t='markets', c=c)}" for c in ("name", "name_ml"))
            + ", rank=CASE WHEN excluded.last_seen >= markets.last_seen THEN excluded.rank ELSE markets.rank END"
            ", last_seen=MAX(markets.last_seen, excluded.last_seen)",
            (r.market_id, r.market, r.market_ml, r.market_rank, d),
        )
        conn.execute(
            "INSERT INTO items(id, market_id, section, section_ml, name, name_ml, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?) "
            "ON CONFLICT(id) DO UPDATE SET "
            "market_id=CASE WHEN excluded.last_seen >= items.last_seen THEN excluded.market_id ELSE items.market_id END, "
            + ", ".join(f"{c}={keep.format(t='items', c=c)}" for c in ("section", "section_ml", "name", "name_ml"))
            + ", last_seen=MAX(items.last_seen, excluded.last_seen)",
            (r.item_id, r.market_id, r.section, r.section_ml, r.item, r.item_ml, d),
        )
    cur = conn.executemany(
        "INSERT INTO rates(date, item_id, price_low, price_high, raw) VALUES (?, ?, ?, ?, ?) "
        "ON CONFLICT(date, item_id) DO UPDATE SET price_low=excluded.price_low, "
        "price_high=excluded.price_high, raw=excluded.raw",
        [(r.date.isoformat(), r.item_id, r.price_low, r.price_high, r.raw) for r in rates],
    )
    return cur.rowcount


def log_fetch(conn: sqlite3.Connection, status: str, rate_date: date | None, rows: int, message: str = "") -> None:
    conn.execute(
        "INSERT INTO fetch_log(fetched_at, rate_date, rows, status, message) VALUES (?, ?, ?, ?, ?)",
        (datetime.now().isoformat(timespec="seconds"), rate_date.isoformat() if rate_date else None, rows, status, message),
    )


def latest_date(conn: sqlite3.Connection) -> str | None:
    row = conn.execute("SELECT MAX(date) AS d FROM rates").fetchone()
    return row["d"] if row else None
