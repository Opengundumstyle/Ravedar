-- Ensure RLS is completely disabled on chat_notifications table
ALTER TABLE chat_notifications DISABLE ROW LEVEL SECURITY;

-- Drop any existing RLS policies to avoid conflicts
DROP POLICY IF EXISTS "Allow public insert" ON chat_notifications;
DROP POLICY IF EXISTS "Allow admin select" ON chat_notifications;
DROP POLICY IF EXISTS "Allow admin update" ON chat_notifications;
DROP POLICY IF EXISTS "Allow admin delete" ON chat_notifications;
DROP POLICY IF EXISTS "Allow all operations" ON chat_notifications;

-- Verify the table structure is correct
-- The table should have: id, name, email, message, created_at
-- This is just a verification - no changes needed if structure is correct

-- Add a comment to confirm RLS is disabled
COMMENT ON TABLE chat_notifications IS 'Chat notification signups - RLS disabled for public access'; 