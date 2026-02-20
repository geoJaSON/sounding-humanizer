/**
 * Vercel serverless function: proxy to University of Wyoming sounding data.
 * GET /api/sounding?region=...&TYPE=...&YEAR=...&MONTH=...&FROM=...&TO=...&STNM=...
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }

  const qs = new URLSearchParams(req.query).toString();
  const url = `https://weather.uwyo.edu/cgi-bin/sounding${qs ? '?' + qs : ''}`;

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'SoundingHumanizer/1.0 (https://github.com/sounding-humanizer)' },
    });
    const text = await response.text();
    const contentType = response.headers.get('content-type') || 'text/html';
    res.status(response.status).setHeader('Content-Type', contentType).end(text);
  } catch (err) {
    console.error('Sounding proxy error:', err);
    res.status(502).setHeader('Content-Type', 'text/plain').end('Failed to fetch sounding data.');
  }
}
