create table if not exists public.store_order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.store_orders(id) on delete cascade,
  actor_user_id uuid references public.admin_users(id) on delete set null,
  event_type text not null check (event_type in ('placed', 'status_changed', 'payment_changed', 'tracking_added')),
  status text not null check (status in ('new','reviewing','confirmed','processing','shipped','delivered','cancelled')),
  payment_status text not null check (payment_status in ('unpaid','pending','paid','refunded')),
  tracking_number text,
  created_at timestamptz not null default now()
);

create index if not exists store_order_events_order_created_idx
  on public.store_order_events (order_id, created_at, id);

alter table public.store_order_events enable row level security;
revoke all on public.store_order_events from anon, authenticated;
grant all on public.store_order_events to service_role;

insert into public.store_order_events (order_id, event_type, status, payment_status, tracking_number, created_at)
select order_row.id, 'placed', order_row.status, order_row.payment_status, order_row.tracking_number, order_row.created_at
from public.store_orders as order_row
where not exists (
  select 1 from public.store_order_events as event_row
  where event_row.order_id = order_row.id and event_row.event_type = 'placed'
);

create or replace function public.log_store_order_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.store_order_events (order_id, event_type, status, payment_status, tracking_number)
    values (new.id, 'placed', new.status, new.payment_status, new.tracking_number);
    return new;
  end if;

  if old.status is distinct from new.status then
    insert into public.store_order_events (order_id, actor_user_id, event_type, status, payment_status, tracking_number)
    values (new.id, new.handled_by, 'status_changed', new.status, new.payment_status, new.tracking_number);
  end if;

  if old.payment_status is distinct from new.payment_status then
    insert into public.store_order_events (order_id, actor_user_id, event_type, status, payment_status, tracking_number)
    values (new.id, new.handled_by, 'payment_changed', new.status, new.payment_status, new.tracking_number);
  end if;

  if old.tracking_number is distinct from new.tracking_number and new.tracking_number is not null then
    insert into public.store_order_events (order_id, actor_user_id, event_type, status, payment_status, tracking_number)
    values (new.id, new.handled_by, 'tracking_added', new.status, new.payment_status, new.tracking_number);
  end if;

  return new;
end;
$$;

revoke all on function public.log_store_order_event() from public, anon, authenticated;

drop trigger if exists store_order_events_after_insert on public.store_orders;
create trigger store_order_events_after_insert
after insert on public.store_orders
for each row execute function public.log_store_order_event();

drop trigger if exists store_order_events_after_update on public.store_orders;
create trigger store_order_events_after_update
after update on public.store_orders
for each row execute function public.log_store_order_event();
