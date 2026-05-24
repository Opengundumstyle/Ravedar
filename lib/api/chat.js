import { supabase } from '../supabaseClient';
import { getBlockedSet } from './blocks';

export async function sendMessage(fromUserId, toUserId, message, messageType = 'text') {
  const trimmed = (message || '').trim();
  if (!trimmed) throw new Error('Message cannot be empty');

  // Precondition: a matches row must still exist for this pair.
  const [a, b] = fromUserId < toUserId ? [fromUserId, toUserId] : [toUserId, fromUserId];
  const { data: match, error: matchErr } = await supabase
    .from('matches')
    .select('id')
    .eq('user_a_id', a)
    .eq('user_b_id', b)
    .maybeSingle();
  if (matchErr) throw new Error(`Failed to verify match: ${matchErr.message}`);
  if (!match) throw new Error('No active match');

  const { data, error } = await supabase
    .from('messages')
    .insert({
      from_user_id: fromUserId,
      to_user_id: toUserId,
      message: trimmed,
      message_type: messageType,
    })
    .select()
    .single();
  if (error) throw new Error(`Failed to send message: ${error.message}`);
  return data;
}

export async function getConversation(userId1, userId2, limit = 100) {
  // Precondition: return [] if there's no active match (handles both unmatch + block).
  const [a, b] = userId1 < userId2 ? [userId1, userId2] : [userId2, userId1];
  const { data: match, error: matchErr } = await supabase
    .from('matches')
    .select('id')
    .eq('user_a_id', a)
    .eq('user_b_id', b)
    .maybeSingle();
  if (matchErr) throw new Error(`Failed to verify match: ${matchErr.message}`);
  if (!match) return [];

  const { data, error } = await supabase
    .from('messages')
    .select('id, from_user_id, to_user_id, message, message_type, sent_at, read_at')
    .or(
      `and(from_user_id.eq.${userId1},to_user_id.eq.${userId2}),and(from_user_id.eq.${userId2},to_user_id.eq.${userId1})`
    )
    .order('sent_at', { ascending: true })
    .limit(limit);

  if (error) throw new Error(`Failed to get conversation: ${error.message}`);
  return data || [];
}

export async function markMessagesAsRead(userId, otherUserId) {
  const { data, error } = await supabase
    .from('messages')
    .update({ read_at: new Date().toISOString() })
    .eq('from_user_id', otherUserId)
    .eq('to_user_id', userId)
    .is('read_at', null)
    .select('id');

  if (error) throw new Error(`Failed to mark messages as read: ${error.message}`);
  return data || [];
}

export async function getUnreadMessageCount(userId) {
  const { count, error } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('to_user_id', userId)
    .is('read_at', null);

  if (error) throw new Error(`Failed to get unread message count: ${error.message}`);
  return count || 0;
}

// Returns all matched users for the current user, with their latest message + unread count.
export async function getUserConversations(userId) {
  const { data: matches, error: matchError } = await supabase
    .from('matches')
    .select('id, user_a_id, user_b_id, event_id, created_at')
    .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`)
    .order('created_at', { ascending: false });
  if (matchError) throw new Error(`Failed to get matches: ${matchError.message}`);
  if (!matches || matches.length === 0) return [];

  const blockedSet = await getBlockedSet(userId);
  const visibleMatches = matches.filter((m) => {
    const other = m.user_a_id === userId ? m.user_b_id : m.user_a_id;
    return !blockedSet.has(other);
  });
  if (visibleMatches.length === 0) return [];

  const otherIds = visibleMatches.map((m) => (m.user_a_id === userId ? m.user_b_id : m.user_a_id));

  const [{ data: profiles }, { data: photos }, { data: recentMessages }] = await Promise.all([
    supabase.from('user_profiles').select('id, name, role').in('id', otherIds),
    supabase.from('user_photos').select('user_id, image_url, position').in('user_id', otherIds),
    supabase
      .from('messages')
      .select('id, from_user_id, to_user_id, message, sent_at, read_at')
      .or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`)
      .order('sent_at', { ascending: false })
      .limit(500),
  ]);

  const photosByUser = (photos || []).reduce((acc, p) => {
    (acc[p.user_id] ||= []).push(p);
    return acc;
  }, {});
  for (const id of Object.keys(photosByUser)) photosByUser[id].sort((a, b) => a.position - b.position);

  const lastByOther = {};
  const unreadByOther = {};
  for (const m of recentMessages || []) {
    const other = m.from_user_id === userId ? m.to_user_id : m.from_user_id;
    if (blockedSet.has(other)) continue;
    if (!lastByOther[other]) lastByOther[other] = m;
    if (m.to_user_id === userId && !m.read_at) {
      unreadByOther[other] = (unreadByOther[other] || 0) + 1;
    }
  }

  const profilesById = Object.fromEntries((profiles || []).map((p) => [p.id, p]));

  const conversations = visibleMatches.map((match) => {
    const otherId = match.user_a_id === userId ? match.user_b_id : match.user_a_id;
    const profile = profilesById[otherId];
    const last = lastByOther[otherId];
    return {
      match_id: match.id,
      other_user_id: otherId,
      name: profile?.name || 'Unknown',
      role: profile?.role || 'user',
      photo: photosByUser[otherId]?.[0]?.image_url || null,
      last_message: last?.message || null,
      last_message_at: last?.sent_at || match.created_at,
      last_message_from_me: last ? last.from_user_id === userId : false,
      unread_count: unreadByOther[otherId] || 0,
      matched_at: match.created_at,
    };
  });

  conversations.sort((a, b) => new Date(b.last_message_at) - new Date(a.last_message_at));
  return conversations;
}

export async function getMatchBetween(userId, otherUserId) {
  const [a, b] = userId < otherUserId ? [userId, otherUserId] : [otherUserId, userId];
  const { data, error } = await supabase
    .from('matches')
    .select('id, user_a_id, user_b_id, event_id, created_at')
    .eq('user_a_id', a)
    .eq('user_b_id', b)
    .maybeSingle();
  if (error) throw new Error(`Failed to fetch match: ${error.message}`);
  return data || null;
}

export async function createMatch(userId, otherUserId, eventId = null) {
  const { data, error } = await supabase.rpc('create_match', {
    p_user_1: userId,
    p_user_2: otherUserId,
    p_event_id: eventId,
  });
  if (error) throw new Error(`Failed to create match: ${error.message}`);
  return data;
}

export async function getProfileForChat(userId) {
  const [{ data: profile, error: profileError }, { data: photos }] = await Promise.all([
    supabase.from('user_profiles').select('id, name, role, instagram, about_me').eq('id', userId).single(),
    supabase.from('user_photos').select('image_url, position').eq('user_id', userId).order('position'),
  ]);
  if (profileError) throw new Error(`Failed to fetch profile: ${profileError.message}`);
  return { ...profile, photos: photos || [] };
}
