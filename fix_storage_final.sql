-- FINAL STORAGE FIX - Allow all necessary file types
-- Run this in Supabase SQL Editor

-- Step 1: Update bucket to allow all file types we need
UPDATE storage.buckets 
SET 
  public = true,
  file_size_limit = 104857600,  -- 100MB
  allowed_mime_types = NULL     -- Allow ALL file types
WHERE id = 'documents';

-- If bucket doesn't exist, create it
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('documents', 'documents', true, 104857600, NULL)
ON CONFLICT (id) DO UPDATE SET 
  public = true,
  file_size_limit = 104857600,
  allowed_mime_types = NULL;

-- Step 2: Remove all restrictive policies
DROP POLICY IF EXISTS "Allow public uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow public reads" ON storage.objects;
DROP POLICY IF EXISTS "Allow public updates" ON storage.objects;
DROP POLICY IF EXISTS "Allow public deletes" ON storage.objects;

-- Step 3: Create maximally permissive policies
CREATE POLICY "Allow all operations" ON storage.objects 
FOR ALL TO public USING (bucket_id = 'documents') 
WITH CHECK (bucket_id = 'documents');

-- Step 4: Grant all permissions
GRANT ALL ON storage.objects TO anon;
GRANT ALL ON storage.objects TO public;
GRANT ALL ON storage.buckets TO anon;
GRANT ALL ON storage.buckets TO public;

-- Step 5: Verification
SELECT 
  'STORAGE SETUP COMPLETE - ALL FILE TYPES ALLOWED' as status,
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
FROM storage.buckets 
WHERE id = 'documents';
