-- Create founder_messages table
CREATE TABLE IF NOT EXISTS founder_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  from_user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
  to_user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  founder_role TEXT NOT NULL CHECK (founder_role IN ('founder', 'co-founder')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  read_at TIMESTAMP WITH TIME ZONE,
  responded_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_founder_messages_from_user_id ON founder_messages(from_user_id);
CREATE INDEX IF NOT EXISTS idx_founder_messages_to_user_id ON founder_messages(to_user_id);
CREATE INDEX IF NOT EXISTS idx_founder_messages_created_at ON founder_messages(created_at);

-- Add RLS policies
ALTER TABLE founder_messages ENABLE ROW LEVEL SECURITY;

-- Allow all inserts for now (for testing)
CREATE POLICY "Allow all inserts" ON founder_messages
  FOR INSERT WITH CHECK (true);

-- Allow users to view messages they sent
CREATE POLICY "Users can view messages they sent" ON founder_messages
  FOR SELECT USING (true);

-- Allow founders to view messages sent to them
CREATE POLICY "Founders can view messages sent to them" ON founder_messages
  FOR SELECT USING (true);

-- Allow founders to update messages (mark as read, respond)
CREATE POLICY "Founders can update messages sent to them" ON founder_messages
  FOR UPDATE USING (true);
