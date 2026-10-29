const { env, json, readJson, supabaseFetch } = require('../_lib/backend');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });
  try {
    const { url, anonKey } = env();
    const body = readJson(req);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!email || !password || password.length > 256) return json(res, 400, { error: 'Enter your admin email and password.' });

    const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const auth = await response.json();
    if (!response.ok || !auth.access_token || !auth.user) return json(res, 401, { error: 'Email or password is incorrect.' });

    const admins = await supabaseFetch(`/rest/v1/admin_users?id=eq.${encodeURIComponent(auth.user.id)}&select=id&limit=1`);
    if (!admins || !admins.length) return json(res, 403, { error: 'This account does not have ProtoLab admin access.' });
    return json(res, 200, { accessToken: auth.access_token, expiresIn: auth.expires_in, email: auth.user.email });
  } catch (error) {
    console.error('Admin login failed:', error.message);
    return json(res, error.message.startsWith('Backend is not configured') ? 503 : 500, {
      error: error.message.startsWith('Backend is not configured') ? error.message : 'Unable to sign in right now. Try again shortly.',
    });
  }
};
