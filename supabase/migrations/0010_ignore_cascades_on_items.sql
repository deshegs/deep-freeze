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
