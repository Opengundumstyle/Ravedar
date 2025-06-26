-- Create chat_notifications table for collecting emails for chat feature
create table chat_notifications (
  id serial primary key,
  name text not null,
  email text not null,
  message text,
  created_at timestamptz not null default now()
);

-- Add RLS policies
alter table chat_notifications enable row level security;

-- Allow anyone to insert (for signups)
create policy "Allow public insert" on chat_notifications
  for insert with check (true);

-- Only allow admins to view (you can modify this later)
create policy "Allow admin select" on chat_notifications
  for select using (false); 