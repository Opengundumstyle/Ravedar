import { supabase } from '../supabaseClient';

// Returns Set<uuid> of every user the given user has blocked OR been blocked by.
// Caller should fetch once per page load and pass into filter calls.
export async function getBlockedSet(userId) {
  if (!userId) return new Set();
  const { data, error } = await supabase
    .from('blocks')
    .select('blocker_id, target_id')
    .or(`blocker_id.eq.${userId},target_id.eq.${userId}`);
  if (error) throw new Error(`Failed to load blocks: ${error.message}`);
  const set = new Set();
  for (const row of data || []) {
    set.add(row.blocker_id === userId ? row.target_id : row.blocker_id);
  }
  return set;
}

// Atomic: inserts blocks row + deletes any matches row.
export async function blockUser(blockerId, targetId) {
  if (!blockerId || !targetId) throw new Error('blockUser: missing ids');
  if (blockerId === targetId) throw new Error('blockUser: cannot block yourself');
  const { error } = await supabase.rpc('block_user', {
    p_blocker: blockerId,
    p_target: targetId,
  });
  if (error) throw new Error(`Failed to block user: ${error.message}`);
}

// Removes only the blocks row. Does NOT restore the deleted match.
export async function unblockUser(blockerId, targetId) {
  if (!blockerId || !targetId) throw new Error('unblockUser: missing ids');
  const { error } = await supabase
    .from('blocks')
    .delete()
    .eq('blocker_id', blockerId)
    .eq('target_id', targetId);
  if (error) throw new Error(`Failed to unblock user: ${error.message}`);
}

// Deletes the matches row between two users (ordered pair). No blocks insert.
export async function unmatchUser(userId, otherUserId) {
  if (!userId || !otherUserId) throw new Error('unmatchUser: missing ids');
  if (userId === otherUserId) throw new Error('unmatchUser: cannot unmatch yourself');
  const [a, b] = userId < otherUserId ? [userId, otherUserId] : [otherUserId, userId];
  const { error } = await supabase
    .from('matches')
    .delete()
    .eq('user_a_id', a)
    .eq('user_b_id', b);
  if (error) throw new Error(`Failed to unmatch: ${error.message}`);
}

// For /settings: list users blocked BY this user.
// Returns [{ id, name, photo_url, blocked_at }].
export async function listBlockedAccounts(userId) {
  if (!userId) return [];
  const { data: rows, error } = await supabase
    .from('blocks')
    .select('target_id, created_at')
    .eq('blocker_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Failed to list blocked accounts: ${error.message}`);
  const ids = (rows || []).map((r) => r.target_id);
  if (ids.length === 0) return [];

  const [{ data: profiles }, { data: photos }] = await Promise.all([
    supabase.from('user_profiles').select('id, name').in('id', ids),
    supabase.from('user_photos').select('user_id, image_url, position').in('user_id', ids),
  ]);

  const profileById = Object.fromEntries((profiles || []).map((p) => [p.id, p]));
  const photoByUser = {};
  for (const p of photos || []) {
    const prev = photoByUser[p.user_id];
    if (!prev || p.position < prev.position) photoByUser[p.user_id] = p;
  }

  return rows.map((r) => ({
    id: r.target_id,
    name: profileById[r.target_id]?.name || 'unknown',
    photo_url: photoByUser[r.target_id]?.image_url || null,
    blocked_at: r.created_at,
  }));
}
