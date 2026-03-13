export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (!process.env.PEXELS_API_KEY) {
    return res.status(500).json({ error: 'PEXELS_API_KEY not set in Vercel environment variables' });
  }

  const { query, per_page = 6 } = req.query;

  if (!query) {
    return res.status(400).json({ error: 'No search query provided' });
  }

  try {
    const response = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${per_page}&orientation=portrait`,
      {
        headers: {
          'Authorization': process.env.PEXELS_API_KEY
        }
      }
    );

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Pexels API error' });
    }

    const data = await response.json();

    const photos = data.photos.map(p => ({
      id: p.id,
      url: p.src.large,        // Full size
      thumb: p.src.medium,     // Smaller for faster load
      photographer: p.photographer,
      alt: p.alt || query
    }));

    return res.status(200).json({ photos });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
