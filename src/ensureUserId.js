import { v4 as uuidv4 } from 'uuid';
import { supabase } from './supabaseClient';

export async function ensureUserId() {
  let userId = localStorage.getItem('user_profile_id');
  if (!userId) {
    userId = uuidv4();
    localStorage.setItem('user_profile_id', userId);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 1 day expiry
    // Create user_sessions
    const { error: sessionError } = await supabase.from('user_sessions').insert({ id: userId, expires_at: expiresAt });
    if (sessionError) {
      console.error('Error inserting user_sessions:', sessionError);
      return null;
    }
    // Create minimal user_profiles
    const { data, error } = await supabase.from('user_profiles').insert({
      id: userId,
      name: 'Anonymous',
      is_real: true,
      expires_at: expiresAt
    });
    console.log('Insert result:', { data, error });
    if (error) {
      console.error('Error inserting user_profiles:', error);
      return null;
    }
  }
  console.log('Returning userId from ensureUserId:', userId);
  return userId;
}

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