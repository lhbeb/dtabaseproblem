-- Test if explicit UUID insertion works in database
INSERT INTO job_applications (id, first_name, last_name, email, address, city, state, phone_number, ssn, status) 
VALUES ('00000000-0000-0000-0000-000000000001', 'Test', 'User', 'test@example.com', '123 Test St', 'Test City', 'Arizona', '5551234567', '123456789', 'pending');

-- Verify the insert
SELECT 'SUCCESS: Found record with explicit ID' as result FROM job_applications WHERE id = '00000000-0000-0000-0000-000000000001';

-- Clean up
DELETE FROM job_applications WHERE id = '00000000-0000-0000-0000-000000000001';

SELECT 'CLEANUP COMPLETE' as final_result;
