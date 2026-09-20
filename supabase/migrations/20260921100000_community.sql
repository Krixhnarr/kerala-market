-- Community shop rates.
--
-- The feed's markets/items/rates are FARM-GATE prices (what traders pay
-- farmers), scraped daily. This adds a second, independent source: shopkeepers
-- in named local markets (Velayil, Palayam, ...) post the SHOP price buyers pay.
-- Shops are never shown to buyers; the market is the unit. A market's rate for
-- an item on a day is the median of the latest post per approved shop:
--   n >= 2 shops  -> published automatically
--   n == 1        -> held as 'pending' until the admin approves it
-- Nothing here touches the feed tables.

-- ---- roles -------------------------------------------------------------
create table if not exists public.profiles (
    user_id    uuid primary key references auth.users(id) on delete cascade,
    role       text not null default 'buyer' check (role in ('buyer', 'seller', 'admin')),
    created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles for select to authenticated using (auth.uid() = user_id);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin') $$;

-- Every new auth user gets a buyer profile.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
    insert into public.profiles (user_id) values (new.id) on conflict do nothing;
    return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
insert into public.profiles (user_id) select id from auth.users on conflict do nothing;

drop policy if exists "admin manages profiles" on public.profiles;
create policy "admin manages profiles" on public.profiles for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---- reference lists (admin-curated, readable by all) --------------------
create table if not exists public.community_markets (
    id         bigint generated always as identity primary key,
    district   text not null,
    name       text not null,
    name_ml    text not null default '',
    active     boolean not null default true,
    created_at timestamptz not null default now(),
    unique (district, name)
);
create table if not exists public.community_items (
    id         bigint generated always as identity primary key,
    name       text not null unique,
    name_ml    text not null default '',
    unit       text not null default 'kg',          -- printed as ₹/<unit>
    sort       integer not null default 100,
    active     boolean not null default true
);
alter table public.community_markets enable row level security;
alter table public.community_items enable row level security;
drop policy if exists "markets readable" on public.community_markets;
create policy "markets readable" on public.community_markets for select to anon, authenticated using (true);
drop policy if exists "items readable" on public.community_items;
create policy "items readable" on public.community_items for select to anon, authenticated using (true);
drop policy if exists "admin edits markets" on public.community_markets;
create policy "admin edits markets" on public.community_markets for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin edits items" on public.community_items;
create policy "admin edits items" on public.community_items for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---- shops (private: only the owner and the admin) ----------------------
create table if not exists public.shops (
    id            bigint generated always as identity primary key,
    user_id       uuid not null references auth.users(id) on delete cascade,
    market_id     bigint not null references public.community_markets(id),
    name          text not null check (length(trim(name)) between 2 and 80),
    phone         text not null default '',
    status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
    reject_reason text not null default '',
    created_at    timestamptz not null default now(),
    reviewed_at   timestamptz,
    unique (user_id)                                  -- one shop per account
);
alter table public.shops enable row level security;
drop policy if exists "own shop read" on public.shops;
create policy "own shop read" on public.shops for select to authenticated using (auth.uid() = user_id or public.is_admin());
drop policy if exists "apply for shop" on public.shops;
create policy "apply for shop" on public.shops for insert to authenticated with check (auth.uid() = user_id and status = 'pending');
drop policy if exists "admin reviews shops" on public.shops;
create policy "admin reviews shops" on public.shops for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---- posts -------------------------------------------------------------
create table if not exists public.shop_rates (
    id            bigint generated always as identity primary key,
    shop_id       bigint not null references public.shops(id) on delete cascade,
    item_id       bigint not null references public.community_items(id),
    side          text not null default 'retail' check (side in ('retail', 'farmgate')),
    price         numeric not null check (price > 0),
    rate_date     date not null default current_date,
    posted_at     timestamptz not null default now(),
    status        text not null default 'pending' check (status in ('pending', 'published', 'rejected')),
    reject_reason text not null default '',
    reviewed_at   timestamptz
);
create index if not exists shop_rates_lookup on public.shop_rates(item_id, side, rate_date desc, shop_id, posted_at desc);
create index if not exists shop_rates_shop on public.shop_rates(shop_id, rate_date desc);
alter table public.shop_rates enable row level security;
drop policy if exists "own posts read" on public.shop_rates;
create policy "own posts read" on public.shop_rates for select to authenticated
    using (public.is_admin() or exists (select 1 from public.shops s where s.id = shop_id and s.user_id = auth.uid()));
drop policy if exists "approved shop posts" on public.shop_rates;
create policy "approved shop posts" on public.shop_rates for insert to authenticated
    with check (status = 'pending' and exists (select 1 from public.shops s where s.id = shop_id and s.user_id = auth.uid() and s.status = 'approved'));
drop policy if exists "admin reviews posts" on public.shop_rates;
create policy "admin reviews posts" on public.shop_rates for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Latest post per shop for a (market, item, side, day). Only approved shops count.
create or replace view public.shop_rates_latest as
select distinct on (s.market_id, r.item_id, r.side, r.rate_date, r.shop_id)
       s.market_id, r.item_id, r.side, r.rate_date, r.shop_id, r.id, r.price, r.status, r.posted_at
from public.shop_rates r
join public.shops s on s.id = r.shop_id and s.status = 'approved'
where r.status <> 'rejected'
order by s.market_id, r.item_id, r.side, r.rate_date, r.shop_id, r.posted_at desc;

-- Two or more approved shops agree a rate exists -> publish all their pending posts.
create or replace function public.autopublish_rates() returns trigger
language plpgsql security definer set search_path = public as $$
declare mkt bigint; n integer;
begin
    select market_id into mkt from public.shops where id = new.shop_id and status = 'approved';
    if mkt is null then return new; end if;
    select count(distinct shop_id) into n from public.shop_rates_latest
     where market_id = mkt and item_id = new.item_id and side = new.side and rate_date = new.rate_date;
    if n >= 2 then
        update public.shop_rates r set status = 'published'
          from public.shops s
         where r.shop_id = s.id and s.market_id = mkt and s.status = 'approved'
           and r.item_id = new.item_id and r.side = new.side and r.rate_date = new.rate_date and r.status = 'pending';
    end if;
    return new;
end $$;
drop trigger if exists shop_rates_autopublish on public.shop_rates;
create trigger shop_rates_autopublish after insert on public.shop_rates for each row execute function public.autopublish_rates();

-- ---- what buyers see ---------------------------------------------------
-- Median of published posts per (market, item, side, day) with source count and spread.
create or replace view public.community_rates as
select market_id, item_id, side, rate_date,
       percentile_cont(0.5) within group (order by price) as price,
       min(price) as price_min, max(price) as price_max,
       count(*)::integer as n_shops, max(posted_at) as posted_at
from public.shop_rates_latest
where status = 'published'
group by market_id, item_id, side, rate_date;

-- Latest day per item for one market (or all markets when null), for the buyer list / compare screen.
create or replace function public.community_market_rates(p_market_id bigint default null)
returns table (
    market_id bigint, market text, district text,
    item_id bigint, item text, item_ml text, unit text, side text,
    rate_date date, price numeric, price_min numeric, price_max numeric, n_shops integer, posted_at timestamptz,
    prev_price numeric
)
language sql stable security definer set search_path = public as $$
    with latest as (
        select distinct on (market_id, item_id, side) *
        from public.community_rates
        where p_market_id is null or market_id = p_market_id
        order by market_id, item_id, side, rate_date desc
    )
    select l.market_id, m.name, m.district, l.item_id, i.name, i.name_ml, i.unit, l.side,
           l.rate_date, l.price, l.price_min, l.price_max, l.n_shops, l.posted_at,
           (select c.price from public.community_rates c
             where c.market_id = l.market_id and c.item_id = l.item_id and c.side = l.side and c.rate_date < l.rate_date
             order by c.rate_date desc limit 1) as prev_price
    from latest l
    join public.community_markets m on m.id = l.market_id and m.active
    join public.community_items i on i.id = l.item_id
    order by m.district, m.name, i.sort, i.name, l.side;
$$;

create or replace function public.community_rate_history(p_market_id bigint, p_item_id bigint, p_side text default 'retail', p_since date default '1970-01-01')
returns table (rate_date date, price numeric, price_min numeric, price_max numeric, n_shops integer)
language sql stable security definer set search_path = public as $$
    select rate_date, price, price_min, price_max, n_shops from public.community_rates
    where market_id = p_market_id and item_id = p_item_id and side = p_side and rate_date >= p_since
    order by rate_date;
$$;

-- Admin queue: single-source posts awaiting a decision, and shop applications.
create or replace function public.admin_pending_rates()
returns table (id bigint, market text, district text, shop text, item text, item_ml text, unit text, side text, price numeric, rate_date date, posted_at timestamptz)
language sql stable security definer set search_path = public as $$
    select r.id, m.name, m.district, s.name, i.name, i.name_ml, i.unit, r.side, r.price, r.rate_date, r.posted_at
    from public.shop_rates r
    join public.shops s on s.id = r.shop_id
    join public.community_markets m on m.id = s.market_id
    join public.community_items i on i.id = r.item_id
    where public.is_admin() and r.status = 'pending' and s.status = 'approved'
    order by r.posted_at;
$$;

grant execute on function public.community_market_rates(bigint) to anon, authenticated;
grant execute on function public.community_rate_history(bigint, bigint, text, date) to anon, authenticated;
grant execute on function public.admin_pending_rates() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant select on public.community_rates to anon, authenticated;

-- ---- seed --------------------------------------------------------------
insert into public.community_markets (district, name, name_ml) values
    ('Kozhikode', 'Velayil', 'വെളയിൽ'),
    ('Kozhikode', 'Palayam', 'പാളയം')
on conflict do nothing;

insert into public.community_items (name, name_ml, unit, sort) values
    ('Arecanut', 'അടയ്ക്ക', 'kg', 10), ('Coconut', 'തേങ്ങ', 'kg', 11), ('Copra', 'കൊപ്ര', 'kg', 12),
    ('Coconut Oil', 'വെളിച്ചെണ്ണ', 'litre', 13), ('Pepper', 'കുരുമുളക്', 'kg', 14), ('Rubber', 'റബ്ബർ', 'kg', 15),
    ('Cardamom', 'ഏലം', 'kg', 16), ('Ginger', 'ഇഞ്ചി', 'kg', 17), ('Dry Ginger', 'ചുക്ക്', 'kg', 18),
    ('Turmeric', 'മഞ്ഞൾ', 'kg', 19), ('Nutmeg', 'ജാതിക്ക', 'kg', 20), ('Cashew', 'കശുവണ്ടി', 'kg', 21),
    ('Cocoa', 'കൊക്കോ', 'kg', 22), ('Coffee', 'കാപ്പി', 'kg', 23), ('Tapioca', 'കപ്പ', 'kg', 30),
    ('Banana (Nendran)', 'നേന്ത്രപ്പഴം', 'kg', 31), ('Rice', 'അരി', 'kg', 32), ('Onion', 'ഉള്ളി', 'kg', 40),
    ('Potato', 'ഉരുളക്കിഴങ്ങ്', 'kg', 41), ('Tomato', 'തക്കാളി', 'kg', 42), ('Egg', 'മുട്ട', 'piece', 50),
    ('Chicken', 'കോഴി', 'kg', 51), ('Gold', 'സ്വർണം', 'pavan', 60)
on conflict do nothing;

-- The app owner is the admin.
update public.profiles set role = 'admin'
 where user_id = (select id from auth.users where email = '03advaitk@gmail.com');
