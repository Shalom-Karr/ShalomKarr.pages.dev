-- Unified analytics event log, modelled on SK Music's zemer_analytics.
--
-- One append-only table for every event type, and one function that returns the
-- entire dashboard as a single jsonb. The dashboard then makes one RPC call
-- rather than a dozen round trips, and the aggregation happens next to the data
-- instead of pulling every row into the browser.
--
-- Geo, IP and user-agent parsing happen server-side in the Pages Function at
-- functions/api/event.js. A client cannot be trusted to report its own country,
-- and request.cf gives it free and accurately.

CREATE TABLE IF NOT EXISTS public.site_events (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  event       TEXT NOT NULL,   -- 'view' | 'click' | 'outbound' | 'scroll' | 'exit'
  path        TEXT,
  referrer    TEXT,            -- external only; same-origin is noise
  ip          TEXT,            -- set server-side
  country     TEXT,            -- from request.cf
  city        TEXT,
  region      TEXT,
  user_agent  TEXT,
  browser     TEXT,            -- parsed server-side
  os          TEXT,
  device      TEXT,            -- 'desktop' | 'mobile' | 'tablet'
  screen      TEXT,            -- "1920x1080"
  viewport    TEXT,
  session     TEXT,            -- per-tab id, client-generated
  visitor     TEXT,            -- stable per-browser id, for new vs returning
  label       TEXT,            -- click text / section heading
  href        TEXT,            -- click destination
  section     TEXT,            -- nearest section id
  duration_s  INTEGER,         -- on 'exit'
  meta        JSONB
);

