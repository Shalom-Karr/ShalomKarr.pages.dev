-- Run this whole block in the Supabase SQL editor. It is idempotent.
--
-- Fixes two things found live:
--   1. page_visits still returns visitor IP addresses to the anon key, because
--      an earlier permissive SELECT policy was never removed. Postgres OR's
--      policies together, so adding an authenticated-only policy does not revoke
--      anon access - every existing policy must be dropped first.
--   2. site_events should be readable by admins only.

-- ---- page_visits: anon may INSERT, only authenticated may READ -------------
ALTER TABLE public.page_visits ENABLE ROW LEVEL SECURITY;
-- FORCE also applies RLS to the table owner, closing a bypass if the owner ever
-- queries through PostgREST.
ALTER TABLE public.page_visits FORCE ROW LEVEL SECURITY;

-- Drop EVERY existing policy by name, whatever it was called.
DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'page_visits'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.page_visits', p.policyname);
  END LOOP;
END $$;

CREATE POLICY "anon insert page_visits"
  ON public.page_visits FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "authenticated read page_visits"
  ON public.page_visits FOR SELECT TO authenticated USING (true);

-- ---- site_events: admins read only; writes come via the service role -------
ALTER TABLE public.site_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_events FORCE ROW LEVEL SECURITY;

DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'site_events'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.site_events', p.policyname);
  END LOOP;
END $$;

CREATE POLICY "authenticated read site_events"
  ON public.site_events FOR SELECT TO authenticated USING (true);

-- Verify: both should return the policies you just made, and nothing granting
-- anon SELECT.
-- SELECT tablename, policyname, cmd, roles FROM pg_policies
-- WHERE tablename IN ('page_visits','site_events') ORDER BY tablename, policyname;
