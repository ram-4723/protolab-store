const { json, readJson, supabaseFetch, authenticateAdmin, sendEmail } = require('../_lib/backend');

const allowedStatuses = new Set(['new', 'reviewing', 'quoted', 'in_progress', 'completed', 'declined']);
const shortText = (value, max) => String(value ?? '').trim().slice(0, max);

module.exports = async function handler(req, res) {
  try {
    const admin = await authenticateAdmin(req);
    if (!admin) return json(res, 401, { error: 'Please sign in with an authorized admin account.' });

    if (req.method === 'GET') {
      const requests = await supabaseFetch('/rest/v1/customer_requests?select=*&order=created_at.desc&limit=250');
      return json(res, 200, { requests });
    }
    if (req.method !== 'PATCH') return json(res, 405, { error: 'Method not allowed.' });

    const body = readJson(req);
    const id = String(body.id || '');
    if (!/^[0-9a-f-]{36}$/i.test(id)) return json(res, 400, { error: 'Invalid request ID.' });
    const update = { handled_by: admin.id };
    if (body.status !== undefined) {
      if (!allowedStatuses.has(body.status)) return json(res, 400, { error: 'Invalid request status.' });
      update.status = body.status;
    }
    if (body.estimatedTotalInr !== undefined) {
      if (body.estimatedTotalInr === '' || body.estimatedTotalInr === null) update.estimated_total_inr = null;
      else {
        const amount = Number(body.estimatedTotalInr);
        if (!Number.isFinite(amount) || amount < 0 || amount > 10000000) return json(res, 400, { error: 'Enter a valid estimated total.' });
        update.estimated_total_inr = amount;
      }
    }
    if (body.estimatedBuildTime !== undefined) update.estimated_build_time = shortText(body.estimatedBuildTime, 120) || null;
    if (body.adminNotes !== undefined) update.admin_notes = shortText(body.adminNotes, 5000) || null;
    if (body.sendQuote === true) {
      const quoteTotal = body.estimatedTotalInr === undefined ? update.estimated_total_inr : Number(body.estimatedTotalInr);
      if (quoteTotal === undefined || quoteTotal === null || body.estimatedTotalInr === '') return json(res, 400, { error: 'Add an estimated total before sending a quote.' });
      update.status = 'quoted';
      update.quote_sent_at = new Date().toISOString();
    }

    const [saved] = await supabaseFetch(`/rest/v1/customer_requests?id=eq.${encodeURIComponent(id)}&select=*`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(update),
    });
    if (!saved) return json(res, 404, { error: 'Request not found.' });

    let emailSent = false;
    if (body.sendQuote === true) {
      try {
        emailSent = await sendEmail({
          to: saved.customer_email,
          subject: 'Your ProtoLab project estimate',
          text: `Hi ${saved.customer_name},\n\nWe reviewed your ${saved.request_type} request.\n\nEstimated total: ₹${saved.estimated_total_inr ?? 'To be confirmed'}\nEstimated build time: ${saved.estimated_build_time || 'To be confirmed'}\n\n${saved.admin_notes ? `Note from ProtoLab: ${saved.admin_notes}\n\n` : ''}This is an estimate; we’ll confirm the final details with you before starting work.\n\nProtoLab`,
        });
      } catch (error) { console.error('Customer quote email failed:', error.message); }
    }
    return json(res, 200, { request: saved, emailSent });
  } catch (error) {
    console.error('Admin request operation failed:', error.message);
    return json(res, error.message.startsWith('Backend is not configured') ? 503 : 500, {
      error: error.message.startsWith('Backend is not configured') ? error.message : 'Unable to load or update requests right now.',
    });
  }
};
