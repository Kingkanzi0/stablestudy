const { env } = require('../config');

/** Which email service is configured, if any. */
function emailProvider() {
  if (env.BREVO_API_KEY && env.EMAIL_FROM) return 'brevo';
  if (env.RESEND_API_KEY && env.EMAIL_FROM) return 'resend';
  return null;
}

/** "iSabi <hello@example.com>" -> { name: 'iSabi', email: 'hello@example.com' } */
function parseFrom(from) {
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(from);
  return m ? { name: m[1] || 'iSabi', email: m[2] } : { name: 'iSabi', email: from.trim() };
}

function codeEmail(code) {
  const subject = `${code} is your iSabi sign-in code`;
  const text = `Your iSabi sign-in code is ${code}.\n\nIt expires in 10 minutes. If you didn't ask for it, you can ignore this email.`;
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:420px;margin:auto;padding:24px;color:#13202e">
  <p style="font-size:20px;font-weight:800;color:#0e2a47;margin:0 0 16px"><span style="color:#a86a12">i</span>Sabi</p>
  <p style="margin:0 0 12px">Your sign-in code:</p>
  <p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:0 0 16px">${code}</p>
  <p style="color:#5a6a7d;font-size:14px;margin:0">It expires in 10 minutes. If you didn't ask for it, you can ignore this email.</p>
</div>`;
  return { subject, text, html };
}

/** Sends a sign-in code. Returns true when sent, false when no email service is configured. */
async function sendCodeEmail(to, code) {
  const provider = emailProvider();
  if (!provider) return false;
  const { subject, text, html } = codeEmail(code);
  let res;
  if (provider === 'brevo') {
    res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': env.BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ sender: parseFrom(env.EMAIL_FROM), to: [{ email: to }], subject, textContent: text, htmlContent: html }),
    });
  } else {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], subject, text, html }),
    });
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Email service ${provider} returned ${res.status}: ${detail.slice(0, 300)}`);
  }
  return true;
}

module.exports = { emailProvider, sendCodeEmail };
