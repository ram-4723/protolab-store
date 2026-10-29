create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.customer_requests (
  id uuid primary key default gen_random_uuid(),
  request_type text not null check (request_type in ('project', 'part')),
  customer_name text not null check (char_length(customer_name) between 2 and 100),
  customer_email text not null check (char_length(customer_email) <= 254),
  description text not null check (char_length(description) between 10 and 3000),
  status text not null default 'new' check (status in ('new', 'reviewing', 'quoted', 'in_progress', 'completed', 'declined')),
  estimated_total_inr numeric(10, 2),
  estimated_build_time text check (estimated_build_time is null or char_length(estimated_build_time) <= 120),
  admin_notes text check (admin_notes is null or char_length(admin_notes) <= 5000),
  handled_by uuid references public.admin_users(id) on delete set null,
  quote_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_requests_created_at_idx on public.customer_requests (created_at desc);
create index if not exists customer_requests_status_idx on public.customer_requests (status, created_at desc);

alter table public.admin_users enable row level security;
alter table public.customer_requests enable row level security;

revoke all on public.admin_users from anon, authenticated;
revoke all on public.customer_requests from anon, authenticated;
grant all on public.admin_users to service_role;
grant all on public.customer_requests to service_role;

create or replace function public.set_customer_request_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists customer_requests_updated_at on public.customer_requests;
create trigger customer_requests_updated_at
before update on public.customer_requests
for each row execute function public.set_customer_request_updated_at();
