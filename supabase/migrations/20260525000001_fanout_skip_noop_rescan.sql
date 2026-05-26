-- Multi-room follow-up: the additive createUserEvent now issues a same-event
-- UPDATE (bumping last_scanned_at) every time a user re-scans an event they
-- already have. The fanout_event_joiner trigger fired on `insert or update`
-- with no guard, so each no-op re-scan incremented joiner_count for every other
-- watcher of that event and could fire false "someone joined" pushes.
--
-- Fix: split the trigger so INSERTs always fan out, but UPDATEs only fan out
-- when the event identity (name/city/date) actually changed — never on a pure
-- last_scanned_at bump. (A trigger WHEN clause can't reference OLD for the
-- INSERT case, so two triggers are used instead of one combined trigger.)

drop trigger if exists trg_fanout_event_joiner on user_events;

create trigger trg_fanout_event_joiner_ins
  after insert on user_events
  for each row execute function fanout_event_joiner();

create trigger trg_fanout_event_joiner_upd
  after update on user_events
  for each row
  when (
    NEW.name is distinct from OLD.name
    or NEW.city is distinct from OLD.city
    or NEW.date is distinct from OLD.date
  )
  execute function fanout_event_joiner();
