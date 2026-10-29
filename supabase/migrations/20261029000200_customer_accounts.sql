alter table public.customer_requests
  add column if not exists customer_user_id uuid references auth.users(id) on delete set null,
  add column if not exists customer_message text check (customer_message is null or char_length(customer_message) <= 3000);

create index if not exists customer_requests_customer_user_id_idx
  on public.customer_requests (customer_user_id, created_at desc);
