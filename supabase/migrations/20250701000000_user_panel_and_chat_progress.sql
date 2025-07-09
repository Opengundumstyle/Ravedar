-- Add role column to user_profiles if it doesn't exist
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user';

-- Create user_settings table for user preferences
CREATE TABLE IF NOT EXISTS user_settings (
  user_id UUID PRIMARY KEY REFERENCES user_profiles(id) ON DELETE CASCADE,
  email_notifications BOOLEAN DEFAULT true,
  push_notifications BOOLEAN DEFAULT true,
  profile_visibility BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create app_stats table for tracking signup progress
CREATE TABLE IF NOT EXISTS app_stats (
  id SERIAL PRIMARY KEY,
  total_signups INTEGER NOT NULL DEFAULT 30, -- Starting with 30 users
  chat_release_threshold INTEGER NOT NULL DEFAULT 100,
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert initial app stats
INSERT INTO app_stats (total_signups, chat_release_threshold) 
VALUES (30, 100) 
ON CONFLICT DO NOTHING;

-- Create function to update signup count
CREATE OR REPLACE FUNCTION update_signup_count()
RETURNS TRIGGER AS $$
BEGIN
  -- Increment total signups when a new real user is created
  IF NEW.is_real = true THEN
    UPDATE app_stats 
    SET total_signups = total_signups + 1,
        last_updated = NOW()
    WHERE id = 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update signup count
DROP TRIGGER IF EXISTS signup_count_trigger ON user_profiles;
CREATE TRIGGER signup_count_trigger
  AFTER INSERT ON user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_signup_count();

-- Add RLS policies for user_settings
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own settings" ON user_settings
  FOR SELECT USING (auth.uid()::text = user_id::text);

CREATE POLICY "Users can update their own settings" ON user_settings
  FOR UPDATE USING (auth.uid()::text = user_id::text);

CREATE POLICY "Users can insert their own settings" ON user_settings
  FOR INSERT WITH CHECK (auth.uid()::text = user_id::text);

-- Add RLS policies for app_stats (read-only for all users)
ALTER TABLE app_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view app stats" ON app_stats
  FOR SELECT USING (true);

-- Create function to get chat progress
CREATE OR REPLACE FUNCTION get_chat_progress()
RETURNS TABLE (
  current_signups INTEGER,
  threshold INTEGER,
  remaining INTEGER,
  percentage NUMERIC,
  is_released BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    stats.total_signups,
    stats.chat_release_threshold,
    GREATEST(0, stats.chat_release_threshold - stats.total_signups) as remaining,
    ROUND((stats.total_signups::NUMERIC / stats.chat_release_threshold::NUMERIC) * 100, 1) as percentage,
    (stats.total_signups >= stats.chat_release_threshold) as is_released
  FROM app_stats stats
  WHERE stats.id = 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER; 