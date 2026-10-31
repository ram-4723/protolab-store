const { json, readJson, supabaseFetch, authenticateAdmin } = require('../_lib/backend');
const catalog = require('../../data/components.json');
const productsById = new Map(catalog.map(product => [Number(product.id), product]));

module.exports = async function handler(req, res) {
  try {
    const admin = await authenticateAdmin(req);
    if (!admin) return json(res, 401, { error: 'Please sign in with an authorized admin account.' });

    if (req.method === 'GET') {
      const rows = await supabaseFetch('/rest/v1/product_inventory?select=*&order=product_id.asc');
      const byId = new Map(rows.map(row => [Number(row.product_id), row]));
      const inventory = catalog.map(product => ({
        productId: Number(product.id), name: product.name, category: product.category,
        price: product.price, image: product.image,
        tracked: byId.has(Number(product.id)) && byId.get(Number(product.id)).quantity !== null,
        quantity: byId.get(Number(product.id))?.quantity ?? null,
        threshold: byId.get(Number(product.id))?.low_stock_threshold ?? 5,
        active: byId.get(Number(product.id))?.is_active ?? true,
      }));
      return json(res, 200, { inventory });
    }

    if (req.method !== 'PATCH') return json(res, 405, { error: 'Method not allowed.' });
    const body = readJson(req), productId = Number(body.productId);
    if (!Number.isInteger(productId) || !productsById.has(productId)) return json(res, 400, { error: 'Choose a valid catalog product.' });

    const quantity = body.tracked === false || body.quantity === '' || body.quantity === null
      ? null : Number(body.quantity);
    const threshold = Number(body.threshold);
    if (quantity !== null && (!Number.isInteger(quantity) || quantity < 0 || quantity > 1000000)) {
      return json(res, 400, { error: 'Available stock must be a whole number from 0 to 1,000,000, or blank for untracked stock.' });
    }
    if (!Number.isInteger(threshold) || threshold < 0 || threshold > 1000000) return json(res, 400, { error: 'Low-stock alert threshold must be a whole number from 0 to 1,000,000.' });
    if (typeof body.active !== 'boolean') return json(res, 400, { error: 'Product availability is required.' });

    const [row] = await supabaseFetch('/rest/v1/product_inventory?on_conflict=product_id&select=*', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({ product_id: productId, quantity, low_stock_threshold: threshold, is_active: body.active, updated_by: admin.id }),
    });
    return json(res, 200, { inventory: { productId, name: productsById.get(productId).name, tracked: row.quantity !== null, quantity: row.quantity, threshold: row.low_stock_threshold, active: row.is_active } });
  } catch (error) {
    console.error('Admin inventory operation failed:', error.message);
    return json(res, error.message.startsWith('Backend is not configured') ? 503 : 500, {
      error: error.message.startsWith('Backend is not configured') ? error.message : 'Unable to load or update inventory right now.',
    });
  }
};
