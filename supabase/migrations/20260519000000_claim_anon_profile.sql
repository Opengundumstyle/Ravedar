-- Atomically moves an anonymous user's child rows (likes, user_events) to a
-- real user's id, then deletes the anonymous user_sessions row (which cascades
-- the anonymous user_profiles row). Idempotent in the success case: re-running
-- after the anon row is gone is a no-op. Rows that would collide with existing
-- real-user rows (PK or unique-constraint) are skipped, not raised — the anon's
-- conflicting rows are simply discarded along with the anon profile.

create or replace function public.claim_anon_profile(anon_id uuid, real_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if anon_id is null or real_id is null or anon_id = real_id then
    return;
  end if;

  -- Reparent outgoing likes; skip rows that would violate unique_like.
  update public.likes
     set from_user_id = real_id
   where from_user_id = anon_id
     and not exists (
       select 1 from public.likes l2
        where l2.from_user_id = real_id
          and l2.to_user_id   = likes.to_user_id
          and l2.event_id is not distinct from likes.event_id
     );

  -- Reparent incoming likes (rare); skip rows that would violate unique_like.
  update public.likes
     set to_user_id = real_id
   where to_user_id = anon_id
     and not exists (
       select 1 from public.likes l2
        where l2.from_user_id = likes.from_user_id
          and l2.to_user_id   = real_id
          and l2.event_id is not distinct from likes.event_id
     );

  -- Reparent the anon's selected event; skip if the real user already picked one.
  update public.user_events
     set user_id = real_id
   where user_id = anon_id
     and not exists (
       select 1 from public.user_events where user_id = real_id
     );

  -- Deleting user_sessions cascades the anon user_profiles row, which in turn
  -- cascades any leftover likes/user_events that didn't get reparented (because
  -- they collided with real-user rows above).
  delete from public.user_sessions where id = anon_id;
end;
$$;

grant execute on function public.claim_anon_profile(uuid, uuid) to anon, authenticated;
