const { env, json, readJson } = require('../_lib/backend');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });
  try {
    const { url, anonKey } = env();
    const body = readJson(req);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8 || password.length > 256) {
      return json(res, 400, { error: 'Enter a valid email and a password of at least 8 characters.' });
    }
    const action = body.action === 'signup' ? 'signup' : 'login';
    const endpoint = action === 'signup' ? '/auth/v1/signup' : '/auth/v1/token?grant_type=password';
    const response = await fetch(`${url}${endpoint}`, {
      method: 'POST',
      headers: { apikey: anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(action === 'signup'
        ? { email, password, data: { full_name: String(body.name || '').trim().slice(0, 100) } }
        : { email, password }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) return json(res, 401, { error: action === 'signup' ? (result.msg || result.message || 'Could not create the account. Check the email and try again.') : 'Email or password is incorrect.' });
    if (!result.access_token) return json(res, 202, { confirmationRequired: true, message: 'Account created. Check your email to confirm it, then sign in.' });
    return json(res, 200, { accessToken: result.access_token, expiresIn: result.expires_in, user: { id: result.user.id, email: result.user.email } });
  } catch (error) {
    console.error('Customer authentication failed:', error.message);
    return json(res, error.message.startsWith('Backend is not configured') ? 503 : 500, { error: error.message.startsWith('Backend is not configured') ? error.message : 'Unable to sign in right now. Try again shortly.' });
  }
};
