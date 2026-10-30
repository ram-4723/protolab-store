const { env, json, readJson, supabaseFetch, authenticateUser, sendEmail } = require('./_lib/backend');
const catalog = require('../data/components.json');

const clean = (value, max) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });
  try {
    env();
    const origin = req.headers.origin;
    if (origin) {
      const requestHost = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
      if (requestHost && new URL(origin).host !== requestHost) return json(res, 403, { error: 'Request origin not allowed.' });
    }
    const user = await authenticateUser(req);
    if (!user) return json(res, 401, { error: 'Sign in to submit an order request.' });
    const body = readJson(req);
    const customerName = clean(body.name, 100);
    const customerEmail = clean(body.email, 254).toLowerCase();
    const customerPhone = clean(body.phone, 30);
    const shippingAddress = clean(body.shippingAddress, 1000);
    const customerNote = clean(body.note, 1000) || null;
    if (customerName.length < 2 || !emailPattern.test(customerEmail) || customerEmail !== String(user.email || '').toLowerCase()) {
      return json(res, 400, { error: 'Use your signed-in email and enter a valid name.' });
    }
    if (customerPhone.length < 7 || shippingAddress.length < 10) return json(res, 400, { error: 'Enter a phone number and complete delivery address.' });
    if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 30) return json(res, 400, { error: 'Your cart is empty or contains too many different items.' });

    const productsById = new Map(catalog.map(product => [Number(product.id), product]));
    const seen = new Set();
    const items = [];
    for (const input of body.items) {
      const id = Number(input?.id), quantity = Number(input?.quantity);
      const product = productsById.get(id);
      if (!product || !Number.isInteger(quantity) || quantity < 1 || quantity > 20 || seen.has(id)) {
        return json(res, 400, { error: 'One or more cart items are invalid. Refresh the catalog and try again.' });
      }
      if (!Number.isFinite(product.price) || product.price <= 0) return json(res, 400, { error: `${product.name} is not currently available to order.` });
      seen.add(id);
      items.push({ product_id: id, slug: product.slug, name: product.name, unit_price_inr: product.price, quantity, line_total_inr: product.price * quantity });
    }
    const subtotal = items.reduce((sum, item) => sum + item.line_total_inr, 0);
    if (!Number.isSafeInteger(subtotal) || subtotal < 1 || subtotal > 10000000) return json(res, 400, { error: 'The order total is outside the allowed range.' });

    const [order] = await supabaseFetch('/rest/v1/store_orders?select=id,created_at,status,subtotal_inr', {
      method: 'POST', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ customer_user_id: user.id, customer_name: customerName, customer_email: customerEmail, customer_phone: customerPhone, shipping_address: shippingAddress, customer_note: customerNote, items, subtotal_inr: subtotal }),
    });
    if (process.env.ADMIN_NOTIFICATION_EMAIL) {
      try {
        await sendEmail({
          to: process.env.ADMIN_NOTIFICATION_EMAIL,
          subject: 'New ProtoLab order request',
          text: `A new order request was submitted.\n\nOrder: PL-${order.id.slice(0, 8).toUpperCase()}\nCustomer: ${customerName}\nEmail: ${customerEmail}\nPhone: ${customerPhone}\n\nItems:\n${items.map(item => `${item.quantity} × ${item.name} — ₹${item.line_total_inr}`).join('\n')}\n\nSubtotal: ₹${subtotal}\nDelivery address:\n${shippingAddress}\n\n${customerNote ? `Customer note: ${customerNote}\n` : ''}`,
        });
      } catch (error) { console.error('Admin order notification failed:', error.message); }
    }
    return json(res, 201, { ok: true, order: { ...order, order_number: `PL-${order.id.slice(0, 8).toUpperCase()}` }, message: 'Order request received. ProtoLab will confirm availability, delivery, and payment details.' });
  } catch (error) {
    console.error('Order request failed:', error.message);
    return json(res, error.message.startsWith('Backend is not configured') ? 503 : 500, { error: error.message.startsWith('Backend is not configured') ? error.message : 'Could not submit your order request. Please try again.' });
  }
};
