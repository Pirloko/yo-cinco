-- Bucket público para escudos de equipo (subida solo del capitán vía RLS).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
SELECT
  'team-logos',
  'team-logos',
  true,
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'team-logos');

CREATE POLICY "team_logos_select_public"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'team-logos');

CREATE POLICY "team_logos_insert_captain"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'team-logos'
    AND split_part(name, '/', 1) IN (
      SELECT id::text FROM public.teams WHERE captain_id = auth.uid()
    )
  );

CREATE POLICY "team_logos_update_captain"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'team-logos'
    AND split_part(name, '/', 1) IN (
      SELECT id::text FROM public.teams WHERE captain_id = auth.uid()
    )
  );

CREATE POLICY "team_logos_delete_captain"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'team-logos'
    AND split_part(name, '/', 1) IN (
      SELECT id::text FROM public.teams WHERE captain_id = auth.uid()
    )
  );
