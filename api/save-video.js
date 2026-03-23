/**
 * api/save-video.js
 * ─────────────────────────────────────────────
 * Called automatically after every video is generated.
 * Saves the script, settings, and canvas thumbnail to Supabase.
 *
 * POST body:
 *   {
 *     session_id: "uuid from localStorage",
 *     script: "[HOOK]...[BODY]...[CTA]...",
 *     niche: "real estate Dubai",
 *     platform: "Instagram Reels",
 *     tone: "Professional",
 *     voice_provider: "fish",
 *     caption_style: "bold_yellow",
 *     thumbnail: "data:image/png;base64,..."  (canvas snapshot, optional)
 *   }
 *
 * Supabase table needed (run in SQL Editor):
 *   create table videos (
 *     id uuid default gen_random_uuid() primary key,
 *     session_id text not null,
 *     script text,
 *     niche text,
 *     platform text,
 *     tone text,
 *     voice_provider text,
 *     caption_style text,
 *     thumbnail text,
 *     created_at timestamptz default now()
 *   );
 *   create index on videos (session_id);
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    // Fail silently — don't break the user's experience
    return res.status(200).json({ saved: false, reason: 'Supabase not configured' });
  }

  const {
    session_id,
    script = '',
    niche = '',
    platform = '',
    tone = '',
    voice_provider = '',
    caption_style = '',
    thumbnail = null,
  } = req.body;

  if (!session_id) return res.status(400).json({ error: 'session_id required' });

  // Extract hook line for quick preview
  const hookMatch = script.match(/\[HOOK\]([\s\S]*?)(?=\[|$)/i);
  const hook = hookMatch ? hookMatch[1].trim().slice(0, 120) : script.slice(0, 120);

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/videos`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({
        session_id,
        script,
        hook,
        niche,
        platform,
        tone,
        voice_provider,
        caption_style,
        thumbnail,
        created_at: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('save-video error:', err);
      return res.status(200).json({ saved: false, reason: err });
    }

    const data = await response.json();
    return res.status(200).json({ saved: true, id: data[0]?.id });

  } catch (err) {
    console.error('save-video catch:', err.message);
    return res.status(200).json({ saved: false, reason: err.message });
  }
}
