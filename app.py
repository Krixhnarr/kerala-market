"""Web dashboard + JSON API + daily scheduler.

    python app.py            # http://127.0.0.1:5000

The scheduler fetches at 08:30, 12:30 and 18:30 local time (upserts, so
re-running is harmless) and once at startup if today's rates are missing.
"""
from __future__ import annotations

import logging
import os
from datetime import date, timedelta

from apscheduler.schedulers.background import BackgroundScheduler
from flask import Flask, jsonify, render_template, request

import db
from fetch import run as fetch_now

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("app")

app = Flask(__name__)
app.json.ensure_ascii = False  # keep Malayalam readable in API responses

# Items pinned to the top of the dashboard: (market, section, item English name).
# When several rows match, the one with the most recent price wins.
FEATURED = [
    ("Kochi", "Kochi", "Coconut Oil Ready"),
    ("Kochi", "Kochi", "Raw Copra"),
    ("Kochi", "Kochi", "Arecanut / Betel Nut - New"),
    ("Kozhikode", "Kozhikode", "Arecanut/Betel Nut"),
    ("Kochi", "Black Pepper", "Garbled"),
    ("Kottayam Rubber Board", "Kottayam", "RSS 4"),
]


def _row(r) -> dict:
    return dict(r)


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/api/status")
def api_status():
    with db.connect() as conn:
        latest = db.latest_date(conn)
        days = conn.execute("SELECT COUNT(DISTINCT date) AS n FROM rates").fetchone()["n"]
        first = conn.execute("SELECT MIN(date) AS d FROM rates").fetchone()["d"]
        last_fetch = conn.execute(
            "SELECT fetched_at, rate_date, rows, status, message FROM fetch_log ORDER BY id DESC LIMIT 1"
        ).fetchone()
    return jsonify(
        latest_date=latest,
        first_date=first,
        days=days,
        last_fetch=_row(last_fetch) if last_fetch else None,
        next_runs=[j.next_run_time.isoformat(timespec="minutes") for j in scheduler.get_jobs()] if scheduler.running else [],
    )


@app.get("/api/markets")
def api_markets():
    with db.connect() as conn:
        rows = conn.execute(
            "SELECT m.id, m.name, m.name_ml, COUNT(i.id) AS items, "
            "EXISTS(SELECT 1 FROM favourites f WHERE f.market_id = m.id) AS favourite "
            "FROM markets m LEFT JOIN items i ON i.market_id = m.id "
            "GROUP BY m.id ORDER BY favourite DESC, m.rank, m.id"
        ).fetchall()
    return jsonify([{**_row(r), "favourite": bool(r["favourite"])} for r in rows])


@app.put("/api/markets/<int:market_id>/favourite")
def api_set_favourite(market_id: int):
    """Body: {"favourite": true|false}. Stars/unstars a market."""
    want = bool((request.get_json(silent=True) or {}).get("favourite", True))
    with db.connect() as conn:
        if not conn.execute("SELECT 1 FROM markets WHERE id = ?", (market_id,)).fetchone():
            return jsonify(error="unknown market"), 404
        if want:
            conn.execute("INSERT OR IGNORE INTO favourites(market_id) VALUES (?)", (market_id,))
        else:
            conn.execute("DELETE FROM favourites WHERE market_id = ?", (market_id,))
    return jsonify(market_id=market_id, favourite=want)


def _rates_for(conn, market_id: int, on: str) -> list[dict]:
    """All items of a market on `on`, with the previous available day's price for a change column."""
    prev = conn.execute(
        "SELECT MAX(r.date) AS d FROM rates r JOIN items i ON i.id = r.item_id "
        "WHERE i.market_id = ? AND r.date < ?",
        (market_id, on),
    ).fetchone()["d"]
    rows = conn.execute(
        """
        SELECT i.id AS item_id, i.section, i.section_ml, i.name, i.name_ml,
               r.price_low, r.price_high, r.raw,
               p.price_low AS prev_low, p.price_high AS prev_high, p.raw AS prev_raw
        FROM items i
        JOIN rates r ON r.item_id = i.id AND r.date = ?
        LEFT JOIN rates p ON p.item_id = i.id AND p.date = ?
        WHERE i.market_id = ?
        ORDER BY i.id
        """,
        (on, prev, market_id),
    ).fetchall()
    out = []
    for r in rows:
        d = _row(r)
        d["prev_date"] = prev
        d["change"] = (
            round(d["price_low"] - d["prev_low"], 2)
            if d["price_low"] is not None and d["prev_low"] is not None
            else None
        )
        out.append(d)
    return out


