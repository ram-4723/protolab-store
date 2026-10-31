create table if not exists public.product_inventory (
  product_id integer primary key,
  quantity integer check (quantity is null or quantity >= 0),
  low_stock_threshold integer not null default 5 check (low_stock_threshold between 0 and 1000000),
  is_active boolean not null default true,
  updated_by uuid references public.admin_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.store_orders
  add column if not exists stock_reservations jsonb not null default '[]'::jsonb
    check (jsonb_typeof(stock_reservations) = 'array');

create index if not exists product_inventory_low_stock_idx
  on public.product_inventory (quantity, low_stock_threshold)
  where is_active and quantity is not null;

alter table public.product_inventory enable row level security;
revoke all on public.product_inventory from anon, authenticated;
grant all on public.product_inventory to service_role;

drop trigger if exists product_inventory_updated_at on public.product_inventory;
create trigger product_inventory_updated_at
before update on public.product_inventory
for each row execute function public.set_customer_request_updated_at();

create or replace function public.create_store_order(
  p_customer_user_id uuid,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_shipping_address text,
  p_customer_note text,
  p_items jsonb,
  p_subtotal_inr numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_inventory public.product_inventory%rowtype;
  v_reservations jsonb := '[]'::jsonb;
  v_product_id integer;
  v_quantity integer;
  v_order public.store_orders%rowtype;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 30 then
    raise exception using message = 'INVALID_ORDER_ITEMS', errcode = '22023';
  end if;

  -- Stable lock order avoids deadlocks when concurrent carts contain the same products.
  for v_item in
    select value from pg_catalog.jsonb_array_elements(p_items)
    order by (value->>'product_id')::integer
  loop
    v_product_id := (v_item->>'product_id')::integer;
    v_quantity := (v_item->>'quantity')::integer;
    select * into v_inventory
      from public.product_inventory
      where product_id = v_product_id
      for update;

    if found then
      if not v_inventory.is_active then
        raise exception using message = 'PRODUCT_UNAVAILABLE', errcode = 'P0001';
      end if;
      if v_inventory.quantity is not null then
        if v_inventory.quantity < v_quantity then
          raise exception using message = 'INSUFFICIENT_STOCK', errcode = 'P0001';
        end if;
        update public.product_inventory
          set quantity = quantity - v_quantity
          where product_id = v_product_id;
        v_reservations := v_reservations || pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object('product_id', v_product_id, 'quantity', v_quantity)
        );
      end if;
    end if;
  end loop;

  insert into public.store_orders (
    customer_user_id, customer_name, customer_email, customer_phone,
    shipping_address, customer_note, items, subtotal_inr, stock_reservations
  ) values (
    p_customer_user_id, p_customer_name, p_customer_email, p_customer_phone,
    p_shipping_address, p_customer_note, p_items, p_subtotal_inr, v_reservations
  ) returning * into v_order;

  return pg_catalog.to_jsonb(v_order);
end;
$$;

create or replace function public.admin_update_store_order(
  p_order_id uuid,
  p_admin_id uuid,
  p_order_update jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.store_orders%rowtype;
  v_reservation jsonb;
  v_new_status text;
begin
  select * into v_order from public.store_orders where id = p_order_id for update;
  if not found then
    raise exception using message = 'ORDER_NOT_FOUND', errcode = 'P0002';
  end if;

  v_new_status := coalesce(p_order_update->>'status', v_order.status);
  if v_order.status = 'cancelled' and v_new_status <> 'cancelled' then
    raise exception using message = 'CANCELLED_ORDER_IS_FINAL', errcode = 'P0001';
  end if;

  if v_order.status <> 'cancelled' and v_new_status = 'cancelled' then
    for v_reservation in select value from pg_catalog.jsonb_array_elements(v_order.stock_reservations)
    loop
      update public.product_inventory
        set quantity = coalesce(quantity, 0) + (v_reservation->>'quantity')::integer
        where product_id = (v_reservation->>'product_id')::integer;
    end loop;
  end if;

  update public.store_orders set
    status = v_new_status,
    payment_status = coalesce(p_order_update->>'payment_status', payment_status),
    tracking_number = case when p_order_update ? 'tracking_number' then nullif(p_order_update->>'tracking_number', '') else tracking_number end,
    admin_note = case when p_order_update ? 'admin_note' then nullif(p_order_update->>'admin_note', '') else admin_note end,
    handled_by = p_admin_id,
    updated_at = now()
  where id = p_order_id
  returning * into v_order;

  return pg_catalog.to_jsonb(v_order);
end;
$$;

revoke all on function public.create_store_order(uuid, text, text, text, text, text, jsonb, numeric) from public, anon, authenticated;
revoke all on function public.admin_update_store_order(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.create_store_order(uuid, text, text, text, text, text, jsonb, numeric) to service_role;
grant execute on function public.admin_update_store_order(uuid, uuid, jsonb) to service_role;
