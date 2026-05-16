-- messages: 1:1 direct messages between users who have mutually matched
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references user_profiles(id) on delete cascade,
  to_user_id uuid not null references user_profiles(id) on delete cascade,
  message text not null check (length(message) > 0 and length(message) <= 2000),
  message_type text not null default 'text' check (message_type in ('text', 'image', 'system')),
  sent_at timestamptz not null default now(),
  read_at timestamptz,
  constraint messages_no_self check (from_user_id <> to_user_id)
);

create index if not exists idx_messages_pair_sent
  on messages (
    least(from_user_id, to_user_id),
    greatest(from_user_id, to_user_id),
    sent_at desc
  );
create index if not exists idx_messages_to_unread
  on messages (to_user_id, read_at) where read_at is null;
create index if not exists idx_messages_from on messages (from_user_id);
create index if not exists idx_messages_to on messages (to_user_id);

-- matches: confirmed mutual matches. Chat gates on a row existing here.
create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  user_a_id uuid not null references user_profiles(id) on delete cascade,
  user_b_id uuid not null references user_profiles(id) on delete cascade,
  event_id int,
  created_at timestamptz not null default now(),
  constraint matches_ordered check (user_a_id < user_b_id),
  constraint matches_unique unique (user_a_id, user_b_id)
);

create index if not exists idx_matches_user_a on matches (user_a_id, created_at desc);
create index if not exists idx_matches_user_b on matches (user_b_id, created_at desc);

-- Helper: insert a match with the ordered pair invariant.
create or replace function create_match(p_user_1 uuid, p_user_2 uuid, p_event_id int default null)
returns uuid
language plpgsql
as $$
declare
  v_a uuid;
  v_b uuid;
  v_id uuid;
begin
  if p_user_1 = p_user_2 then
    raise exception 'cannot match a user with themselves';
  end if;
  if p_user_1 < p_user_2 then
    v_a := p_user_1; v_b := p_user_2;
  else
    v_a := p_user_2; v_b := p_user_1;
  end if;
  insert into matches (user_a_id, user_b_id, event_id)
  values (v_a, v_b, p_event_id)
  on conflict (user_a_id, user_b_id) do update set event_id = coalesce(matches.event_id, excluded.event_id)
  returning id into v_id;
  return v_id;
end;
$$;

-- RLS: follow project convention (permissive read/write, authorization at app layer)
alter table messages enable row level security;
alter table matches enable row level security;

create policy "messages_select_all" on messages for select using (true);
create policy "messages_insert_all" on messages for insert with check (true);
create policy "messages_update_all" on messages for update using (true);

create policy "matches_select_all" on matches for select using (true);
create policy "matches_insert_all" on matches for insert with check (true);

-- Realtime publication for live chat updates
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table messages;
    exception when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table matches;
    exception when duplicate_object then null;
    end;
  end if;
end$$;
