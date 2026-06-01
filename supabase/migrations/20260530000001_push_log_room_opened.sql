-- Extend push_log.trigger_type's CHECK constraint to allow 'room_opened',
-- which the send-event-watcher-push Edge Function will write for the
-- curated-live-rooms vote-to-open feature.
alter table public.push_log
  drop constraint push_log_trigger_type_check;

alter table public.push_log
  add constraint push_log_trigger_type_check
    check (trigger_type in ('immediate', 'digest', 'room_opened'));