CREATE INDEX IF NOT EXISTS idx_se_created       ON public.site_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_se_event_created ON public.site_events (event, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_se_session       ON public.site_events (session);
CREATE INDEX IF NOT EXISTS idx_se_click_created ON public.site_events (created_at) WHERE event IN ('click','outbound');

ALTER TABLE public.site_events ENABLE ROW LEVEL SECURITY;

-- No anon policy at all. Writes arrive through the Pages Function using the
-- service role, which bypasses RLS - so the public site never touches this
-- table directly and cannot forge or read events.
DROP POLICY IF EXISTS "authenticated read site_events" ON public.site_events;
CREATE POLICY "authenticated read site_events"
  ON public.site_events FOR SELECT TO authenticated USING (true);


-- ===========================================================================
-- One call, whole dashboard.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.site_dashboard_summary(
  p_days  INT DEFAULT 30,
  p_limit INT DEFAULT 15
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER          -- runs as the caller, so RLS still applies
SET search_path = public
AS $$
DECLARE
  v_days  INT := GREATEST(1, LEAST(COALESCE(p_days, 30), 365));
  v_lim   INT := GREATEST(1, LEAST(COALESCE(p_limit, 15), 100));
  v_from  TIMESTAMPTZ := NOW() - (v_days || ' days')::INTERVAL;
  v_out   JSONB;
BEGIN
  WITH ev AS (
    SELECT * FROM site_events WHERE created_at >= v_from
  ),
  sessions AS (
    SELECT session,
           MIN(created_at) AS started,
           MAX(created_at) AS ended,
           COUNT(*)        AS events,
           MAX(duration_s) AS dur
    FROM ev WHERE session IS NOT NULL GROUP BY session
  ),
  -- A visitor seen before the window opened is returning, regardless of how
  -- often they appear inside it.
  first_seen AS (
    SELECT visitor, MIN(created_at) AS first_at
    FROM site_events WHERE visitor IS NOT NULL GROUP BY visitor
  )
  SELECT jsonb_build_object(
    'range_days', v_days,
    'generated_at', NOW(),

    'totals', jsonb_build_object(
      'events',    (SELECT COUNT(*) FROM ev),
      'sessions',  (SELECT COUNT(*) FROM sessions),
      'visitors',  (SELECT COUNT(DISTINCT visitor) FROM ev WHERE visitor IS NOT NULL),
      'visitors_ip', (SELECT COUNT(DISTINCT ip) FROM ev WHERE ip IS NOT NULL),
      'pageviews', (SELECT COUNT(*) FROM ev WHERE event = 'view'),
      'clicks',    (SELECT COUNT(*) FROM ev WHERE event IN ('click','outbound')),
      'outbound',  (SELECT COUNT(*) FROM ev WHERE event = 'outbound'),
      'today',     (SELECT COUNT(*) FROM ev WHERE created_at >= date_trunc('day', NOW())),
      'returning', (SELECT COUNT(DISTINCT e.visitor) FROM ev e
                      JOIN first_seen f ON f.visitor = e.visitor
                     WHERE f.first_at < v_from)
    ),

    'rates', jsonb_build_object(
      -- Bounce: a session that produced exactly one event.
      'bounce_pct', COALESCE((SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE events = 1)
                                           / NULLIF(COUNT(*), 0), 1) FROM sessions), 0),
      'avg_session_min', COALESCE((SELECT ROUND(AVG(EXTRACT(EPOCH FROM (ended - started)))::NUMERIC / 60, 2)
                                   FROM sessions WHERE ended > started), 0),
      'events_per_session', COALESCE((SELECT ROUND(AVG(events), 1) FROM sessions), 0)
    ),

    'by_path',     agg('path'),
    'by_referrer', agg('referrer'),
    'by_country',  agg('country'),
    'by_browser',  agg('browser'),
    'by_os',       agg('os'),
    'by_device',   agg('device'),
    'by_event',    agg('event'),
    'by_screen',   agg('screen'),

    -- Clicks are grouped by what was clicked, not merely counted.
    'by_click', (
      SELECT COALESCE(jsonb_agg(r), '[]'::jsonb) FROM (
        SELECT label AS key, href, COUNT(*) AS n
        FROM ev WHERE event IN ('click','outbound') AND label IS NOT NULL
        GROUP BY label, href ORDER BY n DESC LIMIT v_lim
      ) r
    ),

    'daily', (
      SELECT COALESCE(jsonb_agg(r ORDER BY r.day), '[]'::jsonb) FROM (
        SELECT date_trunc('day', created_at)::DATE AS day,
               COUNT(*) AS n,
               COUNT(DISTINCT visitor) AS visitors
        FROM ev GROUP BY 1
      ) r
    ),

    'hourly', (
      SELECT COALESCE(jsonb_agg(r ORDER BY r.hour), '[]'::jsonb) FROM (
        SELECT EXTRACT(HOUR FROM created_at)::INT AS hour, COUNT(*) AS n
        FROM ev GROUP BY 1
      ) r
    ),

    -- day-of-week x hour, for a heatmap of when people actually visit
    'heatmap', (
      SELECT COALESCE(jsonb_agg(r), '[]'::jsonb) FROM (
        SELECT EXTRACT(DOW  FROM created_at)::INT AS dow,
               EXTRACT(HOUR FROM created_at)::INT AS hour,
               COUNT(*) AS n
        FROM ev GROUP BY 1, 2
      ) r
    ),

    'recent', (
      SELECT COALESCE(jsonb_agg(r), '[]'::jsonb) FROM (
        SELECT created_at, event, path, label, href, ip, country, city, browser, os, device, referrer
        FROM ev ORDER BY created_at DESC LIMIT 100
      ) r
    )
  ) INTO v_out;

  RETURN v_out;
END;
$$;

-- Small helper so every breakdown is one call instead of a repeated subquery.
CREATE OR REPLACE FUNCTION public.agg(col TEXT)
RETURNS JSONB LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE r JSONB;
BEGIN
  EXECUTE format(
    'SELECT COALESCE(jsonb_agg(x), ''[]''::jsonb) FROM (
       SELECT %I AS key, COUNT(*) AS n FROM site_events
       WHERE %I IS NOT NULL AND created_at >= NOW() - INTERVAL ''30 days''
       GROUP BY 1 ORDER BY n DESC LIMIT 15) x', col, col)
  INTO r;
  RETURN r;
END;
$$;

REVOKE ALL ON FUNCTION public.site_dashboard_summary(INT, INT) FROM anon;
GRANT EXECUTE ON FUNCTION public.site_dashboard_summary(INT, INT) TO authenticated;
REVOKE ALL ON FUNCTION public.agg(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.agg(TEXT) TO authenticated;
