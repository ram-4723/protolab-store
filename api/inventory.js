const { env, json, supabaseFetch } = require('./_lib/backend');
const catalog = require('../data/components.json');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed.' });
  try {
    env();
    const rows = await supabaseFetch('/rest/v1/product_inventory?select=product_id,quantity,is_active');
    const tracked = new Map(rows.map(row => [Number(row.product_id), row]));
    const inventory = catalog.map(product => {
      const row = tracked.get(Number(product.id));
      return {
        productId: Number(product.id),
        inStock: row ? row.is_active && (row.quantity === null || row.quantity > 0) : true,
        quantity: row?.quantity ?? null,
      };
    });
    return json(res, 200, { inventory });
  } catch (error) {
    console.error('Public inventory lookup failed:', error.message);
    return json(res, error.message.startsWith('Backend is not configured') ? 503 : 500, {
      error: error.message.startsWith('Backend is not configured') ? error.message : 'Inventory is temporarily unavailable.',
    });
  }
};
