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
