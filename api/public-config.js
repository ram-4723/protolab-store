const { json } = require('./_lib/backend');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed.' });
  const url = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !publishableKey) return json(res, 503, { error: 'Customer accounts are not configured yet.' });
  return json(res, 200, { url: url.replace(/\/$/, ''), publishableKey });
};
