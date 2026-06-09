-- MVP: empate en votos → todos los empatados suman 1 MVP cada uno.
-- Chat: mensajes permitidos hasta 24 h tras finalized_at (igual que reseñas).

CREATE OR REPLACE FUNCTION public.player_mvp_wins_count(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH vote_counts AS (
    SELECT
      mor.opportunity_id,
      mor.mvp_user_id,
      COUNT(*)::integer AS votes
    FROM public.match_opportunity_ratings mor
    WHERE mor.mvp_user_id IS NOT NULL
    GROUP BY mor.opportunity_id, mor.mvp_user_id
  ),
  max_votes AS (
    SELECT
      vote_counts.opportunity_id,
      MAX(vote_counts.votes) AS max_votes
    FROM vote_counts
    GROUP BY vote_counts.opportunity_id
  ),
  winners AS (
    SELECT vc.opportunity_id, vc.mvp_user_id
    FROM vote_counts vc
    INNER JOIN max_votes mv
      ON mv.opportunity_id = vc.opportunity_id
      AND vc.votes = mv.max_votes
  )
  SELECT COUNT(*)::integer
  FROM winners
  WHERE winners.mvp_user_id = p_user_id;
$$;

COMMENT ON FUNCTION public.player_mvp_wins_count(uuid) IS
  'Partidos donde el jugador fue MVP: si hay empate en votos, cada empatado suma 1 MVP.';

CREATE OR REPLACE FUNCTION public.can_send_opportunity_thread_message(p_opportunity_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.can_access_opportunity_thread(p_opportunity_id)
    AND EXISTS (
      SELECT 1
      FROM public.match_opportunities mo
      WHERE mo.id = p_opportunity_id
        AND mo.status IS DISTINCT FROM 'cancelled'::public.match_status
        AND (
          mo.status IS DISTINCT FROM 'completed'::public.match_status
          OR (
            mo.finalized_at IS NOT NULL
            AND now() <= mo.finalized_at + interval '24 hours'
          )
        )
    );
$$;

COMMENT ON FUNCTION public.can_send_opportunity_thread_message(uuid) IS
  'Envío de mensajes en chat: activo en partidos abiertos; en completed solo 24 h desde finalized_at.';

REVOKE ALL ON FUNCTION public.can_send_opportunity_thread_message(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_send_opportunity_thread_message(uuid) TO authenticated;

DROP POLICY IF EXISTS messages_insert_sender_in_thread ON public.messages;

CREATE POLICY messages_insert_sender_in_thread
  ON public.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND public.can_send_opportunity_thread_message(opportunity_id)
  );
