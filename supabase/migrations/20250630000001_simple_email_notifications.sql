-- Create a simple logging function for chat notifications
CREATE OR REPLACE FUNCTION log_chat_notification()
RETURNS TRIGGER AS $$
BEGIN
  -- Log the notification to a dedicated table for tracking
  INSERT INTO chat_notification_logs (
    notification_id,
    user_name,
    user_email,
    user_message,
    created_at
  ) VALUES (
    NEW.id,
    NEW.name,
    NEW.email,
    NEW.message,
    NEW.created_at
  );
  
  -- Also log to the database log for debugging
  RAISE LOG 'New chat notification signup: Name=%, Email=%, Message=%, ID=%', 
    NEW.name, NEW.email, COALESCE(NEW.message, 'No message'), NEW.id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a table to track chat notification signups
CREATE TABLE IF NOT EXISTS chat_notification_logs (
  id SERIAL PRIMARY KEY,
  notification_id INTEGER REFERENCES chat_notifications(id),
  user_name TEXT NOT NULL,
  user_email TEXT NOT NULL,
  user_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  email_sent BOOLEAN DEFAULT FALSE,
  email_sent_at TIMESTAMPTZ
);

-- Create trigger to automatically log when chat notifications are inserted
DROP TRIGGER IF EXISTS log_chat_notification_trigger ON chat_notifications;
CREATE TRIGGER log_chat_notification_trigger
  AFTER INSERT ON chat_notifications
  FOR EACH ROW
  EXECUTE FUNCTION log_chat_notification();

-- Add RLS policies for the logs table
ALTER TABLE chat_notification_logs ENABLE ROW LEVEL SECURITY;

-- Allow admins to view logs
CREATE POLICY "Allow admin select logs" ON chat_notification_logs
  FOR SELECT USING (false); -- Change to true when you want to view logs

-- Add a comment to explain the logging functionality
COMMENT ON FUNCTION log_chat_notification() IS 
'Logs chat notification signups for tracking and future email implementation.'; 