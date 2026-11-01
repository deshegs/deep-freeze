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
