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
