-- Ensure required extension for gen_random_uuid (if needed)
create extension if not exists pgcrypto;

-- Create user_profiles table if missing
create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  full_name text not null,
  role text not null check (role in ('admin','miner')),
  rfid text unique,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Helpful indexes
create index if not exists idx_user_profiles_rfid on public.user_profiles(rfid);
create index if not exists idx_user_profiles_role on public.user_profiles(role);

-- Enable RLS
alter table public.user_profiles enable row level security;

-- Basic RLS policies (idempotent)
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'user_profiles' and policyname = 'Users can view own profile'
  ) then
    create policy "Users can view own profile"
      on public.user_profiles
      for select
      to authenticated
      using (id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'user_profiles' and policyname = 'Users can update own profile'
  ) then
    create policy "Users can update own profile"
      on public.user_profiles
      for update
      to authenticated
      using (id = auth.uid())
      with check (id = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'user_profiles' and policyname = 'Allow profile creation during signup'
  ) then
    create policy "Allow profile creation during signup"
      on public.user_profiles
      for insert
      to authenticated
      with check (id = auth.uid());
  end if;
end $$;

-- Trigger to keep updated_at fresh
create or replace function public.update_user_profiles_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_user_profiles_set_updated_at on public.user_profiles;
create trigger trg_user_profiles_set_updated_at
  before update on public.user_profiles
  for each row execute function public.update_user_profiles_updated_at();

-- Optional: trigger to auto-create profile on new auth.users (keeps idempotent)
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.user_profiles (id, email, full_name, role, rfid)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', 'User'),
    coalesce(new.raw_user_meta_data->>'role', 'miner'),
    new.raw_user_meta_data->>'rfid'
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
