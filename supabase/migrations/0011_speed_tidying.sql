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
