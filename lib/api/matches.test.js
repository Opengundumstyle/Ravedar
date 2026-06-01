import { describe, it, expect, vi } from 'vitest';
vi.mock('../supabaseClient', () => ({ supabase: {} }));
import { roomKeyMatches } from './matches.js';

describe('roomKeyMatches (name-only after collapse)', () => {
  it('matches identical names regardless of city/date', () => {
    expect(roomKeyMatches(
      { name: 'EDC', city: 'Las Vegas', date: '2026-06-15' },
      { name: 'EDC', city: 'Orlando', date: '2026-11-10' },
    )).toBe(true);
  });

  it('matches name-only objects', () => {
    expect(roomKeyMatches({ name: 'EDC' }, { name: 'EDC' })).toBe(true);
  });

  it('matches when one side has city/date and the other does not', () => {
    expect(roomKeyMatches(
      { name: 'Electric Sheep' },
      { name: 'Electric Sheep', city: 'San Francisco, CA', date: null },
    )).toBe(true);
  });

  it('is case-sensitive on name', () => {
    expect(roomKeyMatches(
      { name: 'EDC' },
      { name: 'edc' },
    )).toBe(false);
  });

  it('returns false for different names', () => {
    expect(roomKeyMatches(
      { name: 'Electric Sheep', city: 'SF' },
      { name: 'Electric Forest', city: 'SF' },
    )).toBe(false);
  });

  it('tolerates missing fields safely (returns false, not throw)', () => {
    expect(roomKeyMatches(null, { name: 'E' })).toBe(false);
    expect(roomKeyMatches({ name: 'E' }, null)).toBe(false);
  });
});
