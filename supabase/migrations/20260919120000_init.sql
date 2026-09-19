-- Kerala market rates: schema, row-level security and the RPCs the app uses.
--
-- Public data (markets, items, rates) is readable by everyone and written only
-- by the fetch job through upsert_snapshot() with the service-role key.
-- Favourites are per user: each row is owned by auth.uid() and RLS keeps them
-- private.

-- ---------------------------------------------------------------- tables

create table public.markets (
    id        integer primary key,                 -- Manorama's marketId
    name      text    not null,
    name_ml   text    not null default '',
    rank      integer not null default 0,
    last_seen date    not null default '1970-01-01'  -- newest feed that carried this market
);

create table public.items (
    id         integer primary key,                -- Manorama's itemId (stable across years)
    market_id  integer not null references public.markets(id),
    section    text    not null default '',
    section_ml text    not null default '',
    name       text    not null default '',
    name_ml    text    not null default '',
    last_seen  date    not null default '1970-01-01'
);
create index items_market on public.items(market_id);

create table public.rates (
    date       date    not null,
    item_id    integer not null references public.items(id),
    price_low  numeric,
    price_high numeric,
    raw        text    not null default '',
    primary key (date, item_id)
);
create index rates_item_date on public.rates(item_id, date);

create table public.fetch_log (
    id         bigint generated always as identity primary key,
    fetched_at timestamptz not null default now(),
    rate_date  date,
    rows       integer not null default 0,
    status     text    not null,
    message    text    not null default ''
);

create table public.favourite_markets (
    user_id   uuid    not null references auth.users(id) on delete cascade,
    market_id integer not null references public.markets(id) on delete cascade,
    primary key (user_id, market_id)
);

create table public.favourite_sections (
    user_id   uuid    not null references auth.users(id) on delete cascade,
    market_id integer not null references public.markets(id) on delete cascade,
    section   text    not null,
    primary key (user_id, market_id, section)
);

create table public.favourite_items (
    user_id uuid    not null references auth.users(id) on delete cascade,
    item_id integer not null references public.items(id) on delete cascade,
    primary key (user_id, item_id)
);

-- ---------------------------------------------------------------- RLS

alter table public.markets            enable row level security;
alter table public.items              enable row level security;
alter table public.rates              enable row level security;
alter table public.fetch_log          enable row level security;
alter table public.favourite_markets  enable row level security;
alter table public.favourite_sections enable row level security;
alter table public.favourite_items    enable row level security;

create policy "markets are public"   on public.markets   for select to anon, authenticated using (true);
create policy "items are public"     on public.items     for select to anon, authenticated using (true);
create policy "rates are public"     on public.rates     for select to anon, authenticated using (true);
create policy "fetch log is public"  on public.fetch_log for select to anon, authenticated using (true);
-- no insert/update/delete policies: only the service role (which bypasses RLS) writes these.

create policy "own favourite markets"  on public.favourite_markets  for all to authenticated
    using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own favourite sections" on public.favourite_sections for all to authenticated
    using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own favourite items"    on public.favourite_items    for all to authenticated
    using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------- write RPC (service role only)

-- One transactional upsert per fetched day. Metadata (names, sections, rank)
-- is only overwritten by data from the same day or newer and never by an
-- empty string, because archived feeds from 2025 lack the English names.
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

    insert into items (id, market_id, section, section_ml, name, name_ml, last_seen)
    select (i->>'id')::int, (i->>'market_id')::int, coalesce(i->>'section', ''),
           coalesce(i->>'section_ml', ''), coalesce(i->>'name', ''), coalesce(i->>'name_ml', ''),
           (i->>'last_seen')::date
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

-- Rates for one market on one day (default: latest), with the previous
-- available day's price for a change column. With p_favourites, the caller's
-- starred items and sections across all markets instead. Order: starred items,
-- starred sections, then feed order. Favourite flags are always for auth.uid().
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
    select c.id, c.market_id, c.market_name, c.section, c.section_ml, c.name, c.name_ml,
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

-- Price series for one item as a JSON array (one row, so PostgREST's row cap
-- never truncates a long history).
create or replace function public.item_history(p_item_id integer, p_since date default '1970-01-01')
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
    select coalesce(jsonb_agg(jsonb_build_object('date', date, 'price_low', price_low, 'price_high', price_high)
                              order by date), '[]'::jsonb)
    from rates
    where item_id = p_item_id and date >= p_since and price_low is not null;
$$;

-- Latest and previous price for a set of items (the dashboard tiles).
create or replace function public.item_summary(p_item_ids integer[])
returns table (
    item_id    integer,
    market     text,
    section    text,
    name       text,
    name_ml    text,
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
    select i.id, m.name, i.section, i.name, i.name_ml,
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

-- Data coverage for the status line.
create or replace function public.data_status()
returns table (latest_date date, first_date date, days bigint, last_fetch_at timestamptz, last_fetch_status text)
language sql
stable
security invoker
set search_path = public
as $$
    select (select max(date) from rates), (select min(date) from rates),
           (select count(distinct date) from rates),
           (select fetched_at from fetch_log order by id desc limit 1),
           (select status from fetch_log order by id desc limit 1);
$$;

-- Distinct dates with data (backfill uses it to skip what is already stored).
create or replace function public.stored_dates()
returns setof date
language sql
stable
security invoker
set search_path = public
as $$
    select distinct date from rates order by date;
$$;
