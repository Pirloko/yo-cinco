-- Recuperar sports_venue_id cuando el texto del partido coincide con un centro
-- en la misma ciudad (p. ej. tras reprogramaciones que dejaron el enlace en null).

UPDATE public.match_opportunities mo
SET
  sports_venue_id = x.venue_id,
  updated_at = now()
FROM (
  SELECT
    mo2.id AS opp_id,
    (array_agg(sv.id ORDER BY sv.created_at))[1] AS venue_id
  FROM public.match_opportunities mo2
  INNER JOIN public.sports_venues sv
    ON sv.city_id = mo2.city_id
    AND lower(btrim(mo2.venue)) = lower(btrim(sv.name))
    AND NOT sv.is_paused
  WHERE mo2.sports_venue_id IS NULL
    AND mo2.city_id IS NOT NULL
    AND btrim(mo2.venue) <> ''
  GROUP BY mo2.id
) x
WHERE mo.id = x.opp_id;
