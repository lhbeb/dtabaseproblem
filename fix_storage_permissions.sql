-- Verify and fix storage bucket setup
-- First, check if bucket exists
SELECT id, name, public FROM storage.buckets WHERE id = 'documents';

-- If it doesn't exist or has wrong settings, recreate it
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('documents', 'documents', true, 52428800, ARRAY['image/*', 'video/*', 'text/*', 'application/*'])
ON CONFLICT (id) DO UPDATE SET 
  public = true,
  file_size_limit = 52428800,
  allowed_mime_types = ARRAY['image/*', 'video/*', 'text/*', 'application/*'];

-- Remove any restrictive policies and add permissive ones
DROP POLICY IF EXISTS "Allow public uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow public reads" ON storage.objects;
DROP POLICY IF EXISTS "Allow public deletes" ON storage.objects;

-- Create very permissive policies
CREATE POLICY "Allow public uploads" ON storage.objects 
FOR INSERT TO public WITH CHECK (bucket_id = 'documents');

CREATE POLICY "Allow public reads" ON storage.objects 
FOR SELECT TO public USING (bucket_id = 'documents');

CREATE POLICY "Allow public updates" ON storage.objects 
FOR UPDATE TO public USING (bucket_id = 'documents');

-- Grant storage permissions
GRANT ALL ON storage.objects TO anon;
GRANT ALL ON storage.buckets TO anon;

SELECT 'STORAGE SETUP COMPLETE' as result;
