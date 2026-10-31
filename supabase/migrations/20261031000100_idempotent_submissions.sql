alter table public.customer_requests
  add column if not exists idempotency_key uuid;

alter table public.store_orders
  add column if not exists idempotency_key uuid;

create unique index if not exists customer_requests_idempotency_key_idx
  on public.customer_requests (idempotency_key)
  where idempotency_key is not null;

create unique index if not exists store_orders_customer_idempotency_key_idx
  on public.store_orders (customer_user_id, idempotency_key)
  where idempotency_key is not null;

drop function if exists public.create_store_order(uuid, text, text, text, text, text, jsonb, numeric);

create or replace function public.create_store_order(
  p_customer_user_id uuid,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_shipping_address text,
  p_customer_note text,
  p_items jsonb,
  p_subtotal_inr numeric,
  p_idempotency_key uuid
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
  if p_idempotency_key is null then
    raise exception using message = 'IDEMPOTENCY_KEY_REQUIRED', errcode = '22023';
  end if;

  -- Serialize retries for this customer/key before checking or reserving inventory.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_customer_user_id::text || ':' || p_idempotency_key::text, 0)
  );

  select * into v_order
    from public.store_orders
    where customer_user_id = p_customer_user_id and idempotency_key = p_idempotency_key;
  if found then
    if v_order.customer_name is distinct from p_customer_name
      or v_order.customer_email is distinct from p_customer_email
      or v_order.customer_phone is distinct from p_customer_phone
      or v_order.shipping_address is distinct from p_shipping_address
      or v_order.customer_note is distinct from p_customer_note
      or v_order.items is distinct from p_items
      or v_order.subtotal_inr is distinct from p_subtotal_inr then
      raise exception using message = 'IDEMPOTENCY_KEY_REUSED', errcode = 'P0001';
    end if;
    return pg_catalog.jsonb_build_object('order', pg_catalog.to_jsonb(v_order), 'created', false);
  end if;

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
    shipping_address, customer_note, items, subtotal_inr, stock_reservations, idempotency_key
  ) values (
    p_customer_user_id, p_customer_name, p_customer_email, p_customer_phone,
    p_shipping_address, p_customer_note, p_items, p_subtotal_inr, v_reservations, p_idempotency_key
  ) returning * into v_order;

  return pg_catalog.jsonb_build_object('order', pg_catalog.to_jsonb(v_order), 'created', true);
end;
$$;

create or replace function public.create_customer_request(
  p_request_type text,
  p_customer_name text,
  p_customer_email text,
  p_description text,
  p_customer_user_id uuid,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.customer_requests%rowtype;
begin
  if p_idempotency_key is null then
    raise exception using message = 'IDEMPOTENCY_KEY_REQUIRED', errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('request:' || p_idempotency_key::text, 0)
  );

  select * into v_request
    from public.customer_requests
    where idempotency_key = p_idempotency_key;
  if found then
    if v_request.request_type is distinct from p_request_type
      or v_request.customer_name is distinct from p_customer_name
      or v_request.customer_email is distinct from p_customer_email
      or v_request.description is distinct from p_description
      or v_request.customer_user_id is distinct from p_customer_user_id then
      raise exception using message = 'IDEMPOTENCY_KEY_REUSED', errcode = 'P0001';
    end if;
    return pg_catalog.jsonb_build_object('request', pg_catalog.to_jsonb(v_request), 'created', false);
  end if;

  insert into public.customer_requests (
    request_type, customer_name, customer_email, description, customer_user_id, idempotency_key
  ) values (
    p_request_type, p_customer_name, p_customer_email, p_description, p_customer_user_id, p_idempotency_key
  ) returning * into v_request;

  return pg_catalog.jsonb_build_object('request', pg_catalog.to_jsonb(v_request), 'created', true);
end;
$$;

revoke all on function public.create_store_order(uuid, text, text, text, text, text, jsonb, numeric, uuid) from public, anon, authenticated;
revoke all on function public.create_customer_request(text, text, text, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_store_order(uuid, text, text, text, text, text, jsonb, numeric, uuid) to service_role;
grant execute on function public.create_customer_request(text, text, text, text, uuid, uuid) to service_role;
