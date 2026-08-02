/**
 * Analytics ingest. The client posts a small event; everything that a browser
 * should not be trusted to report about itself — IP, country, city, and the
 * parsed user agent — is filled in here.
 *
 * Writes with the service role, so site_events needs no anon INSERT policy and
 * the public site can neither forge events nor read anyone else's.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY as an encrypted Pages environment variable.
 */

const SUPABASE_URL = 'https://qvoxpfigbukidlmshiei.supabase.co';

function parseUa(ua = '') {
  const browser =
    /Firefox\//.test(ua) ? 'Firefox' :
    /SamsungBrowser/.test(ua) ? 'Samsung Internet' :
    /OPR\/|Opera/.test(ua) ? 'Opera' :
    /Edg\//.test(ua) ? 'Edge' :
    /Chrome\//.test(ua) ? 'Chrome' :
    /Safari\//.test(ua) ? 'Safari' :
    /bot|crawl|spider/i.test(ua) ? 'Bot' : 'Unknown';

  const os =
    /Android/.test(ua) ? 'Android' :
    /iPhone|iPad|iPod/.test(ua) ? 'iOS' :
    /Windows NT/.test(ua) ? 'Windows' :
    /Mac OS X/.test(ua) ? 'macOS' :
    /Linux/.test(ua) ? 'Linux' : 'Unknown';

  // iPad reports a desktop UA in recent iPadOS, so tablet detection checks the
  // explicit tokens first and treats the rest as desktop.
  const device =
    /iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/.test(ua) ? 'tablet' :
    /Mobile|iPhone|Android|IEMobile|BlackBerry/.test(ua) ? 'mobile' : 'desktop';

  return { browser, os, device };
}

const ALLOWED = new Set(['view', 'click', 'outbound', 'scroll', 'exit']);

export async function onRequestPost(context) {
  const { request, env } = context;

  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    // Fail quietly: a missing key must not surface as a console error on every
    // page view of the live site.
    return new Response(null, { status: 204 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(null, { status: 204 });
  }

  const events = (Array.isArray(body) ? body : [body])
    .filter((e) => e && ALLOWED.has(e.event))
    .slice(0, 20); // one beacon should never write hundreds of rows
  if (!events.length) return new Response(null, { status: 204 });

  const ua = request.headers.get('user-agent') || '';
  const { browser, os, device } = parseUa(ua);
  const cf = request.cf || {};
  const ip = request.headers.get('CF-Connecting-IP') || null;

  const rows = events.map((e) => ({
    event: e.event,
    path: (e.path || '').slice(0, 300) || null,
    // Same-origin referrers say nothing; only external ones are worth storing.
    referrer: e.referrer && !String(e.referrer).includes(new URL(request.url).host)
      ? String(e.referrer).slice(0, 300) : null,
    ip,
    country: cf.country || null,
    city: cf.city || null,
    region: cf.region || null,
    user_agent: ua.slice(0, 500),
    browser, os, device,
    screen: e.screen || null,
    viewport: e.viewport || null,
    session: e.session || null,
    visitor: e.visitor || null,
    label: e.label ? String(e.label).slice(0, 200) : null,
    href: e.href ? String(e.href).slice(0, 500) : null,
    section: e.section || null,
    duration_s: Number.isFinite(e.duration_s) ? Math.min(e.duration_s, 86400) : null,
    meta: e.meta || null,
  }));

  try {
    await fetch(`${SUPABASE_URL}/rest/v1/site_events`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'content-type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(rows),
    });
  } catch {
    // Swallow: analytics must never affect the response the visitor gets.
  }

  // 204 with no body — the client uses sendBeacon and ignores the response.
  return new Response(null, { status: 204 });
}
