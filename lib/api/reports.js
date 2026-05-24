import { supabase } from '../supabaseClient';

const VALID_REASONS = new Set([
  'harassment', 'spam', 'fake_profile', 'inappropriate_photos', 'underage', 'other',
]);
const VALID_CONTEXTS = new Set(['card', 'chat', 'profile']);

export async function submitReport({
  reporterId,
  reportedId,
  reason,
  details = null,
  context,
  matchId = null,
}) {
  if (!reporterId || !reportedId) throw new Error('submitReport: missing ids');
  if (reporterId === reportedId) throw new Error('submitReport: cannot report yourself');
  if (!VALID_REASONS.has(reason)) throw new Error(`submitReport: invalid reason "${reason}"`);
  if (!VALID_CONTEXTS.has(context)) throw new Error(`submitReport: invalid context "${context}"`);
  if (details && details.length > 500) throw new Error('submitReport: details exceed 500 chars');

  const { data, error } = await supabase
    .from('reports')
    .insert({
      reporter_id: reporterId,
      reported_id: reportedId,
      reason,
      details: details || null,
      context,
      match_id: matchId || null,
    })
    .select('id')
    .single();
  if (error) throw new Error(`Failed to submit report: ${error.message}`);
  return data;
}
