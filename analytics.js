// Client analytics. Sends compact events to /api/event, which enriches them
// with IP, geo and a parsed user agent before writing to Supabase.
//
// Nothing here talks to Supabase directly: a browser cannot be trusted to
// report its own country, and keeping the write server-side means site_events
// needs no anon INSERT policy, so events cannot be forged.

const ENDPOINT = '/api/event';

// Per-tab session, per-browser visitor. The pair is what makes "new vs
// returning" and "events per session" answerable.
const session = (() => {
  try {
    let s = sessionStorage.getItem('sk_sid');
    if (!s) { s = crypto.randomUUID(); sessionStorage.setItem('sk_sid', s); }
    return s;
  } catch { return null; }
})();

const visitor = (() => {
  try {
    let v = localStorage.getItem('sk_vid');
    if (!v) { v = crypto.randomUUID(); localStorage.setItem('sk_vid', v); }
    return v;
  } catch { return null; }
})();

const start = Date.now();
let maxScroll = 0;
let exited = false;

const base = () => ({
  path: location.pathname,
  referrer: document.referrer || null,
  screen: `${screen.width}x${screen.height}`,
  viewport: `${innerWidth}x${innerHeight}`,
  session,
  visitor,
});

// Batched so a burst of clicks is one request. Flushed on a short timer, and
// synchronously on unload via sendBeacon.
let queue = [];
let flushTimer = null;

function flush(useBeacon = false) {
  if (!queue.length) return;
  const payload = JSON.stringify(queue);
  queue = [];
  clearTimeout(flushTimer);
  flushTimer = null;

  // sendBeacon survives page unload where fetch does not; it is the only
  // reliable way to record the exit event.
  if (useBeacon && navigator.sendBeacon) {
    navigator.sendBeacon(ENDPOINT, new Blob([payload], { type: 'application/json' }));
    return;
  }
  fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: payload,
    keepalive: true,
  }).catch(() => {}); // analytics must never break the page
}

function send(event, extra = {}) {
  queue.push({ event, ...base(), ...extra });
  if (!flushTimer) flushTimer = setTimeout(() => flush(false), 1500);
}

function sectionOf(el) {
  const s = el.closest('section[id], [data-section]');
  return s ? (s.id || s.dataset.section || null) : null;
}

function labelOf(el) {
  const t = (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim();
  if (t) return t.slice(0, 120);
  const img = el.querySelector('img[alt]');
  return img?.alt ? img.alt.slice(0, 120) : '(no label)';
}

export function initAnalytics() {
  send('view');

  // Capture phase: a handler that navigates away or calls stopPropagation
  // would otherwise swallow the event before it reached document.
  document.addEventListener('click', (e) => {
    const el = e.target.closest('a[href], button');
    if (!el || el.dataset.noTrack !== undefined) return;
    const href = el.getAttribute('href') || null;
    const outbound = !!href && /^https?:\/\//.test(href) && !href.startsWith(location.origin);
    send(outbound ? 'outbound' : 'click', {
      label: labelOf(el),
      href,
      section: sectionOf(el),
    });
    // A click that leaves the page must go out now, not on the 1.5s timer.
    if (outbound || (href && !href.startsWith('#'))) flush(true);
  }, { capture: true });

  // Scroll depth, sampled rather than measured continuously - the passive
  // listener only updates a number and the value is reported once, on exit.
  addEventListener('scroll', () => {
    const h = document.documentElement.scrollHeight - innerHeight;
    if (h > 0) maxScroll = Math.max(maxScroll, Math.round((scrollY / h) * 100));
  }, { passive: true });

  const exit = () => {
    if (exited) return;
    exited = true;
    send('exit', {
      duration_s: Math.round((Date.now() - start) / 1000),
      meta: { scroll_pct: Math.min(100, maxScroll) },
    });
    flush(true);
  };

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') exit();
  });
  addEventListener('pagehide', exit, { capture: true });
}
