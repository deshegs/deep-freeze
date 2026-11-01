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
