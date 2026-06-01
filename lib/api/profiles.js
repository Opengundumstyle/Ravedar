import { supabase } from '../supabaseClient';

// Get user profile by ID
export async function getUserProfile(userId) {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select(`
        id,
        name,
        instagram,
        about_me,
        vibe_tags,
        is_real,
        role,
        created_at,
        expires_at,
        photos:user_photos(image_url, position)
      `)
      .eq('id', userId)
      .single();

    if (error) {
      throw new Error(`Failed to get user profile: ${error.message}`);
    }

    return data;
  } catch (error) {
    console.error('Error getting user profile:', error);
    throw error;
  }
}

// Create or update user profile
export async function createOrUpdateProfile(userId, profileData) {
  try {
    const {
      name,
      instagram,
      aboutMe,
      vibeTags,
      isReal = true,
      expiresAt = null
    } = profileData;

    // Check if profile exists
    const { data: existingProfile } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('id', userId)
      .single();

    if (existingProfile) {
      // Update existing profile
      const { data, error } = await supabase
        .from('user_profiles')
        .update({
          name,
          instagram,
          about_me: aboutMe,
          vibe_tags: vibeTags,
          is_real: isReal,
          expires_at: expiresAt
        })
        .eq('id', userId)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to update profile: ${error.message}`);
      }

      return data;
    } else {
      // Create new profile
      const { data, error } = await supabase
        .from('user_profiles')
        .insert({
          id: userId,
          name,
          instagram,
          about_me: aboutMe,
          vibe_tags: vibeTags,
          is_real: isReal,
          expires_at: expiresAt
        })
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to create profile: ${error.message}`);
      }

      return data;
    }
  } catch (error) {
    console.error('Error creating/updating profile:', error);
    throw error;
  }
}

// Upload user photos
export async function uploadUserPhotos(userId, photos) {
  try {
    const photoPromises = photos.map(async (photo, index) => {
      const { data, error } = await supabase
        .from('user_photos')
        .insert({
          user_id: userId,
          image_url: photo.image_url,
          position: index
        })
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to upload photo ${index + 1}: ${error.message}`);
      }

      return data;
    });

    const uploadedPhotos = await Promise.all(photoPromises);
    return uploadedPhotos;
  } catch (error) {
    console.error('Error uploading photos:', error);
    throw error;
  }
}

// Delete user photo
export async function deleteUserPhoto(photoId, userId) {
  try {
    // First verify the photo belongs to the user
    const { data: photo, error: fetchError } = await supabase
      .from('user_photos')
      .select('user_id')
      .eq('id', photoId)
      .single();

    if (fetchError) {
      throw new Error(`Failed to fetch photo: ${fetchError.message}`);
    }

    if (photo.user_id !== userId) {
      throw new Error('Unauthorized: You can only delete your own photos');
    }

    const { data, error } = await supabase
      .from('user_photos')
      .delete()
      .eq('id', photoId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to delete photo: ${error.message}`);
    }

    return data;
  } catch (error) {
    console.error('Error deleting photo:', error);
    throw error;
  }
}

// Get demo profiles (for non-authenticated users)
export async function getDemoProfiles() {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select(`
        id,
        name,
        instagram,
        about_me,
        vibe_tags,
        is_real,
        role,
        photos:user_photos(image_url, position)
      `)
      .or('is_real.eq.false,role.eq.founder,role.eq.co-founder')
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to get demo profiles: ${error.message}`);
    }

    return data || [];
  } catch (error) {
    console.error('Error getting demo profiles:', error);
    throw error;
  }
}

// Search profiles by vibe tags
export async function searchProfilesByVibeTags(vibeTags, limit = 20) {
  try {
    if (!vibeTags || vibeTags.length === 0) {
      return [];
    }

    // Create a filter for any of the vibe tags
    const vibeFilter = vibeTags.map(tag => `vibe_tags.cs.{${tag}}`).join(',');

    const { data, error } = await supabase
      .from('user_profiles')
      .select(`
        id,
        name,
        instagram,
        about_me,
        vibe_tags,
        is_real,
        role,
        photos:user_photos(image_url, position)
      `)
      .or(vibeFilter)
      .eq('is_real', true)
      .limit(limit);

    if (error) {
      throw new Error(`Failed to search profiles: ${error.message}`);
    }

    return data || [];
  } catch (error) {
    console.error('Error searching profiles:', error);
    throw error;
  }
}

// Get user session
export async function getUserSession(userId) {
  try {
    const { data, error } = await supabase
      .from('user_sessions')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      throw new Error(`Failed to get user session: ${error.message}`);
    }

    return data;
  } catch (error) {
    console.error('Error getting user session:', error);
    throw error;
  }
}

// Create or update user session
export async function createOrUpdateUserSession(userId, expiresAt) {
  try {
    // Check if session exists
    const { data: existingSession } = await supabase
      .from('user_sessions')
      .select('id')
      .eq('id', userId)
      .single();

    if (existingSession) {
      // Update existing session
      const { data, error } = await supabase
        .from('user_sessions')
        .update({ expires_at: expiresAt })
        .eq('id', userId)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to update user session: ${error.message}`);
      }

      return data;
    } else {
      // Create new session
      const { data, error } = await supabase
        .from('user_sessions')
        .insert({
          id: userId,
          expires_at: expiresAt
        })
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to create user session: ${error.message}`);
      }

      return data;
    }
  } catch (error) {
    console.error('Error creating/updating user session:', error);
    throw error;
  }
} 