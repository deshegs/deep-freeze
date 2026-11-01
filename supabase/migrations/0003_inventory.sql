-- Items and their history. The screens arrive in milestone 3, but the tables
-- exist now so household privacy can be proven before anything is built on them.

create table public.items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  quantity int not null default 1 check (quantity >= 0),
  category text,
  location text,
  notes text,
  photo_path text check (photo_path is null or photo_path like household_id::text || '/%'),
  added_at timestamptz not null default now(),
  out_at timestamptz,
  deleted_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
create index items_household_idx on public.items (household_id);

create table public.item_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  delta int not null default 0,
  type text not null check (type in ('add', 'change', 'delete', 'restore', 'restock')),
  created_at timestamptz not null default now()
);
create index item_events_item_idx on public.item_events (item_id, created_at desc);
create index item_events_household_idx on public.item_events (household_id);

-- Records who changed an item, enforces the item cap, and keeps items in their household.
create function private.stamp_item()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  cap int;
begin
  if tg_op = 'INSERT' then
    select max_items_per_household into cap from public.app_limits;
    if (
      select count(*) from public.items
      where household_id = new.household_id and deleted_at is null
    ) >= cap then
      raise exception 'This freezer has reached its limit of % items.', cap;
    end if;
    new.created_by := auth.uid();
  elsif new.household_id <> old.household_id then
    raise exception 'Items can''t move between households.';
  end if;

  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function private.stamp_item() from public, anon, authenticated;

create trigger stamp_item
  before insert or update on public.items
  for each row execute function private.stamp_item();

alter table public.items enable row level security;
alter table public.item_events enable row level security;

create policy "members read items" on public.items
  for select to authenticated using (private.is_member(household_id));
create policy "members add items" on public.items
  for insert to authenticated with check (private.is_member(household_id));
create policy "members change items" on public.items
  for update to authenticated
  using (private.is_member(household_id)) with check (private.is_member(household_id));

create policy "members read events" on public.item_events
  for select to authenticated using (private.is_member(household_id));

revoke all on public.items, public.item_events from anon, authenticated;
grant select, insert, update on public.items to authenticated;
grant select on public.item_events to authenticated;
