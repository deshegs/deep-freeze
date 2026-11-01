-- Proves households can't reach each other's data, and that signed-out visitors
-- get nothing. To run it, paste this whole file into the Supabase SQL Editor.
--
-- It pretends to be four people: Ann and Al (household A), Bea (household B),
-- and Cy (no household). It always ends with an error reading either
-- "ALL n CHECKS PASSED" or a list of failures. That final error is deliberate:
-- it undoes everything, so none of the test data is ever saved.

begin;

create schema rls_test;
create table rls_test.results (label text, passed boolean, detail text);

-- Runs one statement as one person. 'none' means no row may be seen or changed,
-- whether the statement was blocked or simply found nothing. 'some' means at
-- least one row must be, which proves the check isn't passing by accident.
create function rls_test.expect(label text, who uuid, expected text, statement text)
returns void language plpgsql as $$
declare
  rows_touched int := 0;
  problem text;
begin
  perform set_config('role', case when who is null then 'anon' else 'authenticated' end, true);
  perform set_config('request.jwt.claims', json_build_object('sub', who)::text, true);
  begin
    execute statement;
    get diagnostics rows_touched = row_count;
  exception when others then
    problem := sqlerrm;
  end;
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);

  insert into rls_test.results values (
    label,
    case expected when 'none' then rows_touched = 0 else rows_touched > 0 end,
    format('touched %s row(s). %s', rows_touched, problem)
  );
end;
$$;

insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-4000-8000-0000000000a1', 'ann@rls.test', now()),
  ('00000000-0000-4000-8000-0000000000a2', 'al@rls.test', now()),
  ('00000000-0000-4000-8000-0000000000b1', 'bea@rls.test', now()),
  ('00000000-0000-4000-8000-0000000000c1', 'cy@rls.test', now());

insert into public.households (id, name) values
  ('aaaaaaaa-0000-4000-8000-000000000000', 'Household A'),
  ('bbbbbbbb-0000-4000-8000-000000000000', 'Household B');

