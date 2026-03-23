/**
 * api/my-videos.js
 * ─────────────────────────────────────────────
 * Returns all saved videos for a browser session.
 * No login needed — identified by session_id from localStorage.
 *
 * GET ?session_id=xxx&limit=20&offset=0
 * Response: { videos: [...], total: N }
 *
 * DELETE ?session_id=xxx&id=yyy  — delete one video
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(200).json({ videos: [], total: 0 });
  }

  const session_id = req.query.session_id || req.body?.session_id;
  if (!session_id) return res.status(400).json({ error: 'session_id required' });

  // ── DELETE one video ──
  if (req.method === 'DELETE') {
    const id = req.query.id;
    if (!id) return res.status(400).json({ error: 'id required' });

    await fetch(
      `${supabaseUrl}/rest/v1/videos?id=eq.${id}&session_id=eq.${session_id}`,
      {
        method: 'DELETE',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
      }
    );
    return res.status(200).json({ deleted: true });
  }

  // ── GET history ──
  if (req.method === 'GET') {
    const limit  = Math.min(50, parseInt(req.query.limit  || '20'));
    const offset = parseInt(req.query.offset || '0');

    const url = `${supabaseUrl}/rest/v1/videos` +
      `?session_id=eq.${encodeURIComponent(session_id)}` +
      `&order=created_at.desc` +
      `&limit=${limit}` +
      `&offset=${offset}` +
      `&select=id,hook,niche,platform,voice_provider,caption_style,thumbnail,created_at`;

    const response = await fetch(url, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Prefer': 'count=exact',
      },
    });

    if (!response.ok) {
      return res.status(200).json({ videos: [], total: 0 });
    }

    const videos = await response.json();
    const total = parseInt(
      response.headers.get('content-range')?.split('/')[1] || videos.length
    );

    return res.status(200).json({ videos, total });
  }

  return res.status(405).json({ error: 'GET or DELETE only' });
}
