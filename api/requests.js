const { env, json, readJson, supabaseFetch, sendEmail } = require('./_lib/backend');

const clean = (value, max) => String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });
  try {
    const { url } = env();
    const origin = req.headers.origin;
    if (origin) {
      const originHost = new URL(origin).host;
      const requestHost = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
      if (requestHost && originHost !== requestHost) return json(res, 403, { error: 'Request origin not allowed.' });
    }
    const body = readJson(req);
    if (clean(body.website, 200)) return json(res, 200, { ok: true, message: 'Thanks, your request has been received.' });

    const requestType = body.requestType === 'part' ? 'part' : body.requestType === 'project' ? 'project' : null;
    const customerName = clean(body.name, 100);
    const customerEmail = clean(body.email, 254).toLowerCase();
    const description = clean(requestType === 'part' ? body.part : body.project, 3000);
    if (!requestType || customerName.length < 2 || !emailPattern.test(customerEmail) || description.length < 10) {
      return json(res, 400, { error: 'Please enter your name, a valid email, and a description of at least 10 characters.' });
    }

    const saved = await supabaseFetch('/rest/v1/customer_requests', {
      method: 'POST',
      headers: {
        Prefer: 'return=representation',
      },
      body: JSON.stringify({ request_type: requestType, customer_name: customerName, customer_email: customerEmail, description }),
    });
    const [record] = saved;
    if (process.env.ADMIN_NOTIFICATION_EMAIL) {
      try {
        await sendEmail({
          to: process.env.ADMIN_NOTIFICATION_EMAIL,
          subject: `New ProtoLab ${requestType} request`,
          text: `A new ${requestType} request was submitted.\n\nName: ${customerName}\nEmail: ${customerEmail}\n\n${description}\n\nRequest ID: ${record.id}`,
        });
      } catch (error) { console.error('Admin notification failed:', error.message); }
    }
    return json(res, 201, { ok: true, message: 'Thanks, your request has been received. We’ll review it and reply with an estimate.', id: record.id });
  } catch (error) {
    console.error('Request submission failed:', error.message);
    return json(res, error.message.startsWith('Backend is not configured') ? 503 : 500, {
      error: error.message.startsWith('Backend is not configured') ? error.message : 'Something went wrong. Please try again shortly.',
    });
  }
};
