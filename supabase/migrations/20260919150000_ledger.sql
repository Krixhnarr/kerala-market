-- Personal sales ledger: each signed-in user can log their own transactions
-- ("sold 40kg arecanut for ₹14,400 on 19 Sep") for their own record-keeping.
-- Entirely private - RLS scopes every row to auth.uid(), same pattern as the
-- favourite_* tables. Not shown to, or aggregated across, other users.

create table public.ledger_entries (
    id          bigint generated always as identity primary key,
    user_id     uuid    not null references auth.users(id) on delete cascade,
    entry_date  date    not null default current_date,
    item_name   text    not null,
    item_id     integer references public.items(id) on delete set null,  -- optional link to a market item, for future "vs market rate" comparisons
    quantity_kg numeric not null check (quantity_kg > 0),
    amount      numeric not null check (amount >= 0),                    -- total rupees received
    note        text    not null default '',
    created_at  timestamptz not null default now()
);
create index ledger_entries_user_date on public.ledger_entries(user_id, entry_date desc, id desc);

alter table public.ledger_entries enable row level security;
create policy "own ledger entries" on public.ledger_entries for all to authenticated
    using (auth.uid() = user_id) with check (auth.uid() = user_id);
