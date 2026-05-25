-- Drop overly permissive policies
DROP POLICY IF EXISTS rooms_all ON public.rooms;
DROP POLICY IF EXISTS players_all ON public.players;
DROP POLICY IF EXISTS answers_all ON public.answers;

-- Read-only access for clients (needed for realtime + UI)
CREATE POLICY rooms_select ON public.rooms FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY players_select ON public.players FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY answers_select ON public.answers FOR SELECT TO anon, authenticated USING (true);

-- No INSERT/UPDATE/DELETE policies = all writes blocked for anon/authenticated.
-- The service role (used by server functions) bypasses RLS.
