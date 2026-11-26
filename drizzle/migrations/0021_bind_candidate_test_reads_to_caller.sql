ALTER POLICY "Test PDFs read" ON storage.objects
USING (
  bucket_id = 'candidate-tests'
  AND (SELECT auth.uid()) IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.demand_candidates dc
    JOIN public.demands d ON d.id = dc.demand_id
    WHERE dc.id::text = (storage.foldername(objects.name))[1]
      AND (
        (SELECT public.has_any_role((SELECT auth.uid()), ARRAY['hrbp','operations','ceo']::public.app_role[]))
        OR (
          (SELECT public.has_role((SELECT auth.uid()), 'sourceur'::public.app_role))
          AND d.assigned_to = (SELECT auth.uid())
        )
      )
  )
);
COMMENT ON POLICY "Test PDFs read" ON storage.objects IS
'Caller-bound candidature access: assigned Sourcers and authorized business reviewers only; uploader ownership alone never grants access.';