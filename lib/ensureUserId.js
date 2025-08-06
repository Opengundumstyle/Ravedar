import { supabase } from './supabaseClient';

export const ensureUserId = async () => {
  // Check if user already has a profile ID in localStorage
  let userId = localStorage.getItem('user_profile_id');
  
  if (userId) {
    return userId;
  }

  // Check if user has a session
  const { data: { session } } = await supabase.auth.getSession();
  
  if (session?.user) {
    // User is authenticated, use their auth ID
    userId = session.user.id;
    localStorage.setItem('user_profile_id', userId);
    return userId;
  }

  // Create anonymous user session
  const { data: sessionData, error } = await supabase.auth.signUp({
    email: `anonymous_${Date.now()}@ravedar.com`,
    password: `anonymous_${Date.now()}_${Math.random().toString(36).substring(2)}`,
  });

  if (error) {
    console.error('Error creating anonymous session:', error);
    throw error;
  }

  if (sessionData.user) {
    userId = sessionData.user.id;
    localStorage.setItem('user_profile_id', userId);
    return userId;
  }

  throw new Error('Failed to create user session');
};

export function ensureSectionId() {
  let sectionId = localStorage.getItem('user_section_id');
  if (!sectionId) {
    sectionId = uuidv4();
    localStorage.setItem('user_section_id', sectionId);
  }
  return sectionId;
}

export function clearSessionData() {
  localStorage.removeItem('user_profile_id');
  localStorage.removeItem('user_section_id');
  localStorage.removeItem('user_event_data');
} 