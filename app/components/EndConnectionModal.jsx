'use client';

import { useState } from 'react';
import { unmatchUser, blockUser } from '../../lib/api/blocks';

/**
 * EndConnectionModal — confirms an unmatch or block.
 *
 * Props:
 *   mode: 'unmatch' | 'block'
 *   currentUserId: string
 *   otherUserId: string
 *   otherUserName?: string
 *   onClose: () => void
 *   onDone: () => void   // called after the API call succeeds
 */
export default function EndConnectionModal({
  mode,
  currentUserId,
  otherUserId,
  otherUserName,
  onClose,
  onDone,
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const isBlock = mode === 'block';
  const title = isBlock ? 'BLOCK?' : 'UNMATCH?';
  const body = isBlock
    ? "you'll stop seeing each other completely. you can undo this from settings."
    : "you won't see them in this chat anymore. you could still match again at a future event.";
  const confirmLabel = isBlock ? 'yes, block' : 'yes, unmatch';

  const handleConfirm = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (isBlock) await blockUser(currentUserId, otherUserId);
      else await unmatchUser(currentUserId, otherUserId);
      onDone();
    } catch (e) {
      setError(e.message || 'something went wrong.');
      setBusy(false);
    }
  };

  return (
    <div style={s.backdrop} onClick={busy ? undefined : onClose}>
      <div style={s.card} onClick={(e) => e.stopPropagation()}>
        <h2 className="rd-title-tag" style={s.title}>{title}</h2>
        <p style={s.body}>
          {body}
          {otherUserName && (
            <>
              {' '}
              <span style={s.name}>{String(otherUserName).toLowerCase()}</span>
            </>
          )}
        </p>
        {error && <div className="rd-banner rd-banner--error" style={{ marginTop: '1rem' }}>▸ {error}</div>}
        <div style={s.actions}>
          <div className="rd-btn-wrap">
            <button
              type="button"
              className="rd-btn-neon rd-btn-neon--pink"
              onClick={handleConfirm}
              disabled={busy}
            >
              {busy ? '··· working' : confirmLabel}
            </button>
          </div>
          <button
            type="button"
            className="rd-btn-ghost"
            onClick={onClose}
            disabled={busy}
            style={{ marginTop: '0.8rem' }}
          >
            cancel
          </button>
        </div>
      </div>
    </div>
  );
}

const s = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.78)',
    backdropFilter: 'blur(6px)',
    zIndex: 100,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1.5rem',
  },
  card: {
    position: 'relative',
    background: '#0d0d0d',
    border: '1px solid rgba(255,26,138,0.45)',
    boxShadow: '0 12px 36px rgba(0,0,0,0.7), 0 0 22px rgba(255,26,138,0.25)',
    padding: '2rem 1.6rem 1.8rem',
    width: '100%',
    maxWidth: 380,
    color: '#fff',
  },
  title: {
    fontSize: 'clamp(2.4rem, 9vw, 3.2rem)',
    transform: 'rotate(-3deg)',
    display: 'inline-block',
    marginBottom: '0.9rem',
    lineHeight: 1,
  },
  body: {
    fontFamily: 'var(--font-body-mono), monospace',
    fontSize: '0.9rem',
    lineHeight: 1.55,
    color: 'rgba(255,255,255,0.88)',
    marginBottom: '0.4rem',
  },
  name: {
    color: 'var(--rd-spray-pink)',
    fontFamily: 'var(--font-mono-accent), monospace',
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
  },
  actions: {
    marginTop: '1.4rem',
    display: 'flex',
    flexDirection: 'column',
  },
};
