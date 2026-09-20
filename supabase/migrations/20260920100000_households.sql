-- Households: a user with more than one house or farm keeps each one's sales
-- apart. A ledger entry may belong to one household or to none. Deleting a
-- household keeps its entries (they become unassigned) - the record is the
-- valuable part, the grouping is not.

create table if not exists public.households (
    id         bigint generated always as identity primary key,
    user_id    uuid not null references auth.users(id) on delete cascade,
    name       text not null check (length(trim(name)) between 1 and 60),
    created_at timestamptz not null default now()
);
create index if not exists households_user on public.households(user_id, id);

alter table public.households enable row level security;
drop policy if exists "own households" on public.households;
create policy "own households" on public.households for all to authenticated
    using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.ledger_entries
    add column if not exists household_id bigint references public.households(id) on delete set null;
create index if not exists ledger_entries_household on public.ledger_entries(household_id);
