// /lib/sendEmail.js
// Shared by every /api function that sends email.
// Tries Resend first. If it fails for ANY reason (quota used up, network
// error, bad request, etc.) it automatically falls back to EmailJS —
// no manual switching needed.

async function sendViaResend(to, subject, html) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({ from: process.env.FROM_EMAIL, to, subject, html }),
  });
  if (!res.ok) throw new Error('Resend failed: ' + (await res.text()));
  return res.json();
}

async function sendViaEmailJS(to, subject, html) {
  // In EmailJS's dashboard, your template needs variables named
  // to_email, subject, and message_html (use triple braces {{{message_html}}}
  // in the template body so the HTML renders instead of showing as text).
  const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: process.env.EMAILJS_SERVICE_ID,
      template_id: process.env.EMAILJS_TEMPLATE_ID,
      user_id: process.env.EMAILJS_PUBLIC_KEY,
      accessToken: process.env.EMAILJS_PRIVATE_KEY, // required for server-side sending
      template_params: { to_email: to, subject, message_html: html },
    }),
  });
  if (!res.ok) throw new Error('EmailJS failed: ' + (await res.text()));
  return true;
}

/**
 * Sends one email, trying Resend first and EmailJS as a fallback.
 * Returns { ok: true, provider: 'resend'|'emailjs' } or throws if both fail.
 */
async function sendEmail(to, subject, html) {
  try {
    await sendViaResend(to, subject, html);
    return { ok: true, provider: 'resend' };
  } catch (resendErr) {
    try {
      await sendViaEmailJS(to, subject, html);
      return { ok: true, provider: 'emailjs' };
    } catch (emailjsErr) {
      throw new Error(
        `Both providers failed. Resend: ${resendErr.message} | EmailJS: ${emailjsErr.message}`
      );
    }
  }
}

module.exports = { sendEmail };
