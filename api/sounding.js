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

  // Abort if the upstream archive hangs, so the function doesn't sit until the
  // platform timeout.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'SoundingHumanizer/1.0 (https://github.com/sounding-humanizer)' },
      signal: controller.signal,
    });
    const text = await response.text();
    const contentType = response.headers.get('content-type') || 'text/html';

    // Archived soundings are immutable once published, so let the CDN cache
    // successful responses. Errors stay uncached so a retry can succeed.
    if (response.ok) {
      res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    }

    res.status(response.status).setHeader('Content-Type', contentType).end(text);
  } catch (err) {
    const aborted = err.name === 'AbortError';
    console.error('Sounding proxy error:', err);
    res.status(aborted ? 504 : 502)
      .setHeader('Content-Type', 'text/plain')
      .end(aborted ? 'Upstream sounding archive timed out.' : 'Failed to fetch sounding data.');
  } finally {
    clearTimeout(timeout);
  }
}
