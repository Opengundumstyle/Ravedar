import { supabase } from '../supabaseClient';

export const MAX_DAILY_DROP = 4;
export const DNA_TARGET = 12;

// Merge new genres into an existing tag list: additive, deduped, capped.
export function mergeVibeTags(existing, additions, cap = 8) {
  const out = Array.isArray(existing) ? [...existing] : [];
  for (const tag of additions || []) {
    if (tag && !out.includes(tag)) out.push(tag);
  }
  return out.slice(0, cap);
}

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

// Fetch active cards the user hasn't answered, scoped to their city or global.
// Returns up to MAX_DAILY_DROP shaped card objects ready to inject into the deck.
export async function getDailyDrop(userId, { city = null } = {}, limit = MAX_DAILY_DROP) {
  try {
    let query = supabase
      .from('prompt_cards')
      .select('id, question, option_a, option_b, genre_a, genre_b, city')
      .eq('active', true);
    // City-targeted OR global (null city) cards. Quote the value so a city
    // containing spaces/commas/parens can't corrupt the PostgREST filter.
    if (city) query = query.or(`city.is.null,city.eq."${city}"`);
    else query = query.is('city', null);

    const { data: cards, error } = await query;
    if (error) throw new Error(`Failed to fetch cards: ${error.message}`);

    const { data: answered } = await supabase
      .from('card_answers')
      .select('card_id')
      .eq('user_id', userId);
    const answeredIds = new Set((answered || []).map((r) => r.card_id));

    // Shuffle then pick so the drop feels fresh each build.
    const shuffled = [...(cards || [])].sort(() => Math.random() - 0.5);
    return pickDailyDrop(shuffled, answeredIds, limit).map((c) => ({
      id: c.id,
      is_card: true,
      question: c.question,
      option_a: c.option_a,
      option_b: c.option_b,
      genre_a: c.genre_a,
      genre_b: c.genre_b,
      photos: [], // keep deck code paths that read photos happy
    }));
  } catch (err) {
    console.error('getDailyDrop failed:', err);
    return [];
  }
}

// Record an answer (idempotent on user+card) and return the reveal stats.
// choice: 'a' | 'b'. Returns { pct, cohort, label } or null.
export async function answerCard(userId, card, choice, { eventName = null, city = null } = {}) {
  try {
    await supabase
      .from('card_answers')
      .upsert(
        { user_id: userId, card_id: card.id, choice, event_name: eventName, city },
        { onConflict: 'user_id,card_id', ignoreDuplicates: true }
      );

    // Enrich vibe_tags additively with the chosen genre (best-effort, never
    // blocks the stats reveal — an enrichment failure must not lose the answer).
    try {
      const chosenGenre = choice === 'a' ? card.genre_a : card.genre_b;
      if (chosenGenre) {
        const { data: prof } = await supabase
          .from('user_profiles')
          .select('vibe_tags')
          .eq('id', userId)
          .single();
        const merged = mergeVibeTags(prof?.vibe_tags, [chosenGenre]);
        if (merged.length !== (prof?.vibe_tags?.length || 0)) {
          await supabase.from('user_profiles').update({ vibe_tags: merged }).eq('id', userId);
        }
      }
    } catch (enrichErr) {
      console.warn('vibe_tags enrich failed (non-fatal):', enrichErr);
    }

    const { data, error } = await supabase.rpc('get_card_stats', {
      p_card_id: card.id,
      p_event: eventName,
      p_city: city,
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;

    const pct = choice === 'a' ? row.pct_a : row.pct_b;
    const label = choice === 'a' ? card.option_a : card.option_b;
    return { pct, cohort: row.cohort, label };
  } catch (err) {
    console.error('answerCard failed:', err);
    return null;
  }
}

// Fetch the user's answers joined to their cards and roll into DNA.
export async function getRaverDNA(userId) {
  try {
    const { data, error } = await supabase
      .from('card_answers')
      .select('choice, card:prompt_cards(genre_a, genre_b)')
      .eq('user_id', userId);
    if (error) throw new Error(error.message);
    return tallyDNA(data || []);
  } catch (err) {
    console.error('getRaverDNA failed:', err);
    return tallyDNA([]);
  }
}
