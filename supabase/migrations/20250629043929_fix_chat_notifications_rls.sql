-- Drop existing RLS policies for chat_notifications
DROP POLICY IF EXISTS "Allow public insert" ON chat_notifications;
DROP POLICY IF EXISTS "Allow admin select" ON chat_notifications;

-- Disable and re-enable RLS to ensure clean state
ALTER TABLE chat_notifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE chat_notifications ENABLE ROW LEVEL SECURITY;

-- Create new RLS policies
-- Allow anyone to insert (for signups and founder messages)
CREATE POLICY "Allow public insert" ON chat_notifications
  FOR INSERT WITH CHECK (true);

-- Only allow admins to view (you can modify this later)
CREATE POLICY "Allow admin select" ON chat_notifications
  FOR SELECT USING (false);

-- Allow updates for admin purposes
CREATE POLICY "Allow admin update" ON chat_notifications
  FOR UPDATE USING (false);

-- Allow deletes for admin purposes
CREATE POLICY "Allow admin delete" ON chat_notifications
  FOR DELETE USING (false);
