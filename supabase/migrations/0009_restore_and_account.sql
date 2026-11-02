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
