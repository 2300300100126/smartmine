-- Create table if it doesn't exist
create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text check (role in ('admin','miner')) default 'miner',
  rfid text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Upsert helper: ensure updated_at is maintained
create or replace function public.set_user_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_user_profiles_updated_at on public.user_profiles;
create trigger trg_user_profiles_updated_at
before update on public.user_profiles
for each row execute function public.set_user_profiles_updated_at();

-- Enable RLS
alter table public.user_profiles enable row level security;

-- Policies: allow authenticated users to manage their own row
drop policy if exists "Users can read own profile" on public.user_profiles;
create policy "Users can read own profile"
on public.user_profiles
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "Users can insert own profile" on public.user_profiles;
create policy "Users can insert own profile"
on public.user_profiles
for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.user_profiles;
create policy "Users can update own profile"
on public.user_profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

-- Optional: allow admins to read all profiles if you later define an auth role claim
-- You can extend policies with a custom claim like auth.jwt() ->> 'role' = 'admin'
