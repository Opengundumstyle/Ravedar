'use client';

import React from 'react';
import { useRouter } from 'next/navigation';

/**
 * Intercepts an anonymous user's right-swipe on a real co-attendee.
 * The like has already been written; this modal sells the upgrade.
 */
export default function SignupGateModal({ isOpen, onKeepTagging, matchedUser }) {
  const router = useRouter();
  if (!isOpen || !matchedUser) return null;

  const firstPhoto = matchedUser.photos?.[0]?.image_url;
  const name = matchedUser.name || 'they';

  return (
    <div className="rd-match-overlay is-open" role="dialog" aria-modal="true">
      <div className="rd-match-laser" />
      <div className="rd-match-laser rd-match-laser--b" />

      <div className="rd-match-card">
        <div className="rd-match-title" style={{ fontSize: 'clamp(1.6rem, 5vw, 2.2rem)' }}>
          ▸ {String(name).toLowerCase()} is real.
        </div>
        <div className="rd-match-sub" style={{ marginBottom: '1.4rem' }}>
          they uploaded a tag. so should you. drop yours and they&apos;ll see your vibe in their room.
        </div>

        <div className="rd-match-pair" style={{ justifyContent: 'center' }}>
          <div className="rd-match-photo rd-match-photo--b">
            <div className="rd-match-mini-tape" />
            {firstPhoto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={firstPhoto} alt={name} />
            ) : (
              <div
                style={{
                  width: '100%',
                  height: '90px',
                  background: '#2a2a2a',
                  color: '#fff',
                  fontFamily: 'var(--font-graffiti), cursive',
                  fontSize: '1.6rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {String(name)[0]?.toUpperCase()}
              </div>
            )}
            <div className="rd-match-mini-label">{String(name).toLowerCase()}</div>
          </div>
        </div>

        <div className="rd-btn-wrap" style={{ marginBottom: '0.7rem' }}>
          <button className="rd-btn-neon" onClick={() => router.push('/signup')}>
            TAG IN
          </button>
        </div>
        <button className="rd-btn-ghost" onClick={onKeepTagging}>
          KEEP TAGGING
        </button>
      </div>
    </div>
  );
}
