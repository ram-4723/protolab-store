const { json, supabaseFetch, authenticateUser } = require('../_lib/backend');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed.' });
  try {
    const user = await authenticateUser(req);
    if (!user) return json(res, 401, { error: 'Sign in to view your requests.' });
    const fields = 'id,request_type,status,description,estimated_total_inr,estimated_build_time,customer_message,created_at,updated_at,quote_sent_at';
    const byUser = await supabaseFetch(`/rest/v1/customer_requests?customer_user_id=eq.${encodeURIComponent(user.id)}&select=${fields}&order=created_at.desc&limit=100`);
    const byEmail = await supabaseFetch(`/rest/v1/customer_requests?customer_email=eq.${encodeURIComponent(String(user.email || '').toLowerCase())}&select=${fields}&order=created_at.desc&limit=100`);
    const requests = [...new Map([...byUser, ...byEmail].map(row => [row.id, row])).values()]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return json(res, 200, { requests, email: user.email });
  } catch (error) {
    console.error('Customer request lookup failed:', error.message);
    return json(res, 500, { error: 'Unable to load your requests right now.' });
  }
};
