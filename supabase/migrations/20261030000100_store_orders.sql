create table if not exists public.store_orders (
  id uuid primary key default gen_random_uuid(),
  customer_user_id uuid not null references auth.users(id) on delete restrict,
  customer_name text not null check (char_length(customer_name) between 2 and 100),
  customer_email text not null check (char_length(customer_email) <= 254),
  customer_phone text not null check (char_length(customer_phone) between 7 and 30),
  shipping_address text not null check (char_length(shipping_address) between 10 and 1000),
  customer_note text check (customer_note is null or char_length(customer_note) <= 1000),
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 30),
  subtotal_inr numeric(12,2) not null check (subtotal_inr > 0),
  status text not null default 'new' check (status in ('new','reviewing','confirmed','processing','shipped','delivered','cancelled')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','pending','paid','refunded')),
  tracking_number text check (tracking_number is null or char_length(tracking_number) <= 120),
  admin_note text check (admin_note is null or char_length(admin_note) <= 3000),
  handled_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists store_orders_customer_created_idx on public.store_orders (customer_user_id, created_at desc);
create index if not exists store_orders_status_created_idx on public.store_orders (status, created_at desc);

alter table public.store_orders enable row level security;
revoke all on public.store_orders from anon, authenticated;
grant all on public.store_orders to service_role;

drop trigger if exists store_orders_updated_at on public.store_orders;
create trigger store_orders_updated_at
before update on public.store_orders
for each row execute function public.set_customer_request_updated_at();
