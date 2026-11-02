-- Deep freeze database setup. Paste all of this into the Supabase SQL Editor
-- once, on a new project. Generated from supabase/migrations, so edit those instead.

-- 0001_profiles.sql

-- Display names for "last changed by" and the member list.
-- Other people's emails in auth.users can't be read from the app, on purpose.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Milestone 2 widens reading to people in the same household.
create policy "read own profile" on public.profiles
  for select to authenticated
  using (id = auth.uid());

create policy "update own profile" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Every new user gets a profile named after the first part of their email.
create function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(split_part(new.email, '@', 1), 'Someone'));
  return new;
end;
$$;

revoke execute on function public.create_profile_for_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.create_profile_for_new_user();

-- 0002_households.sql

-- Households, members, invites, and the abuse limits the server enforces.
-- Tables are read directly, but membership changes only happen through the
-- functions below, so their rules can't be skipped.

-- The limits live here because limits in the app could be bypassed.
-- To change one, update this row in the Supabase Table Editor.
create table public.app_limits (
  id boolean primary key default true check (id),
  max_items_per_household int not null default 500,
  max_invites_per_hour int not null default 10,
  invite_days int not null default 7,
  invite_max_uses int not null default 10
);
insert into public.app_limits default values;

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);
create index household_members_user_idx on public.household_members (user_id);

create table public.household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  code text not null unique,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  max_uses int not null,
  use_count int not null default 0,
  revoked_at timestamptz
);
create index household_invites_household_idx on public.household_invites (household_id);
create index household_invites_creator_idx on public.household_invites (created_by, created_at);

-- Helpers for the security rules. They live outside the public schema so they
-- can't be called through the API, and they run with elevated rights so that
-- checking membership doesn't trigger the membership rules in an endless loop.
create schema private;
grant usage on schema private to authenticated;

create function private.is_member(target uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.household_members
    where household_id = target and user_id = auth.uid()
  );
$$;

create function private.is_owner(target uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.household_members
    where household_id = target and user_id = auth.uid() and role = 'owner'
  );
$$;

create function private.shares_household(person uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.household_members mine
    join public.household_members theirs using (household_id)
    where mine.user_id = auth.uid() and theirs.user_id = person
  );
$$;

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

-- Row level security
alter table public.app_limits enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_invites enable row level security;

create policy "signed-in users read limits" on public.app_limits
  for select to authenticated using (true);

create policy "members read their household" on public.households
  for select to authenticated using (private.is_member(id));
create policy "owners rename their household" on public.households
  for update to authenticated
  using (private.is_owner(id)) with check (private.is_owner(id));
create policy "owners delete their household" on public.households
  for delete to authenticated using (private.is_owner(id));

create policy "members see each other" on public.household_members
  for select to authenticated using (private.is_member(household_id));

create policy "members see invites" on public.household_invites
  for select to authenticated using (private.is_member(household_id));

create policy "people in a household see each other's names" on public.profiles
  for select to authenticated using (private.shares_household(id));

revoke all on public.app_limits, public.households, public.household_members,
  public.household_invites, public.profiles from anon, authenticated;
grant select on public.app_limits, public.households, public.household_members,
  public.household_invites, public.profiles to authenticated;
grant update (name) on public.households to authenticated;
grant delete on public.households to authenticated;
grant update (display_name) on public.profiles to authenticated;

