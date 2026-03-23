/**
 * api/trending.js
 * ─────────────────────────────────────────────
 * Scrapes trending TikTok videos for a given niche using Apify.
 * Returns cleaned video cards with hook text, views, thumbnail.
 *
 * POST body: { niche: "real estate Dubai", count: 8 }
 * Response:  { videos: [ { title, hook, views, likes, url, thumbnail, author } ] }
 *
 * Vercel env var: APIFY_API_KEY
 * Cost: ~$0.004 per video scraped = $0.032 for 8 videos
 */

export const config = { maxDuration: 45 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const apiKey = process.env.APIFY_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'APIFY_API_KEY not set in Vercel environment variables. Sign up free at apify.com — $5 credit included.'
    });
  }

  const { niche = 'business tips', count = 8 } = req.body;

  // Build search hashtags from niche
  // e.g. "real estate Dubai" → ["realestate", "realestatedubai", "dubai", "property"]
  const words = niche.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(' ').filter(Boolean);
  const hashtags = [
    words.join(''),               // "realestatedubai"
    words[0],                     // "realestate"
    ...words.slice(1),            // "dubai"
    words.join('') + 'tips',      // "realestatetips"
    words[0] + 'content',        // "realestatecontent"
  ].slice(0, 5);

  try {
    // Run the Apify TikTok Hashtag Scraper actor
    const runRes = await fetch(
      `https://api.apify.com/v2/acts/clockworks~tiktok-hashtag-scraper/run-sync-get-dataset-items?token=${apiKey}&limit=${Math.min(count * 3, 30)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hashtags: hashtags,
          resultsPerPage: Math.min(count * 3, 30),
          maxProfilesPerQuery: 3,
          shouldDownloadVideos: false,
          shouldDownloadCovers: false,
          shouldDownloadSubtitles: false,
        }),
      }
    );

    if (!runRes.ok) {
      const errText = await runRes.text();
      return res.status(runRes.status).json({ error: `Apify error ${runRes.status}: ${errText}` });
    }

    const rawItems = await runRes.json();

    // Clean and score the items
    const videos = rawItems
      .filter(item => item.text && item.playCount > 1000)
      .sort((a, b) => (b.playCount || 0) - (a.playCount || 0))
      .slice(0, count)
      .map(item => {
        // Extract the hook — first sentence or first 100 chars
        const text = (item.text || '').replace(/\n+/g, ' ').trim();
        const hookEnd = text.search(/[.!?]/);
        const hook = hookEnd > 10 && hookEnd < 120
          ? text.slice(0, hookEnd + 1)
          : text.slice(0, 100) + (text.length > 100 ? '...' : '');

        return {
          id: item.id || item.webVideoUrl,
          title: text.slice(0, 80),
          hook: hook,
          fullText: text.slice(0, 500),
          views: formatNum(item.playCount || 0),
          likes: formatNum(item.diggCount || 0),
          comments: formatNum(item.commentCount || 0),
          shares: formatNum(item.shareCount || 0),
          thumbnail: item.covers?.default || item.covers?.origin || '',
          url: item.webVideoUrl || `https://tiktok.com/@${item.authorMeta?.name}/video/${item.id}`,
          author: item.authorMeta?.name || 'creator',
          duration: item.videoMeta?.duration || 30,
          hashtags: (item.hashtags || []).slice(0, 5).map(h => h.name || h),
        };
      });

    return res.status(200).json({
      videos,
      niche,
      searched_hashtags: hashtags,
      total_found: rawItems.length,
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

function formatNum(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}
