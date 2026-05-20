import { supabase } from './supabaseClient';

// user_events.user_id → user_profiles.id, so anonymous users must have a
// user_profiles row before they can save an event. Idempotent: upsert with
// ignoreDuplicates so re-running is a no-op for existing rows.
async function ensureProfileRow(userId) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  const { error } = await supabase
    .from('user_profiles')
    .upsert(
      { id: userId, is_real: false, expires_at: expiresAt },
      { onConflict: 'id', ignoreDuplicates: true }
    );
  if (error) {
    console.error('Failed to ensure user_profiles row:', error);
    throw new Error(`Failed to bootstrap user profile: ${error.message}`);
  }
}

export const ensureUserId = async () => {
  // Check if user already has a profile ID in localStorage
  let userId = localStorage.getItem('user_profile_id');

  if (userId) {
    // Verify the profile row actually exists. A stranded auth user ID
    // (signed up but no profile row created) would otherwise FK-fail downstream.
    const { data } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle();
    if (data) return userId;
    // Orphan ID — clear it and re-create through the normal flow.
    localStorage.removeItem('user_profile_id');
    userId = null;
  }

  // Check if user has a session
  const { data: { session } } = await supabase.auth.getSession();

  if (session?.user) {
    // User is authenticated, use their auth ID
    userId = session.user.id;
    localStorage.setItem('user_profile_id', userId);
    await ensureProfileRow(userId);
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
    await ensureProfileRow(userId);
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