@app.get("/api/rates")
def api_rates():
    market_id = request.args.get("market_id", type=int)
    on = request.args.get("date")
    with db.connect() as conn:
        if market_id is None:
            market_id = conn.execute(
                "SELECT m.id FROM markets m ORDER BY EXISTS(SELECT 1 FROM favourites f WHERE f.market_id = m.id) DESC, m.rank, m.id LIMIT 1"
            ).fetchone()["id"]
        if not on:
            on = db.latest_date(conn)
        if not on:
            return jsonify(date=None, market_id=market_id, rates=[])
        rates = _rates_for(conn, market_id, on)
    return jsonify(date=on, market_id=market_id, rates=rates)


@app.get("/api/history")
def api_history():
    """Price series for one or more items. ?item_id=254&item_id=256&days=365 (days=0 -> all)."""
    ids = request.args.getlist("item_id", type=int)[:6]
    days = request.args.get("days", default=365, type=int)
    if not ids:
        return jsonify(series=[])
    since = (date.today() - timedelta(days=days)).isoformat() if days > 0 else "0000-00-00"
    out = []
    with db.connect() as conn:
        for item_id in ids:
            meta = conn.execute(
                "SELECT i.id, i.name, i.name_ml, i.section, m.name AS market FROM items i "
                "JOIN markets m ON m.id = i.market_id WHERE i.id = ?",
                (item_id,),
            ).fetchone()
            if not meta:
                continue
            pts = conn.execute(
                "SELECT date, price_low, price_high FROM rates WHERE item_id = ? AND date >= ? "
                "AND price_low IS NOT NULL ORDER BY date",
                (item_id, since),
            ).fetchall()
            out.append({**_row(meta), "points": [_row(p) for p in pts]})
    return jsonify(series=out)


@app.get("/api/items")
def api_items():
    """Search items by English or Malayalam name: ?q=areca"""
    q = f"%{request.args.get('q', '').strip()}%"
    with db.connect() as conn:
        rows = conn.execute(
            "SELECT i.id, i.name, i.name_ml, i.section, m.name AS market FROM items i "
            "JOIN markets m ON m.id = i.market_id "
            "WHERE i.name LIKE ? OR i.name_ml LIKE ? OR i.section LIKE ? OR m.name LIKE ? "
            "ORDER BY m.rank, m.id, i.id LIMIT 60",
            (q, q, q, q),
        ).fetchall()
    return jsonify([_row(r) for r in rows])


@app.get("/api/featured")
def api_featured():
    with db.connect() as conn:
        latest = db.latest_date(conn)
        out = []
        for market, section, name in FEATURED:
            item = conn.execute(
                "SELECT i.id, i.name, i.name_ml, i.section, m.name AS market, MAX(r.date) AS seen FROM items i "
                "JOIN markets m ON m.id = i.market_id "
                "LEFT JOIN rates r ON r.item_id = i.id AND r.price_low IS NOT NULL "
                "WHERE m.name = ? AND i.section = ? AND i.name = ? GROUP BY i.id ORDER BY seen DESC LIMIT 1",
                (market, section, name),
            ).fetchone()
            if not item:
                continue
            pts = conn.execute(
                "SELECT date, price_low, price_high FROM rates WHERE item_id = ? AND price_low IS NOT NULL "
                "ORDER BY date DESC LIMIT 30",
                (item["id"],),
            ).fetchall()
            pts = [_row(p) for p in reversed(pts)]
            cur = pts[-1] if pts else None
            prev = pts[-2] if len(pts) > 1 else None
            item = {k: v for k, v in dict(item).items() if k != "seen"}
            out.append(
                {
                    **item,
                    "date": cur["date"] if cur else None,
                    "price_low": cur["price_low"] if cur else None,
                    "price_high": cur["price_high"] if cur else None,
                    "change": round(cur["price_low"] - prev["price_low"], 2) if cur and prev else None,
                    "prev_date": prev["date"] if prev else None,
                    "spark": [p["price_low"] for p in pts],
                }
            )
    return jsonify(latest_date=latest, items=out)


@app.post("/api/refresh")
def api_refresh():
    return jsonify(fetch_now())


scheduler = BackgroundScheduler(timezone="Asia/Kolkata")


def _startup_fetch():
    with db.connect() as conn:
        latest = db.latest_date(conn)
    if latest != date.today().isoformat():
        log.info("no rates for today yet (latest=%s); fetching", latest)
        fetch_now()


if __name__ == "__main__":
    # Werkzeug's reloader starts the module twice; only schedule in the child.
    if not app.debug or os.environ.get("WERKZEUG_RUN_MAIN") == "true":
        for hour in (8, 12, 18):
            scheduler.add_job(fetch_now, "cron", hour=hour, minute=30, id=f"fetch-{hour}", misfire_grace_time=3600)
        scheduler.start()
        _startup_fetch()
    app.run(host=os.environ.get("HOST", "127.0.0.1"), port=int(os.environ.get("PORT", "5000")))
