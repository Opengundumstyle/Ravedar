'use client';

import React from 'react';
import ShareEventLink from './ShareEventLink';

/**
 * Pinned banner above the deck when real-co-attendee count is 1-3.
 * Tells the user the room is sparse and offers the share CTA.
 */
export default function SparseRoomBanner({ realCount, eventName, city, date }) {
  if (realCount < 1 || realCount > 3) return null;

  return (
    <div
      className="rd-banner rd-banner--sparse"
      style={{
        position: 'fixed',
        top: '4.5rem',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 35,
        maxWidth: '460px',
        width: 'calc(100% - 2.5rem)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '0.8rem',
        margin: 0,
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: 'var(--font-mono-accent), monospace', fontSize: '0.72rem', letterSpacing: '0.28em', textTransform: 'uppercase', opacity: 0.85 }}>
          ▸ {realCount} {realCount === 1 ? 'raver' : 'ravers'} scanning this room
        </div>
        <div style={{ fontFamily: 'var(--font-body-mono), monospace', fontSize: '0.74rem', opacity: 0.7, marginTop: '0.2rem' }}>
          drop the link — bring your crew
        </div>
      </div>
      <ShareEventLink eventName={eventName} city={city} date={date} variant="inline" />
    </div>
  );
}
