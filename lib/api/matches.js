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

// Get user's event preferences
export async function getUserEvent(userId) {
  try {
    const { data, error } = await supabase
      .from('user_events')
      .select('name, date, city')
      .eq('user_id', userId)
      .single();

    if (error) {
      throw new Error(`Failed to get user event: ${error.message}`);
    }

    return data;
  } catch (error) {
    console.error('Error getting user event:', error);
    throw error;
  }
}

// Create or update user event
export async function createUserEvent(userId, eventName, city, date = null) {
  try {
    // First check if user already has an event
    const { data: existingEvent } = await supabase
      .from('user_events')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (existingEvent) {
      // Update existing event
      const { data, error } = await supabase
        .from('user_events')
        .update({
          name: eventName,
          date: date,
          city: city
        })
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to update user event: ${error.message}`);
      }

      return data;
    } else {
      // Create new event
      const { data, error } = await supabase
        .from('user_events')
        .insert({
          user_id: userId,
          name: eventName,
          date: date,
          city: city
        })
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to create user event: ${error.message}`);
      }

      return data;
    }
  } catch (error) {
    console.error('Error creating/updating user event:', error);
    throw error;
  }
} 