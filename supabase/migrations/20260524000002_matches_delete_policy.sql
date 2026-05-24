-- Allow deletes on matches table. Required by unmatchUser (lib/api/blocks.js)
-- and by the DELETE FROM matches inside the block_user RPC.
-- Follows project convention of permissive RLS + authorization at app layer.
create policy "matches_delete_all" on matches for delete using (true);
