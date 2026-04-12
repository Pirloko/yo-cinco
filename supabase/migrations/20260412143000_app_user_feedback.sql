-- Comentarios de la app (sugerencias, opiniones, errores) desde jugadores → solo admin lee.

CREATE TABLE IF NOT EXISTS public.app_user_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  message TEXT NOT NULL CHECK (
    char_length(trim(message)) >= 1
    AND char_length(message) <= 4000
  ),
  app_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_user_feedback_created
  ON public.app_user_feedback (created_at DESC);

COMMENT ON TABLE public.app_user_feedback IS
  'Mensajes de usuarios (sugerencias, opiniones, errores). Insert: autenticado; SELECT: admin.';

ALTER TABLE public.app_user_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_user_feedback_insert_own ON public.app_user_feedback;
CREATE POLICY app_user_feedback_insert_own
  ON public.app_user_feedback
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS app_user_feedback_select_admin ON public.app_user_feedback;
CREATE POLICY app_user_feedback_select_admin
  ON public.app_user_feedback
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

GRANT SELECT, INSERT ON public.app_user_feedback TO authenticated;
