-- user_sessions: anonymous user sessions, expires after 10 minutes
create table user_sessions (
  id uuid primary key default gen_random_uuid(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- user_profiles: binds to user_sessions.id
create table user_profiles (
  id uuid primary key references user_sessions(id) on delete cascade,
  instagram text,
  vibe_tags text[],
  about_me text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- user_photos: up to 6 photos per user, position 0-5
create table user_photos (
  id serial primary key,
  user_id uuid references user_profiles(id) on delete cascade,
  image_url text not null,
  position int not null check (position >= 0 and position <= 5),
  created_at timestamptz not null default now(),
  unique (user_id, position)
);

-- user_events: stores the currently selected event for a user
create table user_events (
  user_id uuid primary key references user_profiles(id) on delete cascade,
  name text not null,
  date date,
  city text not null,
  created_at timestamptz not null default now()
);

-- likes: records swipes
create table likes (
  id serial primary key,
  from_user_id uuid references user_profiles(id) on delete cascade,
  to_user_id uuid references user_profiles(id) on delete cascade,
  event_id int,
  liked boolean not null,
  created_at timestamptz not null default now(),
  constraint unique_like unique (from_user_id, to_user_id, event_id)
); 
