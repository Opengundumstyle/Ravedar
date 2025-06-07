CREATE TABLE events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  venue TEXT,
  date DATE,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE artists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE event_artists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES events(id) ON DELETE CASCADE,
  artist_id uuid REFERENCES artists(id) ON DELETE CASCADE
);


CREATE INDEX idx_event_name ON events USING gin (to_tsvector('english', name));
CREATE INDEX idx_city ON events (city);
CREATE INDEX idx_date ON events (date);

CREATE INDEX idx_artist_name ON artists USING gin (to_tsvector('english', name));
