-- Fase 8: índices para rangos admin/KPI y filtros frecuentes (reduce sequential scans).

CREATE INDEX IF NOT EXISTS idx_match_opportunities_created_at
  ON public.match_opportunities (created_at);

CREATE INDEX IF NOT EXISTS idx_profiles_account_created
  ON public.profiles (account_type, created_at);

CREATE INDEX IF NOT EXISTS idx_rival_challenges_challenger
  ON public.rival_challenges (challenger_team_id);

CREATE INDEX IF NOT EXISTS idx_rival_challenges_challenged
  ON public.rival_challenges (challenged_team_id);

CREATE INDEX IF NOT EXISTS idx_rival_challenges_accepted
  ON public.rival_challenges (accepted_team_id);

CREATE INDEX IF NOT EXISTS idx_app_user_feedback_user
  ON public.app_user_feedback (user_id);
