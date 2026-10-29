const env = () => {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) throw new Error('Backend is not configured yet.');
  return { url: url.replace(/\/$/, ''), anonKey, serviceKey };
};

const json = (res, status, payload) => {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.end(JSON.stringify(payload));
};

const readJson = (req) => {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body);
  return {};
};

const supabaseFetch = async (path, options = {}) => {
  const { url, serviceKey } = env();
  const response = await fetch(`${url}${path}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      // The new sb_secret_* key is an API key, not a JWT. Sending it as a
      // bearer token makes Supabase reject it as an invalid JWT. Legacy
      // service_role keys are JWTs and still need the Authorization header.
      ...(serviceKey.startsWith('sb_secret_') ? {} : { Authorization: `Bearer ${serviceKey}` }),
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) {
    const error = new Error('Database request failed.');
    error.status = response.status;
    error.detail = data;
    throw error;
  }
  return data;
};

const authenticateAdmin = async (req) => {
  const user = await authenticateUser(req);
  if (!user) return null;
  const admins = await supabaseFetch(`/rest/v1/admin_users?id=eq.${encodeURIComponent(user.id)}&select=id&limit=1`);
  return admins && admins.length ? user : null;
};

const authenticateUser = async (req) => {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token || token === req.headers.authorization) return null;
  const { url, anonKey } = env();
  const userResponse = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
  });
  if (!userResponse.ok) return null;
  return userResponse.json();
};

const sendEmail = async ({ to, subject, text }) => {
  const { RESEND_API_KEY, EMAIL_FROM } = process.env;
  if (!RESEND_API_KEY || !EMAIL_FROM || !to) return false;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: EMAIL_FROM, to: [to], subject, text }),
  });
  if (!response.ok) throw new Error('Email provider rejected the message.');
  return true;
};

module.exports = { env, json, readJson, supabaseFetch, authenticateUser, authenticateAdmin, sendEmail };
