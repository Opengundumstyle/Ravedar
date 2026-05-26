import { supabase } from '../supabaseClient';

export const MAX_DAILY_DROP = 4;
export const DNA_TARGET = 12;

// Choose unanswered cards, capped at `limit`. Pure — caller pre-shuffles if desired.
export function pickDailyDrop(cards, answeredIds, limit = MAX_DAILY_DROP) {
  const list = Array.isArray(cards) ? cards : [];
  const answered = answeredIds instanceof Set ? answeredIds : new Set();
  const out = [];
  for (const card of list) {
    if (!card || answered.has(card.id)) continue;
    out.push(card);
    if (out.length >= limit) break;
  }
  return out;
}

// Roll a list of {choice, card:{genre_a,genre_b}} into genre counts + completeness.
export function tallyDNA(answers) {
  const list = Array.isArray(answers) ? answers : [];
  const counts = {};
  for (const a of list) {
    const genre = a?.choice === 'a' ? a?.card?.genre_a : a?.card?.genre_b;
    if (!genre) continue;
    counts[genre] = (counts[genre] || 0) + 1;
  }
  const topGenres = Object.keys(counts).sort((x, y) => counts[y] - counts[x]);
  return { answeredCount: list.length, target: DNA_TARGET, counts, topGenres };
}
