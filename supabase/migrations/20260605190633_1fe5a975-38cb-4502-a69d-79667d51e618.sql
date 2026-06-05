
CREATE POLICY "CVs: authenticated read"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'cvs');

CREATE POLICY "CVs: sourcing+ upload"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'cvs'
  AND has_any_role(auth.uid(), ARRAY['admin','manager','sourcing']::app_role[])
);

CREATE POLICY "CVs: sourcing+ update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'cvs'
  AND has_any_role(auth.uid(), ARRAY['admin','manager','sourcing']::app_role[])
);

CREATE POLICY "CVs: managers delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'cvs'
  AND has_any_role(auth.uid(), ARRAY['admin','manager']::app_role[])
);
