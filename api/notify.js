// /api/notify.js
// Called right when something new happens: a Buy & Sell item is posted,
// an auction is created, or an admin publishes an opportunity.
// Looks up who opted in (profiles table) and emails them via Resend.

const { createClient } = require('@supabase/supabase-js');
const { sendEmail } = require('../lib/sendEmail');

const TYPE_TO_COLUMN = {
  buy_sell: 'notify_buy_sell',
  auction: 'notify_auctions',
  opportunity: 'notify_opportunities',
};

const TYPE_LABEL = {
  buy_sell: 'New item for sale',
  auction: 'New auction',
  opportunity: 'New opportunity',
};

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });

  // Lightweight shared-secret check so random visitors can't spam-trigger emails.
  // (Not bulletproof — it's embedded in public JS — but stops casual abuse.)
  if (req.headers['x-notify-secret'] !== process.env.NOTIFY_SECRET) {
    return res.status(401).json({ error: 'Not authorized' });
  }

  try {
    const { type, title, description, link, extra } = req.body || {};
    const column = TYPE_TO_COLUMN[type];
    if (!column) return res.status(400).json({ error: 'Invalid type' });

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data: recipients, error } = await supabase
      .from('profiles')
      .select('email')
      .eq(column, true);

    if (error) return res.status(500).json({ error: error.message });
    if (!recipients || recipients.length === 0) {
      return res.status(200).json({ sent: 0, note: 'No subscribers for this type' });
    }

    const subject = `${TYPE_LABEL[type]}: ${title || ''}`;
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;">
        <h2 style="color:#0f172a;">${escapeHtml(TYPE_LABEL[type])}</h2>
        <h3 style="margin-bottom:4px;">${escapeHtml(title || '')}</h3>
        <p style="color:#475569;">${escapeHtml(description || '')}</p>
        ${extra ? `<p style="color:#475569;">${escapeHtml(extra)}</p>` : ''}
        ${link ? `<a href="${escapeHtml(link)}" style="display:inline-block;margin-top:14px;background:#0284c7;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:bold;">View it now</a>` : ''}
        <p style="color:#94a3b8;font-size:12px;margin-top:30px;">You're receiving this because you opted in on BUGINGO Ally Baba. You can turn this off anytime from the account icon on the site.</p>
      </div>`;

    const results = await Promise.allSettled(
      recipients.map((r) => sendEmail(r.email, subject, html))
    );
    const sent = results.filter((r) => r.status === 'fulfilled').length;
    const viaFallback = results.filter(
      (r) => r.status === 'fulfilled' && r.value.provider === 'emailjs'
    ).length;

    return res.status(200).json({ sent, total: recipients.length, viaFallback });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
};

function escapeHtml(s) {
  return (s || '').toString().replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
