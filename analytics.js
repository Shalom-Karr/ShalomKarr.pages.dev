// Click and visit analytics, writing straight to Supabase.
//
// Supersedes tracker.js, which recorded no page path (so you could not tell
// which page a visit belonged to) and awaited a third-party IP lookup inside
// pagehide — async work there usually never completes, so most visits were
// silently lost.

import { supabase } from './supabase-client.js';

const start = Date.now();
let visitLogged = false;

function meta() {
  const ua = navigator.userAgent;
  const browser =
    /Firefox/.test(ua) ? 'Firefox' :
    /SamsungBrowser/.test(ua) ? 'Samsung Internet' :
    /OPR|Opera/.test(ua) ? 'Opera' :
    /Edg/.test(ua) ? 'Edge' :
    /Chrome/.test(ua) ? 'Chrome' :
    /Safari/.test(ua) ? 'Safari' : 'Unknown';
  const os =
    /Android/.test(ua) ? 'Android' :
    /iPhone|iPad|like Mac/.test(ua) ? 'iOS' :
    /Win/.test(ua) ? 'Windows' :
    /Mac/.test(ua) ? 'macOS' :
    /Linux/.test(ua) ? 'Linux' : 'Unknown';

  return {
    browser,
    os,
    screen: `${window.screen.width}x${window.screen.height}`,
    language: navigator.language,
    // Same-origin referrers say nothing useful; external ones say where the
    // visitor came from, which is the only reason to keep this at all.
    referrer: document.referrer && !document.referrer.startsWith(location.origin)
      ? document.referrer
      : null,
  };
}

/** Nearest enclosing section id, so a click can be attributed to a part of the page. */
function sectionOf(el) {
  const s = el.closest('section[id], [data-section]');
  return s ? (s.id || s.dataset.section || null) : null;
}

function labelOf(el) {
  const text = (el.getAttribute('aria-label') || el.textContent || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text) return text.slice(0, 120);
  const img = el.querySelector('img[alt]');
  return img ? img.alt.slice(0, 120) : '(no label)';
}

async function insert(table, row) {
  try {
    const { error } = await supabase.from(table).insert([row]);
    if (error) console.warn(`analytics: ${table} insert failed`, error.message);
  } catch (e) {
    // Analytics must never break the page it is measuring.
    console.warn('analytics: insert threw', e);
  }
}

function trackClicks() {
  // One delegated listener rather than one per element, so links rendered
  // later — the project cards are generated at build time but the blog list is
  // client-side — are covered without re-binding.
  document.addEventListener(
    'click',
    (e) => {
      const el = e.target.closest('a[href], button');
      if (!el) return;
      if (el.dataset.noTrack !== undefined) return;

      const href = el.getAttribute('href') || null;
      const outbound = !!href && /^https?:\/\//.test(href) && !href.startsWith(location.origin);

      insert('site_clicks', {
        path: location.pathname,
        section: sectionOf(el),
        label: labelOf(el),
        href,
        kind: el.tagName === 'BUTTON' ? 'button' : outbound ? 'outbound' : 'link',
        meta: meta(),
      });
    },
    // Capture phase: a handler that calls stopPropagation or navigates away
    // would otherwise swallow the event before it reaches document.
    { capture: true },
  );
}

function trackVisit() {
  if (visitLogged) return;
  visitLogged = true;
  insert('page_visits', {
    path: location.pathname,
    duration_seconds: Math.round((Date.now() - start) / 1000),
    meta: meta(),
  });
}

export function initAnalytics() {
  trackClicks();
  // Duration needs the visit written at the end, but a write during unload is
  // unreliable — so also write once after 15s, which captures anyone who reads
  // rather than bounces. hasLogged keeps it to one row per session.
  setTimeout(trackVisit, 15_000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') trackVisit();
  });
  window.addEventListener('pagehide', trackVisit, { capture: true });
}
