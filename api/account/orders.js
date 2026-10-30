const { json, supabaseFetch, authenticateUser } = require('../_lib/backend');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed.' });
  try {
    const user = await authenticateUser(req);
    if (!user) return json(res, 401, { error: 'Sign in to view your orders.' });
    const fields = 'id,status,payment_status,items,subtotal_inr,tracking_number,created_at,updated_at';
    const orders = await supabaseFetch(`/rest/v1/store_orders?customer_user_id=eq.${encodeURIComponent(user.id)}&select=${fields}&order=created_at.desc&limit=100`);
    return json(res, 200, { orders: orders.map(order => ({ ...order, order_number: `PL-${order.id.slice(0, 8).toUpperCase()}` })) });
  } catch (error) {
    console.error('Customer order lookup failed:', error.message);
    return json(res, error.message.startsWith('Backend is not configured') ? 503 : 500, { error: error.message.startsWith('Backend is not configured') ? error.message : 'Unable to load your orders right now.' });
  }
};
