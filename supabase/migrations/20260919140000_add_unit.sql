-- Show a ₹/kg equivalent alongside the printed ₹/quintal rate for commodities
-- confirmed to be quoted per quintal (arecanut, copra, pepper, coconut oil,
-- rubber, rice, sugar, turmeric, dry ginger, cashew, cocoa, coir, nux vomica,
-- paddy, coffee - see scraper.classify_unit for how each item is judged).
-- Defaults to 'other' (no conversion shown) until fetch.py next runs and
-- classifies every currently-active item from real data; that is the safe
-- state, not a broken one - no ₹/kg line is better than a wrong one.
alter table public.items add column unit text not null default 'other';

-- ---------------------------------------------------------------- write RPC

create or replace function public.upsert_snapshot(p_markets jsonb, p_items jsonb, p_rates jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    n integer;
begin
    insert into markets (id, name, name_ml, rank, last_seen)
    select (m->>'id')::int, m->>'name', coalesce(m->>'name_ml', ''),
           coalesce((m->>'rank')::int, 0), (m->>'last_seen')::date
    from jsonb_array_elements(p_markets) m
    on conflict (id) do update set
        name      = case when excluded.last_seen >= markets.last_seen and excluded.name <> ''
                         then excluded.name else markets.name end,
        name_ml   = case when excluded.last_seen >= markets.last_seen and excluded.name_ml <> ''
                         then excluded.name_ml else markets.name_ml end,
        rank      = case when excluded.last_seen >= markets.last_seen
                         then excluded.rank else markets.rank end,
        last_seen = greatest(markets.last_seen, excluded.last_seen);

    insert into items (id, market_id, section, section_ml, name, name_ml, unit, last_seen)
    select (i->>'id')::int, (i->>'market_id')::int, coalesce(i->>'section', ''),
           coalesce(i->>'section_ml', ''), coalesce(i->>'name', ''), coalesce(i->>'name_ml', ''),
           coalesce(i->>'unit', 'other'), (i->>'last_seen')::date
    from jsonb_array_elements(p_items) i
    on conflict (id) do update set
        market_id  = case when excluded.last_seen >= items.last_seen
                          then excluded.market_id else items.market_id end,
        section    = case when excluded.last_seen >= items.last_seen and excluded.section <> ''
                          then excluded.section else items.section end,
        section_ml = case when excluded.last_seen >= items.last_seen and excluded.section_ml <> ''
                          then excluded.section_ml else items.section_ml end,
        name       = case when excluded.last_seen >= items.last_seen and excluded.name <> ''
                          then excluded.name else items.name end,
        name_ml    = case when excluded.last_seen >= items.last_seen and excluded.name_ml <> ''
                          then excluded.name_ml else items.name_ml end,
        -- unit is a pure function of identity (name/section/market), not a
        -- day-to-day fact, so the newest classification always wins outright.
        unit       = case when excluded.last_seen >= items.last_seen
                          then excluded.unit else items.unit end,
        last_seen  = greatest(items.last_seen, excluded.last_seen);

    insert into rates (date, item_id, price_low, price_high, raw)
    select (r->>'date')::date, (r->>'item_id')::int, (r->>'price_low')::numeric,
           (r->>'price_high')::numeric, coalesce(r->>'raw', '')
    from jsonb_array_elements(p_rates) r
    on conflict (date, item_id) do update set
        price_low  = excluded.price_low,
        price_high = excluded.price_high,
        raw        = excluded.raw;
    get diagnostics n = row_count;
    return n;
end;
$$;

revoke execute on function public.upsert_snapshot(jsonb, jsonb, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------- read RPCs

-- Both functions gain a new `unit` output column, which CREATE OR REPLACE
-- cannot do to an existing function (Postgres requires the OUT-parameter
-- list to match) - drop first.
drop function if exists public.market_rates(integer, date, boolean);
drop function if exists public.item_summary(integer[]);

create or replace function public.market_rates(
    p_market_id  integer default null,
    p_date       date    default null,
    p_favourites boolean default false
)
returns table (
    item_id     integer,
    market_id   integer,
    market      text,
    section     text,
    section_ml  text,
    name        text,
    name_ml     text,
    unit        text,
    price_low   numeric,
    price_high  numeric,
    raw         text,
    prev_date   date,
    prev_low    numeric,
    change      numeric,
    fav_section boolean,
    fav_item    boolean
)
language sql
stable
security invoker
set search_path = public
as $$
    with params as (
        select coalesce(p_date, (select max(date) from rates)) as on_date
    ),
    scope as (
        select i.*, m.name as market_name, m.rank as market_rank,
               exists (select 1 from favourite_sections fs
                       where fs.user_id = auth.uid() and fs.market_id = i.market_id and fs.section = i.section) as fav_section,
               exists (select 1 from favourite_items fi
                       where fi.user_id = auth.uid() and fi.item_id = i.id) as fav_item
        from items i
        join markets m on m.id = i.market_id
    ),
    chosen as (
        select * from scope s
        where (not p_favourites and s.market_id = p_market_id)
           or (p_favourites and (s.fav_item or s.fav_section))
    ),
    prev as (
        select max(r.date) as d
        from rates r join chosen c on c.id = r.item_id, params
        where r.date < params.on_date
    )
    select c.id, c.market_id, c.market_name, c.section, c.section_ml, c.name, c.name_ml, c.unit,
           r.price_low, r.price_high, r.raw,
           prev.d, p.price_low,
           case when r.price_low is not null and p.price_low is not null
                then r.price_low - p.price_low end,
           c.fav_section, c.fav_item
    from chosen c
    cross join params
    cross join prev
    join rates r on r.item_id = c.id and r.date = params.on_date
    left join rates p on p.item_id = c.id and p.date = prev.d
    order by c.fav_item desc, c.fav_section desc, c.market_rank,
             (select min(x.id) from items x where x.market_id = c.market_id and x.section = c.section),
             c.id;
$$;

create or replace function public.item_summary(p_item_ids integer[])
returns table (
    item_id    integer,
    market     text,
    section    text,
    name       text,
    name_ml    text,
    unit       text,
    date       date,
    price_low  numeric,
    price_high numeric,
    prev_date  date,
    change     numeric
)
language sql
stable
security invoker
set search_path = public
as $$
    select i.id, m.name, i.section, i.name, i.name_ml, i.unit,
           cur.date, cur.price_low, cur.price_high,
           prev.date, cur.price_low - prev.price_low
    from unnest(p_item_ids) with ordinality as u(id, ord)
    join items i on i.id = u.id
    join markets m on m.id = i.market_id
    left join lateral (select date, price_low, price_high from rates
                       where item_id = i.id and price_low is not null
                       order by date desc limit 1) cur on true
    left join lateral (select date, price_low from rates
                       where item_id = i.id and price_low is not null and date < cur.date
                       order by date desc limit 1) prev on true
    order by u.ord;
$$;
