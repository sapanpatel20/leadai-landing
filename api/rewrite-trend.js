/**
 * api/rewrite-trend.js
 * ─────────────────────────────────────────────
 * Takes a trending TikTok script + user's business niche
 * → Claude rewrites it as a unique, industry-specific script
 * → Returns in LeadAI [HOOK][BODY][CTA] format
 *
 * POST body:
 *   {
 *     trendingText: "original viral script text",
 *     niche: "real estate agent in Dubai",
 *     platform: "Instagram Reels",
 *     tone: "Professional",
 *     cta: "Book a free consultation",
 *     audience: "First-time investors aged 30-45"
 *   }
 *
 * Response: { script: "[HOOK]...[BODY]...[CTA]..." }
 *
 * Vercel env var: ANTHROPIC_API_KEY
 */

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' });
  }

  const {
    trendingText = '',
    niche = 'business',
    platform = 'Instagram Reels',
    tone = 'Professional',
    cta = 'Book a free consultation',
    audience = 'local business owners',
  } = req.body;

  if (!trendingText) return res.status(400).json({ error: 'trendingText is required' });

  const prompt = `You are a viral short-form video script writer specialising in ${niche}.

A trending video in your niche has this script:
---
${trendingText.slice(0, 800)}
---

Your job: rewrite this as a UNIQUE script for a ${niche} business posting on ${platform}.

Rules:
- Steal the STRUCTURE and HOOK STYLE — not the words. Make it completely original.
- Write specifically for: ${niche}
- Target audience: ${audience}
- Tone: ${tone}
- Duration: 30 seconds when spoken aloud (roughly 70-80 words for the body)
- End with this CTA: "${cta}"
- Do NOT copy any phrases from the original. It must pass plagiarism checks.
- Make the hook controversial, surprising or counter-intuitive — something that stops the scroll.

Return ONLY this exact format, nothing else:

[HOOK]
Your attention-grabbing opening line (1-2 sentences max)

[BODY]
The main content (3-5 short punchy points, no bullet symbols, natural speech)

[CTA]
${cta}

[CAPTION]
One short punchy line for the video overlay caption

[HASHTAGS]
5-8 relevant hashtags without # symbol, comma separated`;

  try {
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 600,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.text();
      return res.status(claudeRes.status).json({ error: `Claude error: ${err}` });
    }

    const data = await claudeRes.json();
    const script = data.content?.[0]?.text || '';

    return res.status(200).json({ script, niche, platform });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
