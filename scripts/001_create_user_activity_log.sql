-- Ensure pgcrypto is available for gen_random_uuid()
create extension if not exists pgcrypto;

create table if not exists public.user_activity_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references auth.users (id) on delete set null,
  email text,
  activity_type text check (activity_type in ('signup','login','logout')) not null,
  status text check (status in ('success','failed')) not null,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

-- Helpful indexes for querying
create index if not exists idx_user_activity_log_created_at on public.user_activity_log (created_at desc);
create index if not exists idx_user_activity_log_email on public.user_activity_log (email);

-- Enable RLS (default deny)
alter table public.user_activity_log enable row level security;

-- Allow inserts for unauthenticated (anon) so failed attempts before session are captured
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_activity_log' and policyname = 'Allow insert for anon'
  ) then
    create policy "Allow insert for anon"
      on public.user_activity_log
      for insert
      to anon
      with check (true);
  end if;
end$$;

-- Allow inserts for authenticated users
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_activity_log' and policyname = 'Allow insert for authenticated'
  ) then
    create policy "Allow insert for authenticated"
      on public.user_activity_log
      for insert
      to authenticated
      with check (true);
  end if;
end$$;

-- Allow authenticated users to select only their own rows (when user_id is set)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_activity_log' and policyname = 'Allow select own rows'
  ) then
    create policy "Allow select own rows"
      on public.user_activity_log
      for select
      to authenticated
      using (user_id is not distinct from auth.uid());
  end if;
end$$;
