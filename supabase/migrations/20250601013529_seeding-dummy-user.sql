-- Emma
do $$
declare
  uid uuid := gen_random_uuid();
begin
  insert into user_sessions (id, expires_at) values (uid, now() + interval '1 day');
  insert into user_profiles (id, name, instagram, vibe_tags, about_me, expires_at, is_real)
    values (uid, 'Emma', 'emma_insta', ARRAY['music', 'dancing'], 'Living for the next festival. House, techno, and good vibes only. Let''s dance till sunrise!', now() + interval '1 day', false);
end $$;

-- Olivia
do $$
declare
  uid uuid := gen_random_uuid();
begin
  insert into user_sessions (id, expires_at) values (uid, now() + interval '1 day');
  insert into user_profiles (id, name, instagram, vibe_tags, about_me, expires_at, is_real)
    values (uid, 'Olivia', 'olivia_live', ARRAY['art', 'travel'], 'Traveling from city to city chasing the best beats. Always down for an afterparty and new friends.', now() + interval '1 day', false);
end $$;

-- Ava
do $$
declare
  uid uuid := gen_random_uuid();
begin
  insert into user_sessions (id, expires_at) values (uid, now() + interval '1 day');
  insert into user_profiles (id, name, instagram, vibe_tags, about_me, expires_at, is_real)
    values (uid, 'Ava', 'ava.party', ARRAY['parties', 'fashion'], 'Glitter, neon, and non-stop dancing. If you see me at the rail, come say hi!', now() + interval '1 day', false);
end $$;

-- Sophia
do $$
declare
  uid uuid := gen_random_uuid();
begin
  insert into user_sessions (id, expires_at) values (uid, now() + interval '1 day');
  insert into user_profiles (id, name, instagram, vibe_tags, about_me, expires_at, is_real)
    values (uid, 'Sophia', 'sophia.smiles', ARRAY['yoga', 'wellness'], 'Yoga by day, raving by night. I love deep conversations and deeper bass.', now() + interval '1 day', false);
end $$;

-- Isabella
do $$
declare
  uid uuid := gen_random_uuid();
begin
  insert into user_sessions (id, expires_at) values (uid, now() + interval '1 day');
  insert into user_profiles (id, name, instagram, vibe_tags, about_me, expires_at, is_real)
    values (uid, 'Isabella', 'isabella.music', ARRAY['music', 'singing'], 'Singing along to every track. Rave fam is real fam. Let''s make memories!', now() + interval '1 day', false);
end $$;

-- Mia
do $$
declare
  uid uuid := gen_random_uuid();
begin
  insert into user_sessions (id, expires_at) values (uid, now() + interval '1 day');
  insert into user_profiles (id, name, instagram, vibe_tags, about_me, expires_at, is_real)
    values (uid, 'Mia', 'mia.moves', ARRAY['dancing', 'fitness'], 'Dancing is my therapy. Catch me at the front, living my best life.', now() + interval '1 day', false);
end $$;

-- Charlotte
do $$
declare
  uid uuid := gen_random_uuid();
begin
  insert into user_sessions (id, expires_at) values (uid, now() + interval '1 day');
  insert into user_profiles (id, name, instagram, vibe_tags, about_me, expires_at, is_real)
    values (uid, 'Charlotte', 'charlotte.fun', ARRAY['food', 'travel'], 'Foodie, traveler, and festival junkie. Always looking for my next adventure and a new rave crew.', now() + interval '1 day', false);
end $$;

-- Amelia
do $$
declare
  uid uuid := gen_random_uuid();
begin
  insert into user_sessions (id, expires_at) values (uid, now() + interval '1 day');
  insert into user_profiles (id, name, instagram, vibe_tags, about_me, expires_at, is_real)
    values (uid, 'Amelia', 'amelia.adventures', ARRAY['adventure', 'sports'], 'Adrenaline seeker. If there''s a secret set, I''ll find it. Let''s explore together!', now() + interval '1 day', false);
end $$;

-- Harper
do $$
declare
  uid uuid := gen_random_uuid();
begin
  insert into user_sessions (id, expires_at) values (uid, now() + interval '1 day');
  insert into user_profiles (id, name, instagram, vibe_tags, about_me, expires_at, is_real)
    values (uid, 'Harper', 'harper.vibes', ARRAY['music', 'reading'], 'Books and bass drops. I love a good story and a better drop.', now() + interval '1 day', false);
end $$;

-- Evelyn
do $$
declare
  uid uuid := gen_random_uuid();
begin
  insert into user_sessions (id, expires_at) values (uid, now() + interval '1 day');
  insert into user_profiles (id, name, instagram, vibe_tags, about_me, expires_at, is_real)
    values (uid, 'Evelyn', 'evelyn.chill', ARRAY['chill', 'movies'], 'Chill vibes, big smiles, and late-night sets. Let''s vibe and watch the sunrise.', now() + interval '1 day', false);
end $$;

-- Liam
do $$
declare
  uid uuid := gen_random_uuid();
begin
  insert into user_sessions (id, expires_at) values (uid, now() + interval '1 day');
  insert into user_profiles (id, name, instagram, vibe_tags, about_me, expires_at, is_real)
    values (uid, 'Liam', 'liam_beat', ARRAY['music', 'sports'], 'DJ in the making. Always up for a spontaneous road trip to a new show.', now() + interval '1 day', false);
end $$;

-- Noah
do $$
declare
  uid uuid := gen_random_uuid();
begin
  insert into user_sessions (id, expires_at) values (uid, now() + interval '1 day');
  insert into user_profiles (id, name, instagram, vibe_tags, about_me, expires_at, is_real)
    values (uid, 'Noah', 'noah.night', ARRAY['nightlife', 'travel'], 'Night owl, festival hopper, and lover of all things electronic. Let''s get lost in the music.', now() + interval '1 day', false);
end $$;

-- James
do $$
declare
  uid uuid := gen_random_uuid();
begin
  insert into user_sessions (id, expires_at) values (uid, now() + interval '1 day');
  insert into user_profiles (id, name, instagram, vibe_tags, about_me, expires_at, is_real)
    values (uid, 'James', 'james.jams', ARRAY['music', 'cooking'], 'Cooking by day, raving by night. If you love good food and good music, we''ll get along.', now() + interval '1 day', false);
end $$;