insert into public.household_members (household_id, user_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000000', '00000000-0000-4000-8000-0000000000a1', 'owner'),
  ('aaaaaaaa-0000-4000-8000-000000000000', '00000000-0000-4000-8000-0000000000a2', 'member'),
  ('bbbbbbbb-0000-4000-8000-000000000000', '00000000-0000-4000-8000-0000000000b1', 'owner');

insert into public.household_invites (id, household_id, code, expires_at, max_uses) values
  ('aaaaaaaa-1111-4000-8000-000000000000', 'aaaaaaaa-0000-4000-8000-000000000000',
   'rlstestcodea', now() + interval '1 day', 5);

insert into public.items (id, household_id, name, photo_path) values
  ('aaaaaaaa-2222-4000-8000-000000000000', 'aaaaaaaa-0000-4000-8000-000000000000', 'Peas',
   'aaaaaaaa-0000-4000-8000-000000000000/peas.jpg');

insert into public.item_events (household_id, item_id, type) values
  ('aaaaaaaa-0000-4000-8000-000000000000', 'aaaaaaaa-2222-4000-8000-000000000000', 'add');

insert into storage.objects (bucket_id, name) values
  ('item-photos', 'aaaaaaaa-0000-4000-8000-000000000000/peas.jpg');

-- Shorthand for the people in the checks below
create function rls_test.ann() returns uuid language sql as $$ select '00000000-0000-4000-8000-0000000000a1'::uuid $$;
create function rls_test.al() returns uuid language sql as $$ select '00000000-0000-4000-8000-0000000000a2'::uuid $$;
create function rls_test.bea() returns uuid language sql as $$ select '00000000-0000-4000-8000-0000000000b1'::uuid $$;
create function rls_test.cy() returns uuid language sql as $$ select '00000000-0000-4000-8000-0000000000c1'::uuid $$;

-- Members can reach their own household
select rls_test.expect('Ann sees her household', rls_test.ann(), 'some', 'select * from public.households');
select rls_test.expect('Ann sees her items', rls_test.ann(), 'some', 'select * from public.items');
select rls_test.expect('Al sees shared items', rls_test.al(), 'some', 'select * from public.items');
select rls_test.expect('Ann sees events', rls_test.ann(), 'some', 'select * from public.item_events');
select rls_test.expect('Ann sees invites', rls_test.ann(), 'some', 'select * from public.household_invites');
select rls_test.expect('Ann sees photos', rls_test.ann(), 'some', $q$select * from storage.objects where bucket_id = 'item-photos'$q$);
select rls_test.expect('Ann sees Al''s name', rls_test.ann(), 'some', $q$select * from public.profiles where id = '00000000-0000-4000-8000-0000000000a2'$q$);
select rls_test.expect('Al adds an item', rls_test.al(), 'some', $q$insert into public.items (household_id, name) values ('aaaaaaaa-0000-4000-8000-000000000000', 'Soup')$q$);
select rls_test.expect('Al changes a quantity', rls_test.al(), 'some', $q$select public.adjust_quantity('aaaaaaaa-2222-4000-8000-000000000000', 1)$q$);
select rls_test.expect('Al changes an item', rls_test.al(), 'some', $q$update public.items set quantity = 2 where name = 'Peas'$q$);
select rls_test.expect('Al adds a photo', rls_test.al(), 'some', $q$insert into storage.objects (bucket_id, name) values ('item-photos', 'aaaaaaaa-0000-4000-8000-000000000000/soup.jpg')$q$);

-- Bea, in another household, can't read household A
select rls_test.expect('Bea can''t read A', rls_test.bea(), 'none', $q$select * from public.households where id = 'aaaaaaaa-0000-4000-8000-000000000000'$q$);
select rls_test.expect('Bea can''t read A''s members', rls_test.bea(), 'none', $q$select * from public.household_members where household_id = 'aaaaaaaa-0000-4000-8000-000000000000'$q$);
select rls_test.expect('Bea can''t read A''s items', rls_test.bea(), 'none', 'select * from public.items');
select rls_test.expect('Bea can''t read A''s events', rls_test.bea(), 'none', 'select * from public.item_events');
select rls_test.expect('Bea can''t read A''s invites', rls_test.bea(), 'none', 'select * from public.household_invites');
select rls_test.expect('Bea can''t read A''s photos', rls_test.bea(), 'none', $q$select * from storage.objects where bucket_id = 'item-photos'$q$);
select rls_test.expect('Bea can''t read Ann''s name', rls_test.bea(), 'none', $q$select * from public.profiles where id = '00000000-0000-4000-8000-0000000000a1'$q$);

-- Bea can't write to household A
select rls_test.expect('Bea can''t add to A', rls_test.bea(), 'none', $q$insert into public.items (household_id, name) values ('aaaaaaaa-0000-4000-8000-000000000000', 'Spy')$q$);
select rls_test.expect('Bea can''t change A''s items', rls_test.bea(), 'none', $q$update public.items set name = 'Spy'$q$);
select rls_test.expect('Bea can''t delete A''s items', rls_test.bea(), 'none', 'delete from public.items');
select rls_test.expect('Bea can''t change A''s quantity', rls_test.bea(), 'none', $q$select public.adjust_quantity('aaaaaaaa-2222-4000-8000-000000000000', -1)$q$);
select rls_test.expect('Bea can''t purge A''s items', rls_test.bea(), 'none', $q$select public.purge_deleted_items('aaaaaaaa-0000-4000-8000-000000000000')$q$);
select rls_test.expect('Bea can''t rename Ann', rls_test.bea(), 'none', $q$update public.profiles set display_name = 'Spy' where id = '00000000-0000-4000-8000-0000000000a1'$q$);
select rls_test.expect('Bea can''t add events', rls_test.bea(), 'none', $q$insert into public.item_events (household_id, item_id, type) values ('aaaaaaaa-0000-4000-8000-000000000000', 'aaaaaaaa-2222-4000-8000-000000000000', 'add')$q$);
select rls_test.expect('Bea can''t rename A', rls_test.bea(), 'none', $q$update public.households set name = 'Spy' where id = 'aaaaaaaa-0000-4000-8000-000000000000'$q$);
select rls_test.expect('Bea can''t delete A', rls_test.bea(), 'none', $q$delete from public.households where id = 'aaaaaaaa-0000-4000-8000-000000000000'$q$);
select rls_test.expect('Bea can''t upload to A', rls_test.bea(), 'none', $q$insert into storage.objects (bucket_id, name) values ('item-photos', 'aaaaaaaa-0000-4000-8000-000000000000/spy.jpg')$q$);
select rls_test.expect('Bea can''t replace A''s photo', rls_test.bea(), 'none', $q$update storage.objects set metadata = '{}' where bucket_id = 'item-photos'$q$);
select rls_test.expect('Bea can''t add herself to A', rls_test.bea(), 'none', $q$insert into public.household_members (household_id, user_id) values ('aaaaaaaa-0000-4000-8000-000000000000', '00000000-0000-4000-8000-0000000000b1')$q$);
select rls_test.expect('Bea can''t make A''s invites', rls_test.bea(), 'none', $q$select public.create_invite('aaaaaaaa-0000-4000-8000-000000000000')$q$);
select rls_test.expect('Bea can''t cancel A''s invites', rls_test.bea(), 'none', $q$select public.revoke_invite('aaaaaaaa-1111-4000-8000-000000000000')$q$);
select rls_test.expect('Bea can''t remove A''s members', rls_test.bea(), 'none', $q$select public.remove_member('aaaaaaaa-0000-4000-8000-000000000000', '00000000-0000-4000-8000-0000000000a2')$q$);

-- A member isn't an owner
select rls_test.expect('Al sets his own name', rls_test.al(), 'some', $q$select public.set_display_name('Al')$q$);
select rls_test.expect('Al can''t rename Ann', rls_test.al(), 'none', $q$update public.profiles set display_name = 'Spy' where id = '00000000-0000-4000-8000-0000000000a1'$q$);
select rls_test.expect('Al can''t rename A', rls_test.al(), 'none', $q$update public.households set name = 'Mine' where id = 'aaaaaaaa-0000-4000-8000-000000000000'$q$);
select rls_test.expect('Al can''t delete A', rls_test.al(), 'none', $q$delete from public.households where id = 'aaaaaaaa-0000-4000-8000-000000000000'$q$);
select rls_test.expect('Al can''t cancel invites', rls_test.al(), 'none', $q$select public.revoke_invite('aaaaaaaa-1111-4000-8000-000000000000')$q$);
select rls_test.expect('Al can''t remove Ann', rls_test.al(), 'none', $q$select public.remove_member('aaaaaaaa-0000-4000-8000-000000000000', '00000000-0000-4000-8000-0000000000a1')$q$);
select rls_test.expect('Al can''t make himself owner', rls_test.al(), 'none', $q$update public.household_members set role = 'owner' where user_id = '00000000-0000-4000-8000-0000000000a2'$q$);

-- Someone with no household sees nothing
select rls_test.expect('Cy sees no households', rls_test.cy(), 'none', 'select * from public.households');
select rls_test.expect('Cy sees no items', rls_test.cy(), 'none', 'select * from public.items');
select rls_test.expect('Cy sees no photos', rls_test.cy(), 'none', $q$select * from storage.objects where bucket_id = 'item-photos'$q$);

-- Signed-out visitors get nothing
select rls_test.expect('Visitor sees no households', null, 'none', 'select * from public.households');
select rls_test.expect('Visitor sees no members', null, 'none', 'select * from public.household_members');
select rls_test.expect('Visitor sees no invites', null, 'none', 'select * from public.household_invites');
select rls_test.expect('Visitor sees no items', null, 'none', 'select * from public.items');
select rls_test.expect('Visitor sees no events', null, 'none', 'select * from public.item_events');
select rls_test.expect('Visitor sees no profiles', null, 'none', 'select * from public.profiles');
select rls_test.expect('Visitor sees no photos', null, 'none', $q$select * from storage.objects where bucket_id = 'item-photos'$q$);
select rls_test.expect('Visitor can''t add items', null, 'none', $q$insert into public.items (household_id, name) values ('aaaaaaaa-0000-4000-8000-000000000000', 'Spy')$q$);
select rls_test.expect('Visitor can''t change quantity', null, 'none', $q$select public.adjust_quantity('aaaaaaaa-2222-4000-8000-000000000000', -1)$q$);
select rls_test.expect('Visitor can''t purge items', null, 'none', $q$select public.purge_deleted_items('aaaaaaaa-0000-4000-8000-000000000000')$q$);
select rls_test.expect('Visitor can''t set a name', null, 'none', $q$select public.set_display_name('Spy')$q$);
select rls_test.expect('Visitor can''t use invites', null, 'none', $q$select public.join_household('rlstestcodea')$q$);

-- Report and undo
do $$
declare
  total int := (select count(*) from rls_test.results);
  failures text := (
    select string_agg(label || ' (' || detail || ')', '; ')
    from rls_test.results where not passed
  );
begin
  if failures is null then
    raise exception 'ALL % CHECKS PASSED', total;
  end if;
  raise exception 'FAILED: %', failures;
end;
$$;
