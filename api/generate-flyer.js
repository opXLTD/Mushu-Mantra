// /api/generate-flyer.js
// Runs on Vercel's server (Node runtime) — NEVER exposed to the browser.
// Keeps your Anthropic API key secret and does the real AI work.

const { createClient } = require('@supabase/supabase-js');
const { requireAdmin } = require('../lib/requireAdmin');

// This is your pasted prompt, turned into the AI's system instructions.
const SYSTEM_PROMPT = `I am going to provide you with a job vacancy, university admission, scholarship, fellowship, internship, training opportunity, or another opportunity document in the form of a PDF, screenshot, image, poster, website capture, or file.

Your task is to carefully analyze the provided material and create a professional, attractive, trustworthy opportunity flyer designed to help people discover the opportunity and successfully apply.

Follow these rules:
- Identify the opportunity type (career, education, or other) and adapt tone accordingly.
- Extract ONLY information supported by the source (employer/university/provider, title, location, eligibility, requirements, benefits, deadline, official application method, official contact/link). Never invent missing information.
- Include the company's own branding as "Application Support by [Company Name]" — never claim official affiliation with the opportunity provider unless the source confirms it.
- Clearly separate the OFFICIAL APPLICATION section (the provider's own website/portal/email/link) from a "NEED APPLICATION HELP?" section showing the company's own contact info.
- Never change names, dates, deadlines, requirements, funding details, or links from the source.
- Never claim "fully funded", "100% admission" or "guaranteed visa" unless explicitly stated in the source.
- Prioritize: opportunity title, provider, who can apply, main benefit, key requirements, deadline, official application method, then support contact.

Respond ONLY with a single JSON object (no markdown fences, no commentary) with this exact shape:
{
  "opportunityType": "job | admission | scholarship | fellowship | internship | training | other",
  "title": "",
  "provider": "",
  "location": "",
  "whatIsIt": "",
  "whoIsItFor": "",
  "offers": ["", ""],
  "eligibility": ["", ""],
  "deadline": "",
  "officialApplication": { "method": "", "link": "", "contact": "" },
  "needHelp": { "companyName": "", "contact": "" },
  "callToAction": "",
  "styleTheme": "corporate | academic | prestigious | youthful | practical | international",
  "notesOnMissingInfo": ""
}
If a field is not present in the source, use an empty string or empty array — do not invent content.`;

// ---------- AI providers ----------
async function callGemini(fileBase64, mediaType, userText) {
  // Free tier: create a key at https://aistudio.google.com/apikey and set GEMINI_API_KEY on Vercel.
  // Model is configurable so you can switch without code changes if Google renames/retires one.
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{
        role: 'user',
        parts: [
          { inline_data: { mime_type: mediaType, data: fileBase64 } },
          { text: userText },
        ],
      }],
      generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 2000, temperature: 0.2 },
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Gemini ${r.status} (model ${model}): ${t.slice(0, 500)}`);
  }
  const data = await r.json();
  const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
  if (!text) {
    throw new Error('Gemini returned no text (blocked or empty): ' + JSON.stringify(data.promptFeedback || data.candidates?.[0]?.finishReason || ''));
  }
  return text;
}

async function callClaude(fileBase64, mediaType, isPdf, userText) {
  const fileBlock = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: mediaType, data: fileBase64 } }
    : { type: 'image', source: { type: 'base64', media_type: mediaType, data: fileBase64 } };
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.CLAUDE_MODEL || 'claude-sonnet-5-5',
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: [fileBlock, { type: 'text', text: userText }] }],
    }),
  });
  if (!r.ok) throw new Error(`Claude ${r.status}: ${(await r.text()).slice(0, 500)}`);
  const data = await r.json();
  return (data.content || []).map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST' });
  }

  try {
    // 1. Verify the caller is a logged-in ADMIN (must exist in the `admins` table)
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    const admin = await requireAdmin(req, res, supabase);
    if (!admin) return; // requireAdmin already sent the 401/403 response

    // 2. Read the uploaded file + company info from the request
    const { fileBase64, mediaType, companyName, companyContact, notes } = req.body || {};
    if (!fileBase64 || !mediaType) {
      return res.status(400).json({ error: 'fileBase64 and mediaType are required' });
    }

    const isPdf = mediaType === 'application/pdf';
    const userText = `Company running this application-support service: ${companyName || '(not provided)'}
Company contact for "need help applying": ${companyContact || '(not provided)'}
Extra notes from the admin: ${notes || '(none)'}

Analyze the attached opportunity document and return the JSON described in your instructions.`;

    // 3. Call the AI. AI_PROVIDER=gemini (default, has a free tier) or claude (paid credits).
    const provider = (process.env.AI_PROVIDER || 'gemini').toLowerCase();
    let rawText;
    try {
      rawText = provider === 'claude'
        ? await callClaude(fileBase64, mediaType, isPdf, userText)
        : await callGemini(fileBase64, mediaType, userText);
    } catch (aiErr) {
      console.error(`AI call failed (${provider}):`, aiErr.message);
      return res.status(502).json({ error: 'AI request failed', provider, details: aiErr.message });
    }

    let flyer;
    try {
      // Strip optional ```json fences, then parse
      const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
      flyer = JSON.parse(cleaned);
    } catch (e) {
      return res.status(502).json({ error: 'AI returned unparseable output', raw: rawText });
    }

    // 4. Save it so it shows up in the admin dashboard history (and can be published later)
    const { data: inserted, error: insertErr } = await supabase
      .from('poster_requests')
      .insert({
        opportunity_title: flyer.title || null,
        company_name: companyName || null,
        input_summary: notes || null,
        generated_flyer: flyer,
      })
      .select()
      .single();

    if (insertErr) {
      return res.status(200).json({ flyer, id: null, saveError: insertErr.message });
    }

    return res.status(200).json({ flyer, id: inserted.id });
  } catch (err) {
    console.error('generate-flyer failed:', err);
    return res.status(500).json({ error: 'Server error', details: String(err) });
  }
};
