-- WhatsApp + reglas internas: solo miembros del equipo (y capitán) pueden leer; solo capitán escribe.

CREATE TABLE public.team_private_settings (
  team_id UUID PRIMARY KEY REFERENCES public.teams (id) ON DELETE CASCADE,
  whatsapp_invite_url TEXT,
  rules_text TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_team_private_settings_updated ON public.team_private_settings;
CREATE TRIGGER trg_team_private_settings_updated
  BEFORE UPDATE ON public.team_private_settings
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

ALTER TABLE public.team_private_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY team_private_settings_select_member_or_captain
  ON public.team_private_settings
  FOR SELECT
  TO authenticated
  USING (
    public.is_team_member(team_id, auth.uid())
    OR public.is_team_captain(team_id)
  );

CREATE POLICY team_private_settings_insert_captain
  ON public.team_private_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_team_captain(team_id));

CREATE POLICY team_private_settings_update_captain
  ON public.team_private_settings
  FOR UPDATE
  TO authenticated
  USING (public.is_team_captain(team_id))
  WITH CHECK (public.is_team_captain(team_id));

CREATE POLICY team_private_settings_delete_captain
  ON public.team_private_settings
  FOR DELETE
  TO authenticated
  USING (public.is_team_captain(team_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_private_settings TO authenticated;
