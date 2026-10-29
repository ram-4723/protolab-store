const { env, json, readJson } = require('../_lib/backend');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });
  try {
    const { url, anonKey } = env();
    const body = readJson(req);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const action = ['signup', 'resend'].includes(body.action) ? body.action : 'login';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || (action !== 'resend' && (password.length < 8 || password.length > 256))) {
      return json(res, 400, { error: action === 'resend' ? 'Enter the email address you used to create your account.' : 'Enter a valid email and a password of at least 8 characters.' });
    }
    const endpoint = action === 'signup' ? '/auth/v1/signup' : action === 'resend' ? '/auth/v1/resend' : '/auth/v1/token?grant_type=password';
    const response = await fetch(`${url}${endpoint}`, {
      method: 'POST',
      headers: { apikey: anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(action === 'signup'
        ? { email, password, data: { full_name: String(body.name || '').trim().slice(0, 100) } }
        : action === 'resend' ? { type: 'signup', email } : { email, password }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = String(result.msg || result.message || '').toLowerCase();
      const code = String(result.code || result.error_code || '').toLowerCase();
      if (action === 'login' && (code === 'email_not_confirmed' || detail.includes('email not confirmed')))
        return json(res, 403, { error: 'Your account is created, but your email is not confirmed yet. Check your inbox or spam folder, then use “Resend confirmation email” below.' , confirmationRequired: true });
      return json(res, action === 'resend' ? 400 : 401, { error: action === 'signup' ? (result.msg || result.message || 'Could not create the account. Check the email and try again.') : action === 'resend' ? (result.msg || result.message || 'Could not resend the email. Check the address and try again.') : 'Email or password is incorrect.' });
    }
    if (action === 'resend') return json(res, 200, { message: 'If that account needs confirmation, Supabase has sent a new confirmation email. Check your inbox and spam folder.' });
    if (!result.access_token) return json(res, 202, { confirmationRequired: true, message: 'Account created. Check your email to confirm it, then sign in.' });
    return json(res, 200, { accessToken: result.access_token, expiresIn: result.expires_in, user: { id: result.user.id, email: result.user.email } });
  } catch (error) {
    console.error('Customer authentication failed:', error.message);
    return json(res, error.message.startsWith('Backend is not configured') ? 503 : 500, { error: error.message.startsWith('Backend is not configured') ? error.message : 'Unable to sign in right now. Try again shortly.' });
  }
};
