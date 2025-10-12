create table if not exists public.user_signups (
  id bigserial primary key,
  email text not null,
  full_name text not null,
  role text not null check (role in ('admin','miner')),
  rfid text,
  status text not null check (status in ('attempted','success','failed')),
  user_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_user_signups_created_at on public.user_signups (created_at desc);
create index if not exists idx_user_signups_email on public.user_signups (email);
create index if not exists idx_user_signups_status on public.user_signups (status);

alter table public.user_signups enable row level security;

-- Allow inserts from anonymous (pre-auth) to capture signups before session exists
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_signups' and policyname = 'Allow insert for anon'
  ) then
    create policy "Allow insert for anon"
      on public.user_signups
      for insert
      to anon
      with check (true);
  end if;
end $$;

-- Allow inserts from authenticated too
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_signups' and policyname = 'Allow insert for authenticated'
  ) then
    create policy "Allow insert for authenticated"
      on public.user_signups
      for insert
      to authenticated
      with check (true);
  end if;
end $$;

-- Allow authenticated users to read their own signup rows by email
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_signups' and policyname = 'Allow select own rows'
  ) then
    create policy "Allow select own rows"
      on public.user_signups
      for select
      to authenticated
      using (email = auth.email());
  end if;
end $$;

-- Allow admins to read all rows
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_signups' and policyname = 'Admins can view all signups'
  ) then
    create policy "Admins can view all signups"
      on public.user_signups
      for select
      to authenticated
      using (
        exists (
          select 1 from public.user_profiles up
          where up.id = auth.uid() and up.role = 'admin'
        )
      );
  end if;
end $$;
