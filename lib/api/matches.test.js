import { describe, it, expect, vi } from 'vitest';
vi.mock('../supabaseClient', () => ({ supabase: {} }));
import { roomKeyMatches } from './matches.js';

describe('roomKeyMatches', () => {
  it('matches identical name/city/date', () => {
    expect(roomKeyMatches(
      { name: 'EDC', city: 'Las Vegas', date: '2026-06-15' },
      { name: 'EDC', city: 'Las Vegas', date: '2026-06-15' },
    )).toBe(true);
  });

  it('matches when both dates are null', () => {
    expect(roomKeyMatches(
      { name: 'TBA', city: 'SF', date: null },
      { name: 'TBA', city: 'SF', date: null },
    )).toBe(true);
  });

  it('is case-sensitive on name and city (today we do not normalize)', () => {
    expect(roomKeyMatches(
      { name: 'EDC', city: 'Las Vegas', date: null },
      { name: 'edc', city: 'Las Vegas', date: null },
    )).toBe(false);
  });

  it('treats one-null-one-not as no match', () => {
    expect(roomKeyMatches(
      { name: 'E', city: 'C', date: null },
      { name: 'E', city: 'C', date: '2026-06-15' },
    )).toBe(false);
  });

  it('tolerates missing fields safely (returns false, not throw)', () => {
    expect(roomKeyMatches(null, { name: 'E', city: 'C', date: null })).toBe(false);
    expect(roomKeyMatches({ name: 'E', city: 'C', date: null }, null)).toBe(false);
  });
});
