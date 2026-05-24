-- 20260524000000_blocks_and_reports.sql
-- Trust & safety: blocks + reports for Tier 1.
-- RLS follows project convention (permissive; authorization in app layer).

-- ----- blocks -----------------------------------------------------------
create table if not exists blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references user_profiles(id) on delete cascade,
  target_id  uuid not null references user_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint blocks_no_self check (blocker_id <> target_id),
  constraint blocks_unique unique (blocker_id, target_id)
);
create index if not exists idx_blocks_blocker on blocks (blocker_id);
create index if not exists idx_blocks_target  on blocks (target_id);

-- ----- reports ----------------------------------------------------------
create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references user_profiles(id) on delete set null,
  reported_id uuid not null references user_profiles(id) on delete cascade,
  reason text not null check (reason in (
    'harassment','spam','fake_profile','inappropriate_photos','underage','other'
  )),
  details text check (details is null or length(details) <= 500),
  context text not null check (context in ('card','chat','profile')),
  match_id uuid references matches(id) on delete set null,
  status text not null default 'open' check (status in ('open','reviewed','actioned','dismissed')),
  created_at timestamptz not null default now(),
  constraint reports_no_self check (reporter_id <> reported_id)
);
create index if not exists idx_reports_reported_open on reports (reported_id) where status = 'open';
create index if not exists idx_reports_created on reports (created_at desc);

-- ----- block_user atomic RPC -------------------------------------------
-- Insert the blocks row AND delete any current matches row in one tx.
create or replace function block_user(p_blocker uuid, p_target uuid)
returns void
language plpgsql
as $$
declare
  v_a uuid;
  v_b uuid;
begin
  if p_blocker = p_target then
    raise exception 'cannot block yourself';
  end if;

  insert into blocks (blocker_id, target_id)
  values (p_blocker, p_target)
  on conflict (blocker_id, target_id) do nothing;

  if p_blocker < p_target then
    v_a := p_blocker; v_b := p_target;
  else
    v_a := p_target;  v_b := p_blocker;
  end if;

  delete from matches where user_a_id = v_a and user_b_id = v_b;
end;
$$;

-- ----- RLS --------------------------------------------------------------
alter table blocks  enable row level security;
alter table reports enable row level security;

create policy "blocks_select_all" on blocks for select using (true);
create policy "blocks_insert_all" on blocks for insert with check (true);
create policy "blocks_delete_all" on blocks for delete using (true);

create policy "reports_select_all" on reports for select using (true);
create policy "reports_insert_all" on reports for insert with check (true);

-- ----- Email-on-insert trigger [NEEDS SETUP] ---------------------------
-- Uncomment once supabase/functions/notify-report/ is deployed.
-- create or replace function trg_notify_report() returns trigger
-- language plpgsql as $$
-- begin
--   perform net.http_post(
--     url := current_setting('app.settings.notify_report_url', true),
--     headers := jsonb_build_object('content-type','application/json'),
--     body := to_jsonb(new)
--   );
--   return new;
-- end;
-- $$;
-- create trigger on_report_insert after insert on reports
--   for each row execute function trg_notify_report();
