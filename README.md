# Kerala Market Rates

Daily Kerala commodity rates as published by Malayala Manorama (coconut oil,
copra, arecanut/അടയ്ക്ക, pepper, rubber, cardamom, gold, rice … across 12
markets: Kochi, Kottayam, Thrissur, Kozhikode, Kannur, Kasaragod, …), with
price-history graphs and per-account favourites.

- **Database + accounts:** [Supabase](https://supabase.com) (Postgres, Auth, row-level security)
- **Website:** static files in `web/` — host on Vercel, Netlify, GitHub Pages, Cloudflare Pages, anything
- **Daily fetch:** GitHub Actions cron running `fetch.py`

Source: the JSON feed behind
<https://www.manoramaonline.com/business/commodity-market-prices-live-updates.html>
(`appdata.manoramaonline.com/common/MMOnlineVipani/market/marketVipani.json`).
Manorama refreshes it each morning and it carries one day at a time; history
comes from the Internet Archive (`backfill.py`).

## 1. Create the Supabase project

1. <https://supabase.com/dashboard> → **New project**. Pick a region near
   your users (Mumbai, `ap-south-1`).
2. Apply the schema. Either paste
   [`supabase/migrations/20260919120000_init.sql`](supabase/migrations/20260919120000_init.sql)
   into **SQL Editor → Run**, or with the CLI:
   ```bash
   supabase link --project-ref YOUR-PROJECT-REF
   supabase db push
   ```
3. **Authentication → Providers**: Email is on by default (with confirmation
   emails). Optionally enable **Google** and set `googleAuth: true` in
   `web/config.js`.
4. **Authentication → URL Configuration**: set *Site URL* to where the site
   will live (e.g. `https://kerala-rates.vercel.app`) so confirmation and
   magic-link emails redirect back correctly. Add `http://localhost:5500` to
   *Redirect URLs* for local testing.
5. **Project Settings → API**: note the *Project URL*, *anon* key and
   *service_role* key.

## 2. Load data

```bash
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
copy .env.example .env         # then fill in SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
.venv\Scripts\python fetch.py  # today's rates
```

History:

```bash
.venv\Scripts\python backfill.py                     # Internet Archive snapshots since Jan 2025 (~40 min)
.venv\Scripts\python migrate_sqlite.py market.db     # if you have a market.db from the old SQLite version
```

Both are idempotent. `backfill.py` goes newest-first, skips dates already
stored, and stops itself if archive.org starts refusing (re-run later).

## 3. Automate the daily fetch

In the GitHub repository: **Settings → Secrets and variables → Actions** →
add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. The workflow in
[`.github/workflows/fetch.yml`](.github/workflows/fetch.yml) then runs at
08:30, 12:30 and 18:30 IST. **Actions → Fetch market rates → Run workflow**
runs it on demand (optionally with a backfill start date).

## 4. Publish the website

Edit `web/config.js` with the *Project URL* and *anon* key (the anon key is
meant to be public; row-level security protects the data). Then deploy the
`web/` folder — for example:

- **Vercel / Netlify:** import the repo, set the output/publish directory to `web`.
- **GitHub Pages:** Settings → Pages → deploy from branch, folder `/web`
  (or copy `web/` contents to a `docs/` folder).

Local preview: `python -m http.server 5500 --directory web` → <http://localhost:5500>.

## How favourites work

Anyone can browse. Signed-in users can star:

| Star | Effect |
|---|---|
| a **market** (tab) | listed first; becomes the default view |
| a **sub-market** (section heading, e.g. Kannur → Payyannur) | pinned to the top of its market |
| an **item** (row, hover for ☆) | pulled above everything else in its market under "★ Starred items" |

Everything starred is also gathered under the **★ Favourites** tab. Each
user's stars are private rows in `favourite_markets`, `favourite_sections`
and `favourite_items`, enforced by RLS (`auth.uid() = user_id`).

## Data model

| Table | Purpose |
|---|---|
| `markets` | Manorama's markets (`id` = marketId, `rank` = display order) |
| `items` | one row per rate line (`id` = itemId, stable across years), with section and English/Malayalam names |
| `rates` | one row per item per day: `price_low`, `price_high` (equal unless a range was printed), `raw` |
| `fetch_log` | one row per fetch/backfill run |

RPCs used by the site: `market_rates(p_market_id, p_date, p_favourites)`,
`item_history(p_item_id, p_since)`, `item_summary(p_item_ids)`,
`data_status()`. The fetch job writes through `upsert_snapshot(...)`, which
only the service role can execute.

## Files

- `scraper.py` – fetch + parse the feed (`Rate` dataclass; handles `1,13,240` and `1,750-1,900`)
- `store.py` – Supabase writer (calls `upsert_snapshot`)
- `fetch.py` – one fetch-and-store run
- `backfill.py` – Internet Archive backfill
- `migrate_sqlite.py` – one-off import from the old SQLite `market.db`
- `supabase/migrations/` – schema, RLS, RPCs
- `web/` – the site (`index.html`, `config.js`)
- `.github/workflows/fetch.yml` – scheduled fetch
