import { describe, it, expect, vi } from 'vitest';
vi.mock('../supabaseClient', () => ({ supabase: {} }));
import { pickDailyDrop, tallyDNA, DNA_TARGET, MAX_DAILY_DROP } from './cards.js';

describe('pickDailyDrop', () => {
  const cards = [
    { id: 'c1' }, { id: 'c2' }, { id: 'c3' }, { id: 'c4' }, { id: 'c5' }, { id: 'c6' },
  ];

  it('excludes already-answered cards', () => {
    const out = pickDailyDrop(cards, new Set(['c1', 'c2']), 10);
    expect(out.map((c) => c.id)).not.toContain('c1');
    expect(out.map((c) => c.id)).not.toContain('c2');
    expect(out).toHaveLength(4);
  });

  it('caps the result at the limit', () => {
    const out = pickDailyDrop(cards, new Set(), 3);
    expect(out).toHaveLength(3);
  });

  it('returns empty when everything is answered', () => {
    const out = pickDailyDrop(cards, new Set(cards.map((c) => c.id)), 4);
    expect(out).toEqual([]);
  });

  it('tolerates null/undefined input', () => {
    expect(pickDailyDrop(null, new Set(), 4)).toEqual([]);
    expect(pickDailyDrop(cards, null, 4)).toHaveLength(4);
  });
});

describe('tallyDNA', () => {
  it('counts genres from a/b choices and reports completeness', () => {
    const answers = [
      { choice: 'a', card: { genre_a: 'House', genre_b: 'Techno' } },
      { choice: 'b', card: { genre_a: 'House', genre_b: 'Techno' } },
      { choice: 'a', card: { genre_a: 'House', genre_b: 'Trance' } },
    ];
    const dna = tallyDNA(answers);
    expect(dna.answeredCount).toBe(3);
    expect(dna.target).toBe(DNA_TARGET);
    expect(dna.topGenres[0]).toBe('House'); // House picked twice
    expect(dna.counts.House).toBe(2);
    expect(dna.counts.Techno).toBe(1);
  });

  it('ignores answers with no mapped genre', () => {
    const dna = tallyDNA([{ choice: 'a', card: { genre_a: null, genre_b: 'Techno' } }]);
    expect(dna.answeredCount).toBe(1);
    expect(dna.topGenres).toEqual([]);
  });

  it('handles empty input', () => {
    const dna = tallyDNA([]);
    expect(dna).toEqual({ answeredCount: 0, target: DNA_TARGET, counts: {}, topGenres: [] });
  });
});

describe('constants', () => {
  it('exposes tuning constants', () => {
    expect(MAX_DAILY_DROP).toBe(4);
    expect(DNA_TARGET).toBe(12);
  });
});