-- Household actions. Messages raised here are shown to people as written.
create function public.create_household(household_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  new_id uuid;
  clean_name text := btrim(household_name);
begin
  if not exists (
    select 1 from auth.users where id = auth.uid() and email_confirmed_at is not null
  ) then
    raise exception 'Confirm your email address before creating a household.';
  end if;
  if char_length(clean_name) not between 1 and 60 then
    raise exception 'Give your household a name of up to 60 characters.';
  end if;

  insert into public.households (name, created_by)
  values (clean_name, auth.uid())
  returning id into new_id;

  insert into public.household_members (household_id, user_id, role)
  values (new_id, auth.uid(), 'owner');

  return new_id;
end;
$$;

create function public.create_invite(target uuid)
returns public.household_invites language plpgsql security definer set search_path = '' as $$
declare
  limits public.app_limits;
  recent int;
  invite public.household_invites;
begin
  if not private.is_member(target) then
    raise exception 'You are not a member of this household.';
  end if;

  select * into limits from public.app_limits;
  select count(*) into recent from public.household_invites
  where created_by = auth.uid() and created_at > now() - interval '1 hour';
  if recent >= limits.max_invites_per_hour then
    raise exception 'That''s a lot of invites in one hour. Try again later.';
  end if;

  insert into public.household_invites (household_id, code, created_by, expires_at, max_uses)
  values (
    target,
    substr(replace(gen_random_uuid()::text, '-', ''), 1, 20),
    auth.uid(),
    now() + make_interval(days => limits.invite_days),
    limits.invite_max_uses
  )
  returning * into invite;

  return invite;
end;
$$;

-- Finds a usable invite, or explains why it can't be used.
create function private.usable_invite(invite_code text)
returns public.household_invites language plpgsql security definer set search_path = '' as $$
declare
  invite public.household_invites;
begin
  select * into invite from public.household_invites
  where code = lower(btrim(invite_code))
  for update;

  if not found then
    raise exception 'That invite code wasn''t found. Check it, or ask for a new one.';
  elsif invite.revoked_at is not null then
    raise exception 'This invite was cancelled. Ask for a new one.';
  elsif invite.expires_at < now() then
    raise exception 'This invite has expired. Ask for a new one.';
  elsif invite.use_count >= invite.max_uses then
    raise exception 'This invite has been used too many times. Ask for a new one.';
  end if;

  return invite;
end;
$$;

revoke execute on function private.usable_invite(text) from public, anon, authenticated;

create function public.preview_invite(invite_code text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  invite public.household_invites := private.usable_invite(invite_code);
begin
  return (select name from public.households where id = invite.household_id);
end;
$$;

create function public.join_household(invite_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  invite public.household_invites := private.usable_invite(invite_code);
begin
  if auth.uid() is null then
    raise exception 'Sign in to join a household.';
  end if;

  if not private.is_member(invite.household_id) then
    insert into public.household_members (household_id, user_id)
    values (invite.household_id, auth.uid());

    update public.household_invites set use_count = use_count + 1 where id = invite.id;
  end if;

  return invite.household_id;
end;
$$;

create function public.revoke_invite(invite_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  target uuid;
begin
  select household_id into target from public.household_invites where id = invite_id;
  if target is null or not private.is_owner(target) then
    raise exception 'Only the household owner can cancel invites.';
  end if;

  update public.household_invites set revoked_at = now()
  where id = invite_id and revoked_at is null;
end;
$$;

create function public.remove_member(target uuid, member uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_owner(target) then
    raise exception 'Only the household owner can remove people.';
  end if;
  if member = auth.uid() then
    raise exception 'You can''t remove yourself. Use Leave household instead.';
  end if;

  delete from public.household_members where household_id = target and user_id = member;
end;
$$;

create function public.leave_household(target uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  next_owner uuid;
begin
  if not private.is_member(target) then
    raise exception 'You are not a member of this household.';
  end if;

  select user_id into next_owner from public.household_members
  where household_id = target and user_id <> auth.uid()
  order by joined_at
  limit 1;

  if next_owner is null then
    raise exception 'You''re the only member. Delete the household instead.';
  end if;

  -- A household always keeps an owner: the longest-standing member takes over.
  if private.is_owner(target) then
    update public.household_members set role = 'owner'
    where household_id = target and user_id = next_owner;
  end if;

  delete from public.household_members where household_id = target and user_id = auth.uid();
end;
$$;

revoke execute on function
  public.create_household(text),
  public.create_invite(uuid),
  public.preview_invite(text),
  public.join_household(text),
  public.revoke_invite(uuid),
  public.remove_member(uuid, uuid),
  public.leave_household(uuid)
from public, anon;

grant execute on function
  public.create_household(text),
  public.create_invite(uuid),
  public.preview_invite(text),
  public.join_household(text),
  public.revoke_invite(uuid),
  public.remove_member(uuid, uuid),
  public.leave_household(uuid)
to authenticated;

-- 0003_inventory.sql

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

-- 0004_storage.sql

-- Private photo storage. Every photo lives under its household's id,
-- for example {household_id}/{item_id}.jpg, and only members can reach it.
-- The bucket rejects anything that isn't a JPEG of 5 MB or less.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('item-photos', 'item-photos', false, 5242880, array['image/jpeg']);

-- Reads the household out of a path. A malformed path simply belongs to nobody.
create function private.is_member_of_path(path text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  folder text := split_part(path, '/', 1);
begin
  if folder !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return private.is_member(folder::uuid);
end;
$$;

revoke execute on function private.is_member_of_path(text) from public, anon;
grant execute on function private.is_member_of_path(text) to authenticated;

create policy "members read photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'item-photos' and private.is_member_of_path(name));

create policy "members add photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'item-photos' and private.is_member_of_path(name));

create policy "members replace photos" on storage.objects
  for update to authenticated
  using (bucket_id = 'item-photos' and private.is_member_of_path(name))
  with check (bucket_id = 'item-photos' and private.is_member_of_path(name));

create policy "members remove photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'item-photos' and private.is_member_of_path(name));

-- 0005_item_rules.sql

-- Item rules that must hold however an item is changed: running out and coming
-- back sets out_at, and every change lands in the event log.

create or replace function private.stamp_item()
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
    new.out_at := case when new.quantity = 0 then coalesce(new.out_at, now()) end;
  else
    if new.household_id <> old.household_id then
      raise exception 'Items can''t move between households.';
    end if;
    if new.quantity > 0 then
      new.out_at := null;
    elsif old.quantity > 0 then
      new.out_at := now();
    else
      new.out_at := old.out_at;
    end if;
  end if;

  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

create function private.log_item_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  event_type text := 'change';
  change int := new.quantity;
begin
  if tg_op = 'INSERT' then
    event_type := 'add';
  else
    change := new.quantity - old.quantity;
    if new.deleted_at is not null and old.deleted_at is null then
      event_type := 'delete';
    elsif new.deleted_at is null and old.deleted_at is not null then
      event_type := 'restore';
    elsif new.added_at <> old.added_at then
      event_type := 'restock';
    end if;
  end if;

  insert into public.item_events (household_id, item_id, user_id, delta, type)
  values (new.household_id, new.id, auth.uid(), change, event_type);
  return null;
end;
$$;

revoke execute on function private.log_item_event() from public, anon, authenticated;

create trigger log_item_event
  after insert or update on public.items
  for each row execute function private.log_item_event();

-- Adds to the current quantity instead of overwriting it, so two people tapping
-- at the same moment both count. Runs as the caller, so the item rules apply.
create function public.adjust_quantity(item_id uuid, change int)
returns void language plpgsql set search_path = '' as $$
begin
  update public.items
  set quantity = greatest(quantity + change, 0)
  where id = item_id and deleted_at is null;

  if not found then
    raise exception 'That item is no longer in the freezer. Reload to see the latest list.';
  end if;
end;
$$;

revoke execute on function public.adjust_quantity(uuid, int) from public, anon;
grant execute on function public.adjust_quantity(uuid, int) to authenticated;

-- 0006_purge_deleted_items.sql

-- Deleted items stay recoverable for a while, then go for good. The app runs
-- this when a member opens a household, after removing the photos itself, so
-- private copies need no scheduled job.

alter table public.app_limits add column deleted_item_days int not null default 30;

create function public.purge_deleted_items(target uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_member(target) then
    raise exception 'You are not a member of this household.';
  end if;

  delete from public.items
  where household_id = target
    and deleted_at < now() - make_interval(days => (
      select deleted_item_days from public.app_limits
    ));
end;
$$;

revoke execute on function public.purge_deleted_items(uuid) from public, anon;
grant execute on function public.purge_deleted_items(uuid) to authenticated;

-- 0007_realtime.sql

-- Sends item changes to open apps. Each person still only receives rows the
-- security rules on public.items let them read.

alter publication supabase_realtime add table public.items;

-- 0008_profile_names.sql

-- People choose their own name. Until they do, they keep the name made from
-- their email, and name_chosen tells the app to offer them the choice.

alter table public.profiles
  add column name_chosen boolean not null default false,
  add constraint display_name_length check (char_length(display_name) between 1 and 40);

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(left(split_part(new.email, '@', 1), 40), ''), 'Someone'));
  return new;
end;
$$;

-- Names now only change through this function, which can only touch your own.
drop policy "update own profile" on public.profiles;
revoke update on public.profiles from authenticated;

create function public.set_display_name(new_name text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  clean_name text := btrim(new_name);
begin
  if auth.uid() is null then
    raise exception 'Sign in to change your name.';
  end if;
  if coalesce(char_length(clean_name), 0) not between 1 and 40 then
    raise exception 'Enter a name of up to 40 characters.';
  end if;

  update public.profiles
  set display_name = clean_name, name_chosen = true
  where id = auth.uid();
end;
$$;

revoke execute on function public.set_display_name(text) from public, anon;
grant execute on function public.set_display_name(text) to authenticated;

-- 0009_restore_and_account.sql

-- Backups and leaving for good.

-- Restored items get a new id, because an id can only exist once across all
-- households. This remembers the original, so restoring twice adds nothing.
alter table public.items add column restored_from uuid;
create unique index items_restored_from_idx
  on public.items (household_id, restored_from)
  where restored_from is not null;

-- Runs as the caller, so the normal security rules and item cap all apply.
-- With dry_run it only counts, which is how the app shows its preview.
create function public.restore_items(target uuid, rows jsonb, dry_run boolean default false)
returns jsonb language plpgsql set search_path = '' as $$
declare
  entry jsonb;
  original uuid;
  source uuid;
  existing public.items;
  added int := 0;
  brought_back int := 0;
  skipped int := 0;
begin
  if not private.is_member(target) then
    raise exception 'You are not a member of this household.';
  end if;

  for entry in select * from jsonb_array_elements(rows) loop
    original := (entry ->> 'id')::uuid;
    source := coalesce((entry ->> 'restored_from')::uuid, original);

    select * into existing from public.items
    where household_id = target
      and (id in (original, source) or restored_from = source)
    limit 1;

    if not found then
      added := added + 1;
      if not dry_run then
        insert into public.items (
          household_id, name, quantity, category, location, notes,
          photo_path, added_at, out_at, restored_from
        ) values (
          target,
          entry ->> 'name',
          (entry ->> 'quantity')::int,
          entry ->> 'category',
          entry ->> 'location',
          entry ->> 'notes',
          case when entry ->> 'photo_path' like target::text || '/%'
            then entry ->> 'photo_path' end,
          (entry ->> 'added_at')::timestamptz,
          (entry ->> 'out_at')::timestamptz,
          source
        );
      end if;
    elsif existing.deleted_at is not null then
      brought_back := brought_back + 1;
      if not dry_run then
        update public.items set deleted_at = null where id = existing.id;
      end if;
    else
      skipped := skipped + 1;
    end if;
  end loop;

  return jsonb_build_object('added', added, 'broughtBack', brought_back, 'skipped', skipped);
end;
$$;

revoke execute on function public.restore_items(uuid, jsonb, boolean) from public, anon;
grant execute on function public.restore_items(uuid, jsonb, boolean) to authenticated;

-- Deletes the caller's account. Households they were alone in go with it;
-- shared ones carry on, and a new owner takes over where needed. The app
-- removes the photos of those households first, because a database function
-- can't reach stored files.
create function public.delete_my_account()
returns void language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Sign in to delete your account.';
  end if;

  delete from public.households h
  where exists (
    select 1 from public.household_members
    where household_id = h.id and user_id = me
  ) and not exists (
    select 1 from public.household_members
    where household_id = h.id and user_id <> me
  );

  update public.household_members m
  set role = 'owner'
  where m.user_id = (
    select other.user_id from public.household_members other
    where other.household_id = m.household_id and other.user_id <> me
    order by other.joined_at
    limit 1
  )
  and exists (
    select 1 from public.household_members mine
    where mine.household_id = m.household_id and mine.user_id = me and mine.role = 'owner'
  );

  delete from auth.users where id = me;
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- 0010_ignore_cascades_on_items.sql

-- Deleting an account blanks that person from the items they touched. The
-- database does that through a cascade, which isn't anyone editing the item, so
-- it must not stamp the item or add to its history. A cascade runs inside
-- another trigger, which is what pg_trigger_depth reveals.

create or replace function private.stamp_item()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  cap int;
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if tg_op = 'INSERT' then
    select max_items_per_household into cap from public.app_limits;
    if (
      select count(*) from public.items
      where household_id = new.household_id and deleted_at is null
    ) >= cap then
      raise exception 'This freezer has reached its limit of % items.', cap;
    end if;
    new.created_by := auth.uid();
    new.out_at := case when new.quantity = 0 then coalesce(new.out_at, now()) end;
  else
    if new.household_id <> old.household_id then
      raise exception 'Items can''t move between households.';
    end if;
    if new.quantity > 0 then
      new.out_at := null;
    elsif old.quantity > 0 then
      new.out_at := now();
    else
      new.out_at := old.out_at;
    end if;
  end if;

  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.log_item_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  event_type text := 'change';
  change int := new.quantity;
begin
  -- This trigger runs after the cascade has finished, so depth can't identify
  -- it. Nothing but the record of who touched the item changed, so it's no edit.
  if tg_op = 'UPDATE' and
    to_jsonb(new) - 'created_by' - 'updated_by' - 'updated_at' =
    to_jsonb(old) - 'created_by' - 'updated_by' - 'updated_at'
  then
    return null;
  end if;

  if tg_op = 'INSERT' then
    event_type := 'add';
  else
    change := new.quantity - old.quantity;
    if new.deleted_at is not null and old.deleted_at is null then
      event_type := 'delete';
    elsif new.deleted_at is null and old.deleted_at is not null then
      event_type := 'restore';
    elsif new.added_at <> old.added_at then
      event_type := 'restock';
    end if;
  end if;

  insert into public.item_events (household_id, item_id, user_id, delta, type)
  values (new.household_id, new.id, auth.uid(), change, event_type);
  return null;
end;
$$;

-- 0011_speed_tidying.sql

-- Small speed improvements suggested by Supabase's database advisor.

-- One rule instead of two, and auth.uid() is read once rather than per row.
drop policy "read own profile" on public.profiles;
drop policy "people in a household see each other's names" on public.profiles;
create policy "people see their own name and their household's" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or private.shares_household(id));

-- Keeps account deletion quick as these tables grow.
create index households_created_by_idx on public.households (created_by);
create index items_created_by_idx on public.items (created_by);
create index items_updated_by_idx on public.items (updated_by);
create index item_events_user_idx on public.item_events (user_id);
