-- Desafíos de rival: directo a equipo o búsqueda abierta

CREATE TYPE public.rival_challenge_mode AS ENUM ('direct', 'open');
CREATE TYPE public.rival_challenge_status AS ENUM ('pending', 'accepted', 'declined', 'cancelled');

CREATE TABLE public.rival_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL UNIQUE REFERENCES public.match_opportunities (id) ON DELETE CASCADE,
  challenger_team_id UUID NOT NULL REFERENCES public.teams (id) ON DELETE CASCADE,
  challenger_captain_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  challenged_team_id UUID REFERENCES public.teams (id) ON DELETE SET NULL,
  challenged_captain_id UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  accepted_team_id UUID REFERENCES public.teams (id) ON DELETE SET NULL,
  accepted_captain_id UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  mode public.rival_challenge_mode NOT NULL,
  status public.rival_challenge_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ,
  CHECK (
    (mode = 'direct' AND challenged_team_id IS NOT NULL AND challenged_captain_id IS NOT NULL)
    OR
    (mode = 'open')
  )
);

CREATE INDEX idx_rival_challenges_status ON public.rival_challenges (status);
CREATE INDEX idx_rival_challenges_challenged_cap ON public.rival_challenges (challenged_captain_id);
CREATE INDEX idx_rival_challenges_challenger_cap ON public.rival_challenges (challenger_captain_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.rival_challenges;

ALTER TABLE public.rival_challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY rival_challenges_select_related
  ON public.rival_challenges
  FOR SELECT
  TO authenticated
  USING (
    challenger_captain_id = auth.uid()
    OR challenged_captain_id = auth.uid()
    OR (
      mode = 'open'
      AND status = 'pending'
      AND EXISTS (
        SELECT 1
        FROM public.teams t
        WHERE t.captain_id = auth.uid()
          AND t.id <> challenger_team_id
      )
    )
  );

CREATE POLICY rival_challenges_insert_challenger
  ON public.rival_challenges
  FOR INSERT
  TO authenticated
  WITH CHECK (challenger_captain_id = auth.uid());

CREATE POLICY rival_challenges_update_accept_decline
  ON public.rival_challenges
  FOR UPDATE
  TO authenticated
  USING (
    status = 'pending'
    AND (
      challenged_captain_id = auth.uid()
      OR (
        mode = 'open'
        AND EXISTS (
          SELECT 1
          FROM public.teams t
          WHERE t.captain_id = auth.uid()
            AND t.id <> challenger_team_id
        )
      )
      OR challenger_captain_id = auth.uid()
    )
  )
  WITH CHECK (
    (
      status IN ('accepted', 'declined')
      AND (
        challenged_captain_id = auth.uid()
        OR (
          mode = 'open'
          AND EXISTS (
            SELECT 1
            FROM public.teams t
            WHERE t.captain_id = auth.uid()
              AND t.id = accepted_team_id
          )
        )
      )
    )
    OR (status = 'cancelled' AND challenger_captain_id = auth.uid())
  );
