import { supabase } from '../supabaseClient';
import { getBlockedSet } from './blocks';

// Get matches for a user based on their event preferences
export async function getMatchesForUser(userId, eventName, city, date = null) {
  try {
    let query = supabase
      .from('user_events')
      .select('user_id')
      .eq('name', eventName.trim())
      .eq('city', city.trim())
      .neq('user_id', userId);

    if (date) {
      query = query.eq('date', date);
    } else {
      query = query.is('date', null);
    }

    const { data: userEvents, error: eventError } = await query;
    if (eventError) throw new Error(`Failed to fetch user events: ${eventError.message}`);

    let userIds = (userEvents || []).map((u) => u.user_id);
    if (userIds.length === 0) return [];

    // Filter out anyone who has blocked or been blocked by this user.
    const blockedSet = await getBlockedSet(userId);
    if (blockedSet.size > 0) {
      userIds = userIds.filter((id) => !blockedSet.has(id));
      if (userIds.length === 0) return [];
    }

    const { data: profiles, error: profileError } = await supabase
      .from('user_profiles')
      .select('id, name, instagram, vibe_tags, about_me, is_real, role')
      .in('id', userIds)
      .eq('is_real', true);
    if (profileError) throw new Error(`Failed to fetch user profiles: ${profileError.message}`);

    const { data: photos, error: photoError } = await supabase
      .from('user_photos')
      .select('user_id, image_url, position')
      .in('user_id', userIds);
    if (photoError) throw new Error(`Failed to fetch user photos: ${photoError.message}`);

    return (profiles || []).map((profile) => ({
      ...profile,
      photos: (photos || [])
        .filter((p) => p.user_id === profile.id)
        .sort((a, b) => a.position - b.position),
    }));
  } catch (error) {
    console.error('Error getting matches:', error);
    throw error;
  }
}

// Create a like/match
export async function createLike(fromUserId, toUserId, liked) {
  try {
    const { data, error } = await supabase
      .from('likes')
      .insert({
        from_user_id: fromUserId,
        to_user_id: toUserId,
        liked: liked
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create like: ${error.message}`);
    }

    return data;
  } catch (error) {
    console.error('Error creating like:', error);
    throw error;
  }
}

// Check if there's a mutual match
export async function checkMutualMatch(userId1, userId2) {
  try {
    const { data, error } = await supabase
      .from('likes')
      .select('*')
      .or(`and(from_user_id.eq.${userId1},to_user_id.eq.${userId2},liked.eq.true),and(from_user_id.eq.${userId2},to_user_id.eq.${userId1},liked.eq.true)`);

    if (error) {
      throw new Error(`Failed to check mutual match: ${error.message}`);
    }

    // Check if both users liked each other
    const user1LikedUser2 = data.some(like => like.from_user_id === userId1 && like.to_user_id === userId2 && like.liked);
    const user2LikedUser1 = data.some(like => like.from_user_id === userId2 && like.to_user_id === userId1 && like.liked);

    return user1LikedUser2 && user2LikedUser1;
  } catch (error) {
    console.error('Error checking mutual match:', error);
    throw error;
  }
}

// Return a user's active room set: events not yet past (future-dated or
// undated), most-recently-scanned first. Each room is augmented with
// `is_live` so the room switcher can render a 🔒 glyph for pending rooms.
export async function getActiveRooms(userId) {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const { data, error } = await supabase
    .from('user_events')
    .select('id, name, city, date, last_scanned_at')
    .eq('user_id', userId)
    .or(`date.gte.${today},date.is.null`)
    .order('last_scanned_at', { ascending: false });
  if (error) throw new Error(`Failed to load active rooms: ${error.message}`);

  const rooms = data || [];
  if (rooms.length === 0) return rooms;

  // Fetch live status for every room in this user's set in one shot.
  const live = await listLiveRooms(); // already error-tolerant
  return rooms.map((r) => ({
    ...r,
    is_live: live.some((lr) => roomKeyMatches(lr, r)),
  }));
}

// Get the user's most-recent active event (kept for compatibility).
// Returns null when the user has no active rooms.
export async function getUserEvent(userId) {
  const rooms = await getActiveRooms(userId);
  return rooms[0] || null;
}

// Create or refresh ONE room for the user. Re-scanning an event the user
// already has bumps its recency (last_scanned_at) instead of overwriting other
// rooms. Returns the row including its id (used as the "current room" pointer).
export async function createUserEvent(userId, eventName, city, date = null) {
  try {
    const name = eventName.trim();
    const trimmedCity = city.trim();

    let existingQuery = supabase
      .from('user_events')
      .select('id')
      .eq('user_id', userId)
      .eq('name', name)
      .eq('city', trimmedCity);
    existingQuery = date
      ? existingQuery.eq('date', date)
      : existingQuery.is('date', null);
    const { data: existing } = await existingQuery.maybeSingle();

    if (existing) {
      const { data, error } = await supabase
        .from('user_events')
        .update({ last_scanned_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select('id, name, city, date')
        .single();
      if (error) throw new Error(`Failed to update user event: ${error.message}`);
      return data;
    }

    const { data, error } = await supabase
      .from('user_events')
      .insert({ user_id: userId, name, date, city: trimmedCity })
      .select('id, name, city, date')
      .single();
    if (error) throw new Error(`Failed to create user event: ${error.message}`);
    return data;
  } catch (error) {
    console.error('Error creating/updating user event:', error);
    throw error;
  }
}

// Pure key equality for live-room lookup. Collapsed to name-only as of
// 20260531000000_collapse_live_rooms_to_name.sql — same event name = same
// room regardless of city/date variants. Matching pools (getMatchesForUser)
// still key by (name, city, date); only live-status lookup is name-only.
export function roomKeyMatches(a, b) {
  if (!a || !b) return false;
  return a.name === b.name;
}

// Returns { status: 'live'|'pending', votes: int, threshold: int } for one
// (name, city, date) key. Falls back to a pending/zero/15 default if the RPC
// call fails so a transient DB blip doesn't unlock matching by accident.
export async function getRoomStatus(name, city, date = null) {
  try {
    const { data, error } = await supabase.rpc('get_room_status', {
      p_name: name.trim(),
      p_city: city.trim(),
      p_date: date ?? null,
    });
    if (error) throw error;
    const row = (data && data[0]) || null;
    if (!row) return { status: 'pending', votes: 0, threshold: 15 };
    return {
      status: row.status === 'live' ? 'live' : 'pending',
      votes: Number(row.votes ?? 0),
      threshold: Number(row.threshold ?? 15),
    };
  } catch (err) {
    console.error('getRoomStatus failed:', err);
    return { status: 'pending', votes: 0, threshold: 15 };
  }
}

// Cached list of currently-live rooms (small set in beta). Used by the home
// autocomplete to render a LIVE chip on matching dropdown rows.
export async function listLiveRooms() {
  try {
    const { data, error } = await supabase.rpc('list_live_rooms');
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('listLiveRooms failed:', err);
    return [];
  }
}
