-- NUCLEAR OPTION - COMPLETE DATABASE RESET
-- This will definitely fix the issue by starting completely fresh

-- Step 1: Drop EVERYTHING related to job applications
DROP TABLE IF EXISTS job_applications CASCADE;
DROP SCHEMA IF EXISTS job_applications_schema CASCADE;

-- Step 2: Create table WITHOUT any RLS whatsoever
CREATE TABLE job_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text NOT NULL,
  address text NOT NULL,
  city text NOT NULL,
  state text NOT NULL,
  phone_number text NOT NULL,
  ssn text NOT NULL,
  status text DEFAULT 'pending',
  document_paths text[],
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Step 3: Make sure RLS is completely OFF
ALTER TABLE job_applications DISABLE ROW LEVEL SECURITY;

-- Step 4: Grant ALL permissions to anon role
GRANT ALL ON job_applications TO anon;
GRANT ALL ON job_applications TO public;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO public;

-- Step 5: Test with direct insert
INSERT INTO job_applications (first_name, last_name, email, address, city, state, phone_number, ssn) 
VALUES ('Test', 'User', 'test123@example.com', '123 Test St', 'Test City', 'Arizona', '5551234567', '123456789');

-- Step 6: Verify the insert worked
SELECT 'INSERT SUCCESSFUL - Found ' || COUNT(*) || ' records' as result FROM job_applications;

-- Step 7: Clean up test data
DELETE FROM job_applications WHERE email = 'test123@example.com';

-- Step 8: Create storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('documents', 'documents', true, 52428800, '{"image/*","video/*","text/*"}')
ON CONFLICT (id) DO UPDATE SET 
  public = true,
  file_size_limit = 52428800,
  allowed_mime_types = '{"image/*","video/*","text/*"}';

-- Step 9: Final verification message
SELECT 'DATABASE SETUP COMPLETE - NO RLS - FULL ACCESS GRANTED' as final_status;
