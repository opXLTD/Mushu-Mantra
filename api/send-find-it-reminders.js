// /api/send-find-it-reminders.js
// Triggered on a schedule by Vercel Cron (see vercel.json).
// Emails everyone who opted into "If it exists, we can find it" reminders.

const { createClient } = require('@supabase/supabase-js');
const { sendEmail } = require('../lib/sendEmail');

module.exports = async function handler(req, res) {
  // Vercel Cron calls this with a special header — reject anything else.
  if (
    req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}` &&
    process.env.NODE_ENV === 'production'
  ) {
    return res.status(401).json({ error: 'Not authorized' });
  }

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data: recipients, error } = await supabase
      .from('profiles')
      .select('email')
      .eq('notify_find_it', true);

    if (error) return res.status(500).json({ error: error.message });
    if (!recipients || recipients.length === 0) {
      return res.status(200).json({ sent: 0 });
    }

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;">
        <h2 style="color:#0f172a;">If it exists, we can find it.</h2>
        <p style="color:#475569;">Looking for a product or service in Rwanda? Our Find It team tracks it down for you — no more endless searching.</p>
        <a href="https://YOUR-DOMAIN.vercel.app/find-it/index.html" style="display:inline-block;margin-top:14px;background:#0284c7;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:bold;">Try Find It</a>
        <p style="color:#94a3b8;font-size:12px;margin-top:30px;">You're receiving this because you opted in on BUGINGO Ally Baba. You can turn this off anytime from the account icon on the site.</p>
      </div>`;

    const results = await Promise.allSettled(
      recipients.map((r) => sendEmail(r.email, "Looking for something? We'll find it.", html))
    );
    const sent = results.filter((r) => r.status === 'fulfilled').length;

    return res.status(200).json({ sent, total: recipients.length });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
};
