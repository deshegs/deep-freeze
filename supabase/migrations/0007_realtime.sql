-- Sends item changes to open apps. Each person still only receives rows the
-- security rules on public.items let them read.

alter publication supabase_realtime add table public.items;
