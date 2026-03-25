-- Pichanga — esquema inicial Supabase (PostgreSQL)
-- Alineado con lib/types.ts: Gender, Position, Level, MatchType, MatchStatus, User, Team, TeamInvite, MatchOpportunity, Match, Message
--
-- Cómo aplicar:
--   Supabase Dashboard → SQL Editor → pegar y ejecutar, o
--   supabase db push / supabase migration up (con CLI vinculada al proyecto)
--
-- Convenciones:
--   - IDs de usuario = auth.users.id (UUID), tabla public.profiles 1:1
--   - El chat del front usa matchId como id de oportunidad → messages.opportunity_id → match_opportunities

-- ---------------------------------------------------------------------------
-- Extensiones
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums (equivalentes a union types en TypeScript)
-- ---------------------------------------------------------------------------
CREATE TYPE public.gender AS ENUM ('male', 'female');
CREATE TYPE public.position AS ENUM ('portero', 'defensa', 'mediocampista', 'delantero');
CREATE TYPE public.skill_level AS ENUM ('principiante', 'intermedio', 'avanzado', 'competitivo');
CREATE TYPE public.match_type AS ENUM ('rival', 'players', 'open');
CREATE TYPE public.match_status AS ENUM ('pending', 'confirmed', 'completed', 'cancelled');
CREATE TYPE public.team_member_status AS ENUM ('confirmed', 'pending', 'invited');
CREATE TYPE public.invite_status AS ENUM ('pending', 'accepted', 'declined');
CREATE TYPE public.participant_status AS ENUM ('pending', 'confirmed', 'cancelled');

-- ---------------------------------------------------------------------------
-- Perfiles (extiende auth.users; el email vive en auth.users)
-- ---------------------------------------------------------------------------
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  age INTEGER NOT NULL DEFAULT 0 CHECK (age >= 0 AND age <= 120),
  gender public.gender NOT NULL DEFAULT 'male',
  position public.position NOT NULL DEFAULT 'mediocampista',
  level public.skill_level NOT NULL DEFAULT 'intermedio',
  city TEXT NOT NULL DEFAULT 'Rancagua',
  availability TEXT[] NOT NULL DEFAULT '{}',
  photo_url TEXT NOT NULL DEFAULT '',
  bio TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_profiles_city ON public.profiles (city);
CREATE INDEX idx_profiles_gender ON public.profiles (gender);

-- ---------------------------------------------------------------------------
-- Oportunidades de partido (listados / “busco rival”, “faltan jugadores”, etc.)
-- ---------------------------------------------------------------------------
CREATE TABLE public.match_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type public.match_type NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  location TEXT NOT NULL,
  venue TEXT NOT NULL,
  date_time TIMESTAMPTZ NOT NULL,
  level public.skill_level NOT NULL,
  creator_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  team_name TEXT,
  players_needed INTEGER CHECK (players_needed IS NULL OR players_needed >= 0),
  players_joined INTEGER NOT NULL DEFAULT 0 CHECK (players_joined >= 0),
  gender public.gender NOT NULL,
  status public.match_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_match_opportunities_creator ON public.match_opportunities (creator_id);
CREATE INDEX idx_match_opportunities_city_time ON public.match_opportunities (location, date_time);
CREATE INDEX idx_match_opportunities_gender ON public.match_opportunities (gender);
CREATE INDEX idx_match_opportunities_status ON public.match_opportunities (status);

-- ---------------------------------------------------------------------------
-- Quién se suma a una oportunidad (sustenta players_joined vía trigger)
-- ---------------------------------------------------------------------------
CREATE TABLE public.match_opportunity_participants (
  opportunity_id UUID NOT NULL REFERENCES public.match_opportunities (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  status public.participant_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (opportunity_id, user_id)
);

CREATE INDEX idx_mop_user ON public.match_opportunity_participants (user_id);

-- ---------------------------------------------------------------------------
-- Partido “confirmado” (instancia) — opcional para flujos post-oportunidad
-- ---------------------------------------------------------------------------
CREATE TABLE public.matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID REFERENCES public.match_opportunities (id) ON DELETE SET NULL,
  status public.match_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.match_participants (
  match_id UUID NOT NULL REFERENCES public.matches (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  PRIMARY KEY (match_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Mensajes: en el mock matchId = id de oportunidad
-- ---------------------------------------------------------------------------
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL REFERENCES public.match_opportunities (id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) > 0 AND char_length(content) <= 8000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_opportunity ON public.messages (opportunity_id, created_at);
CREATE INDEX idx_messages_sender ON public.messages (sender_id);

-- ---------------------------------------------------------------------------
-- Equipos y miembros
-- ---------------------------------------------------------------------------
CREATE TABLE public.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  logo_url TEXT,
  level public.skill_level NOT NULL,
  captain_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  city TEXT NOT NULL,
  gender public.gender NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_teams_captain ON public.teams (captain_id);
CREATE INDEX idx_teams_city ON public.teams (city);

CREATE TABLE public.team_members (
  team_id UUID NOT NULL REFERENCES public.teams (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  position public.position NOT NULL,
  photo_url TEXT NOT NULL DEFAULT '',
  status public.team_member_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, user_id)
);

CREATE INDEX idx_team_members_user ON public.team_members (user_id);

CREATE TABLE public.team_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams (id) ON DELETE CASCADE,
  inviter_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  invitee_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  status public.invite_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT team_invites_no_self CHECK (inviter_id <> invitee_id)
);

CREATE INDEX idx_team_invites_invitee ON public.team_invites (invitee_id, status);
CREATE UNIQUE INDEX uq_team_invites_pending ON public.team_invites (team_id, invitee_id)
  WHERE status = 'pending';

-- ---------------------------------------------------------------------------
-- updated_at automático
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profiles_updated
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

CREATE TRIGGER trg_match_opportunities_updated
  BEFORE UPDATE ON public.match_opportunities
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

CREATE TRIGGER trg_teams_updated
  BEFORE UPDATE ON public.teams
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Mantener players_joined al insertar/actualizar/borrar participantes
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_opportunity_players_joined()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  target UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target := OLD.opportunity_id;
  ELSE
    target := NEW.opportunity_id;
  END IF;

  UPDATE public.match_opportunities mo
  SET players_joined = (
    SELECT COUNT(*)::INTEGER
    FROM public.match_opportunity_participants p
    WHERE p.opportunity_id = mo.id
      AND p.status IN ('pending', 'confirmed')
  )
  WHERE mo.id = target;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_mop_refresh_count
  AFTER INSERT OR UPDATE OR DELETE ON public.match_opportunity_participants
  FOR EACH ROW EXECUTE PROCEDURE public.refresh_opportunity_players_joined();

-- ---------------------------------------------------------------------------
-- Perfil al registrarse (Supabase Auth → public.profiles)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name', '')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Realtime (Supabase): tablas útiles para suscripciones en el cliente
-- ---------------------------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.match_opportunities;
ALTER PUBLICATION supabase_realtime ADD TABLE public.match_opportunity_participants;

-- ---------------------------------------------------------------------------
-- Notas para el siguiente paso (RLS)
-- ---------------------------------------------------------------------------
-- Habilitar RLS y políticas por tabla. Sin políticas, el service_role bypass;
-- el cliente anon/authenticated debe quedar restringido según tu modelo.
