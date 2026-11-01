const { json, readJson, supabaseFetch, authenticateAdmin, sendEmail } = require('../_lib/backend');

const statuses = new Set(['new', 'reviewing', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled']);
const payments = new Set(['unpaid', 'pending', 'paid', 'refunded']);
const clean = (value, max) => String(value ?? '').trim().slice(0, max);
const orderSelect = '*,store_order_events(id,event_type,status,payment_status,tracking_number,created_at)';
const withOrderNumber = order => ({
  ...order,
  store_order_events: (order.store_order_events || []).sort((a, b) => new Date(a.created_at) - new Date(b.created_at) || a.id - b.id),
  order_number: `PL-${order.id.slice(0, 8).toUpperCase()}`,
});

module.exports = async function handler(req, res) {
  try {
    const admin = await authenticateAdmin(req);
    if (!admin) return json(res, 401, { error: 'Please sign in with an authorized admin account.' });
    if (req.method === 'GET') {
      const orders = await supabaseFetch(`/rest/v1/store_orders?select=${orderSelect}&order=created_at.desc&limit=300`);
      return json(res, 200, { orders: orders.map(withOrderNumber) });
    }
    if (req.method !== 'PATCH') return json(res, 405, { error: 'Method not allowed.' });
    const body = readJson(req), id = String(body.id || '');
    if (!/^[0-9a-f-]{36}$/i.test(id)) return json(res, 400, { error: 'Invalid order ID.' });
    const update = { handled_by: admin.id };
    if (body.status !== undefined) {
      if (!statuses.has(body.status)) return json(res, 400, { error: 'Invalid order status.' });
      update.status = body.status;
    }
    if (body.paymentStatus !== undefined) {
      if (!payments.has(body.paymentStatus)) return json(res, 400, { error: 'Invalid payment status.' });
      update.payment_status = body.paymentStatus;
    }
    if (body.trackingNumber !== undefined) update.tracking_number = clean(body.trackingNumber, 120) || null;
    if (body.adminNote !== undefined) update.admin_note = clean(body.adminNote, 3000) || null;
    let order;
    try {
      order = await supabaseFetch('/rest/v1/rpc/admin_update_store_order', {
        method: 'POST',
        body: JSON.stringify({ p_order_id: id, p_admin_id: admin.id, p_order_update: update }),
      });
    } catch (error) {
      const dbMessage = String(error.detail?.message || error.detail?.details || '');
      if (dbMessage.includes('ORDER_NOT_FOUND')) return json(res, 404, { error: 'Order not found.' });
      if (dbMessage.includes('CANCELLED_ORDER_IS_FINAL')) return json(res, 409, { error: 'A cancelled order is final. Create a new order if the customer still wants to buy.' });
      throw error;
    }
    const [orderWithEvents] = await supabaseFetch(`/rest/v1/store_orders?id=eq.${encodeURIComponent(id)}&select=${orderSelect}&limit=1`);
    if (orderWithEvents) order = orderWithEvents;
    let emailSent = false;
    if (body.notifyCustomer === true) {
      try {
        emailSent = await sendEmail({ to: order.customer_email, subject: `ProtoLab order ${`PL-${order.id.slice(0, 8).toUpperCase()}`} update`, text: `Hi ${order.customer_name},\n\nYour ProtoLab order ${`PL-${order.id.slice(0, 8).toUpperCase()}`} has been updated.\n\nStatus: ${order.status.replaceAll('_', ' ')}\nPayment: ${order.payment_status}\n${order.tracking_number ? `Tracking: ${order.tracking_number}\n` : ''}${order.admin_note ? `Message: ${order.admin_note}\n` : ''}\nProtoLab` });
      } catch (error) { console.error('Customer order email failed:', error.message); }
    }
    return json(res, 200, { order: withOrderNumber(order), emailSent });
  } catch (error) {
    console.error('Admin order operation failed:', error.message);
    return json(res, error.message.startsWith('Backend is not configured') ? 503 : 500, { error: error.message.startsWith('Backend is not configured') ? error.message : 'Unable to load or update orders right now.' });
  }
};
