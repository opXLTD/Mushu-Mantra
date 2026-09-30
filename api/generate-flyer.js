// /api/generate-flyer.js
// Runs on Vercel's server (Node runtime) — NEVER exposed to the browser.
// Keeps your Anthropic API key secret and does the real AI work.

const { createClient } = require('@supabase/supabase-js');

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

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST' });
  }

  try {
    // 1. Verify the caller is a logged-in admin (Supabase auth token from the browser)
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Missing auth token' });

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) {
      return res.status(401).json({ error: 'Not authorized' });
    }

    // 2. Read the uploaded file + company info from the request
    const { fileBase64, mediaType, companyName, companyContact, notes } = req.body || {};
    if (!fileBase64 || !mediaType) {
      return res.status(400).json({ error: 'fileBase64 and mediaType are required' });
    }

    const isPdf = mediaType === 'application/pdf';
    const fileBlock = isPdf
      ? { type: 'document', source: { type: 'base64', media_type: mediaType, data: fileBase64 } }
      : { type: 'image', source: { type: 'base64', media_type: mediaType, data: fileBase64 } };

    const userText = `Company running this application-support service: ${companyName || '(not provided)'}
Company contact for "need help applying": ${companyContact || '(not provided)'}
Extra notes from the admin: ${notes || '(none)'}

Analyze the attached opportunity document and return the JSON described in your instructions.`;

    // 3. Call the real AI
    const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: [
          { role: 'user', content: [fileBlock, { type: 'text', text: userText }] },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      return res.status(502).json({ error: 'AI request failed', details: errText });
    }

    const aiData = await aiResponse.json();
    const rawText = (aiData.content || [])
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('')
      .trim();

    let flyer;
    try {
      const cleaned = rawText.replace(/^```json|```$/g, '').trim();
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
    return res.status(500).json({ error: 'Server error', details: String(err) });
  }
};
