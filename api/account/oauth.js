const { env, json } = require('../_lib/backend');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed.' });
  try {
    const { url, anonKey } = env();
    const forwardedHost = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
    const forwardedProto = String(req.headers['x-forwarded-proto'] || (forwardedHost.startsWith('localhost') || forwardedHost.startsWith('127.0.0.1') ? 'http' : 'https')).split(',')[0].trim();
    const origin = process.env.APP_URL || `${forwardedProto}://${forwardedHost}`;
    const redirectTo = `${origin.replace(/\/$/, '')}/account.html`;
    const authorize = new URL(`${url}/auth/v1/authorize`);
    authorize.searchParams.set('provider', 'google');
    authorize.searchParams.set('redirect_to', redirectTo);
    authorize.searchParams.set('flow_type', 'implicit');
    const response = await fetch(authorize, { headers: { apikey: anonKey }, redirect: 'manual' });
    const location = response.headers.get('location');
    if (response.status < 300 || response.status >= 400 || !location) {
      const detail = await response.text().catch(() => '');
      console.error('Google OAuth could not start:', response.status, detail.slice(0, 300));
      return json(res, 502, { error: 'Google sign-in is not enabled for this Supabase project yet. Configure Google under Supabase Authentication → Sign In / Providers.' });
    }
    res.statusCode = 302;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Location', location);
    return res.end();
  } catch (error) {
    console.error('Google OAuth setup failed:', error.message);
    return json(res, 503, { error: error.message.startsWith('Backend is not configured') ? error.message : 'Google sign-in is unavailable right now.' });
  }
};
