-- Run this once in your Supabase project: SQL Editor -> New query -> paste -> Run

-- 1. Page views (site traffic)
create table if not exists page_views (
  id uuid primary key default gen_random_uuid(),
  page text not null,
  referrer text,
  user_agent text,
  created_at timestamptz not null default now()
);

alter table page_views enable row level security;

-- Anyone (anonymous visitors) can log a page view
create policy "public can insert page views"
on page_views for insert
to anon
with check (true);

-- Only logged-in admins can read them
create policy "authenticated can read page views"
on page_views for select
to authenticated
using (true);


-- 2. Leads (contact form / opportunity submissions)
create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text,
  phone text,
  message text,
  source text default 'contact_form',
  created_at timestamptz not null default now()
);

alter table leads enable row level security;

create policy "public can insert leads"
on leads for insert
to anon
with check (true);

create policy "authenticated can read leads"
on leads for select
to authenticated
using (true);


-- 3. Poster/flyer AI requests (admin-only tool, so only admins write + read)
create table if not exists poster_requests (
  id uuid primary key default gen_random_uuid(),
  opportunity_title text,
  company_name text,
  input_summary text,
  generated_flyer jsonb,
  created_at timestamptz not null default now()
);

alter table poster_requests enable row level security;

create policy "authenticated can insert poster requests"
on poster_requests for insert
to authenticated
with check (true);

create policy "authenticated can read poster requests"
on poster_requests for select
to authenticated
using (true);


-- 4. Publish support: lets a flyer go live on the public /opportunities page
alter table poster_requests
  add column if not exists published boolean not null default false,
  add column if not exists published_at timestamptz;

create policy "public can read published posters"
on poster_requests for select
to anon
using (published = true);

create policy "authenticated can update poster requests"
on poster_requests for update
to authenticated
using (true)
with check (true);


-- 5. Accounts: optional profiles for notification preferences
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  notify_buy_sell boolean not null default true,
  notify_auctions boolean not null default true,
  notify_opportunities boolean not null default true,
  notify_find_it boolean not null default true,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "users can read their own profile"
on profiles for select
to authenticated
using (auth.uid() = id);

create policy "users can update their own profile"
on profiles for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "users can insert their own profile"
on profiles for insert
to authenticated
with check (auth.uid() = id);

-- Auto-create a profile row the moment someone signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
