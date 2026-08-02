-- Site-wide click tracking: one row per click on a tracked element.
--
-- Mirrors the access model already used by page_visits: `anon` may INSERT but
-- never SELECT, so a visitor records their own events and cannot read anyone
-- else's. The admin dashboard reads while signed in.

-- page_visits was created in schema.sql without a path column, so every visit
-- recorded which browser but not which page. Without this, analytics.js inserts
-- fail with 42703 (column "path" does not exist).
ALTER TABLE public.page_visits ADD COLUMN IF NOT EXISTS path TEXT;

CREATE TABLE IF NOT EXISTS public.site_clicks (
  id          BIGSERIAL PRIMARY KEY,
  clicked_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  path        TEXT NOT NULL,           -- page the click happened on
  section     TEXT,                    -- nearest section id, e.g. 'opensource'
  label       TEXT NOT NULL,           -- visible text or aria-label
  href        TEXT,                    -- destination for links
  kind        TEXT NOT NULL,           -- 'link' | 'button' | 'outbound'
  meta        JSONB                    -- browser, os, screen, referrer
);

-- The dashboard sorts by recency and groups by label; both benefit.
CREATE INDEX IF NOT EXISTS site_clicks_clicked_at_idx ON public.site_clicks (clicked_at DESC);
CREATE INDEX IF NOT EXISTS site_clicks_label_idx ON public.site_clicks (label);

ALTER TABLE public.site_clicks ENABLE ROW LEVEL SECURITY;

-- Insert: the public site, running as `anon`.
DROP POLICY IF EXISTS "anon insert site_clicks" ON public.site_clicks;
CREATE POLICY "anon insert site_clicks"
  ON public.site_clicks
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Read: admin dashboard only. Deliberately NOT granted to `anon`.
DROP POLICY IF EXISTS "authenticated read site_clicks" ON public.site_clicks;
CREATE POLICY "authenticated read site_clicks"
  ON public.site_clicks
  FOR SELECT
  TO authenticated
  USING (true);

-- Aggregation for the dashboard, so the browser fetches ~40 rows instead of
-- every click ever recorded and grouping them client-side.
CREATE OR REPLACE VIEW public.site_click_summary AS
SELECT
  label,
  kind,
  href,
  COUNT(*)                    AS clicks,
  COUNT(DISTINCT path)        AS pages,
  MAX(clicked_at)             AS last_clicked
FROM public.site_clicks
GROUP BY label, kind, href
ORDER BY clicks DESC;

-- Views run as their owner, so grant read explicitly and keep it off `anon`.
REVOKE ALL ON public.site_click_summary FROM anon;
GRANT SELECT ON public.site_click_summary TO authenticated;
