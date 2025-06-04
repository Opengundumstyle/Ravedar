insert into user_sessions (id, expires_at)
values ('42feddcd-2a65-4edd-90fe-f4d5e209d27f', now() + interval '1 day');

insert into user_profiles (id, name, is_real, expires_at)
values ('42feddcd-2a65-4edd-90fe-f4d5e209d27f', 'Test', true, now() + interval '1 day');
