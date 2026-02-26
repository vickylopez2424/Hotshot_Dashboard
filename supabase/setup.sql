-- ============================================================
-- Hotshot Dashboard — Supabase Database Setup
-- Run this in your Supabase project: SQL Editor → New Query
-- ============================================================

-- 1. Profiles table (extends Supabase auth.users)
create table if not exists public.profiles (
  id            uuid references auth.users on delete cascade primary key,
  email         text,
  full_name     text,
  approved      boolean   default false,
  approved_at   timestamptz,
  approved_by   text,
  role          text      default 'user',   -- 'user' | 'admin'
  created_at    timestamptz default now(),
  notes         text                        -- admin notes about the account
);

-- 2. Row Level Security
alter table public.profiles enable row level security;

-- Users can read their own profile (to check approval status)
create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

-- Only service role (backend) can insert/update profiles
create policy "Service role full access"
  on public.profiles for all
  using (true);

-- 3. Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', '')
  );
  return new;
end;
$$ language plpgsql security definer;

-- Drop trigger if it exists, then recreate
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 4. View for admin: pending approvals
create or replace view public.pending_users as
  select
    p.id,
    p.email,
    p.full_name,
    p.approved,
    p.created_at,
    p.notes
  from public.profiles p
  where p.approved = false
  order by p.created_at desc;

-- ============================================================
-- Done. Next steps:
-- 1. Copy your Supabase project URL and anon key into .env
-- 2. Copy the service role key into backend/.env
-- 3. In Supabase → Authentication → Settings:
--    - Set Site URL to your production URL
--    - Add redirect URLs for login/signup
-- ============================================================
