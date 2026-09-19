# Manorama Market Rates

Collects the daily Kerala commodity rates that Malayala Manorama publishes
(coconut oil, copra, arecanut/അടയ്ക്ക, pepper, rubber, cardamom, gold, rice …
for 12 markets: Kochi, Kottayam, Thrissur, Kozhikode, Kannur, Kasaragod, …),
stores them in SQLite, and shows them on a dashboard with price-history graphs.

Source: the JSON feed behind
<https://www.manoramaonline.com/business/commodity-market-prices-live-updates.html>
(`appdata.manoramaonline.com/common/MMOnlineVipani/market/marketVipani.json`).
Manorama refreshes it each morning; it carries one day of rates at a time.

## Setup

```bash
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt      # Windows
# source .venv/bin/activate && pip install -r requirements.txt   # macOS/Linux
```

## Run

```bash
.venv\Scripts\python app.py
```

Open <http://127.0.0.1:5000>. On startup the app fetches today's rates if they
are missing, then keeps fetching at 08:30, 12:30 and 18:30 (IST) while it runs.
"Refresh now" on the page fetches on demand. Re-fetching is harmless: one row
per item per day, newest wins.

Click ☆ on a market tab to star it. Starred markets are listed first and the
first one is the default view. Inside a market, click ☆ on a sub-market heading
(e.g. Kannur → Payyannur) to pin that section to the top of its market, or ☆ on
an item row (hover to reveal) to pin that single item above everything else.
All starred items and sub-markets are also collected under a "★ Favourites"
tab. Favourites are stored in the database, so they follow the app rather than
the browser.

## Backfill history

Manorama only serves the current day, but the Internet Archive has ~daily
snapshots of the feed since January 2025:

```bash
.venv\Scripts\python backfill.py                  # all snapshots
.venv\Scripts\python backfill.py --since 2026-01-01
```

Safe to re-run; dates already stored are skipped. Older snapshots lack English
item names — those are filled in from the newest data.

## Fetch without the web app

`python fetch.py` does one fetch + store and exits non-zero on failure, so it
can also be run from Windows Task Scheduler / cron if you don't keep `app.py`
running:

```
schtasks /create /tn "ManoramaMarket" /sc daily /st 09:00 /tr "\"C:\path\to\.venv\Scripts\python.exe\" \"C:\path\to\fetch.py\""
```

## API

| Route | Purpose |
|---|---|
| `GET /api/status` | latest date, days stored, last fetch result |
| `GET /api/markets` | markets: favourites first, then Manorama's order (`favourite` flag) |
| `PUT /api/markets/<id>/favourite` | body `{"favourite": true\|false}` — star/unstar a market |
| `GET /api/rates?market_id=37&date=2026-09-19` | one market's rates for a day, with day-over-day change (starred sections first) |
| `GET /api/rates?favourites=1` | rates from starred items and sub-markets across all markets |
| `GET /api/favourites` | everything starred: `{"items": [...], "sections": [...]}` |
| `PUT /api/markets/<id>/sections/favourite` | body `{"section": "Payyannur", "favourite": true}` — star/unstar a sub-market |
| `PUT /api/items/<id>/favourite` | body `{"favourite": true}` — star/unstar an item |
| `GET /api/history?item_id=254&item_id=256&days=365` | price series (`days=0` for all) |
| `GET /api/items?q=areca` | search items (English or Malayalam) |
| `GET /api/featured` | the pinned tiles (edit `FEATURED` in `app.py`) |
| `POST /api/refresh` | fetch now |

## Files

- `scraper.py` – fetch + parse the feed (`Rate` dataclass; handles `1,13,240` and `1,750-1,900`)
- `db.py` – SQLite schema and upserts (`market.db`)
- `fetch.py` – one fetch-and-store run
- `backfill.py` – Wayback Machine backfill
- `app.py` – Flask dashboard, JSON API, scheduler
- `templates/index.html` – the UI (Chart.js)
