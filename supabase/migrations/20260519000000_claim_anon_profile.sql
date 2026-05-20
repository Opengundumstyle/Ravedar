-- Atomically moves an anonymous user's child rows (likes, user_events) to a
-- real user's id, then deletes the anonymous user_sessions row (which cascades
-- the anonymous user_profiles row). Idempotent: re-running after the anon row
-- is gone is a no-op.

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

  update public.likes
     set from_user_id = real_id
   where from_user_id = anon_id;

  update public.likes
     set to_user_id = real_id
   where to_user_id = anon_id;

  update public.user_events
     set user_id = real_id
   where user_id = anon_id;

  delete from public.user_sessions where id = anon_id;
end;
$$;

grant execute on function public.claim_anon_profile(uuid, uuid) to anon, authenticated;
