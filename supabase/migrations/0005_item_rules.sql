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
