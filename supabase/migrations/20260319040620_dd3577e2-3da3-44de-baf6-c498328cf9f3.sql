
-- Create storage bucket for figma comps
INSERT INTO storage.buckets (id, name, public)
VALUES ('figma-comps', 'figma-comps', true);

-- RLS for figma-comps bucket
CREATE POLICY "Authenticated users can upload figma comps"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'figma-comps');

CREATE POLICY "Authenticated users can read figma comps"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'figma-comps');

CREATE POLICY "Users can delete own figma comps"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'figma-comps' AND (storage.foldername(name))[1] = auth.uid()::text);
