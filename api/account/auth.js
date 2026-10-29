const { env, json, readJson } = require('../_lib/backend');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });
  try {
    const { url, anonKey } = env();
    const body = readJson(req);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const action = ['signup', 'resend', 'recover', 'refresh', 'update-password'].includes(body.action) ? body.action : 'login';
    if ((action !== 'refresh' && action !== 'update-password' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) || (['signup', 'login', 'update-password'].includes(action) && (password.length < 8 || password.length > 256)) || (action === 'refresh' && !body.refreshToken)) {
      return json(res, 400, { error: action === 'resend' ? 'Enter the email address you used to create your account.' : 'Enter a valid email and a password of at least 8 characters.' });
    }
    const endpoint = action === 'signup' ? '/auth/v1/signup' : action === 'resend' ? '/auth/v1/resend' : action === 'recover' ? '/auth/v1/recover' : action === 'refresh' ? '/auth/v1/token?grant_type=refresh_token' : action === 'update-password' ? '/auth/v1/user' : '/auth/v1/token?grant_type=password';
    const response = await fetch(`${url}${endpoint}`, {
      method: action === 'update-password' ? 'PUT' : 'POST',
      headers: { apikey: anonKey, 'Content-Type': 'application/json', ...(action === 'update-password' && req.headers.authorization ? { Authorization: req.headers.authorization } : {}) },
      body: JSON.stringify(action === 'signup'
        ? { email, password, data: { full_name: String(body.name || '').trim().slice(0, 100) } }
        : action === 'resend' ? { type: 'signup', email } : action === 'recover' ? { email, redirect_to: `${String(process.env.APP_URL || 'https://protolab-store.vercel.app').replace(/\/$/, '')}/account.html?recovery=1` } : action === 'refresh' ? { refresh_token: String(body.refreshToken) } : { email, password }),
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
    if (action === 'recover') return json(res, 200, { message: 'If an account exists for that email, a password reset link has been sent. Check your inbox and spam folder.' });
    if (action === 'update-password') return json(res, 200, { message: 'Password updated.' });
    if (!result.access_token) return json(res, 202, { confirmationRequired: true, message: 'Account created. Check your email to confirm it, then sign in.' });
    return json(res, 200, { accessToken: result.access_token, refreshToken: result.refresh_token, expiresIn: result.expires_in, user: { id: result.user.id, email: result.user.email } });
  } catch (error) {
    console.error('Customer authentication failed:', error.message);
    return json(res, error.message.startsWith('Backend is not configured') ? 503 : 500, { error: error.message.startsWith('Backend is not configured') ? error.message : 'Unable to sign in right now. Try again shortly.' });
  }
};
