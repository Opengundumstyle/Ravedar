'use client';

import { useState } from 'react';
import { submitReport } from '../../lib/api/reports';
import { blockUser } from '../../lib/api/blocks';

const REASONS = [
  { value: 'harassment',           label: 'harassment / threats' },
  { value: 'spam',                 label: 'spam or scam' },
  { value: 'fake_profile',         label: 'fake profile' },
  { value: 'inappropriate_photos', label: 'inappropriate photos' },
  { value: 'underage',             label: 'underage' },
  { value: 'other',                label: 'other' },
];

const MAX_DETAILS = 500;

/**
 * ReportModal — full-screen overlay for submitting a report.
 *
 * Props:
 *   currentUserId: string
 *   reportedUserId: string
 *   reportedUserName?: string
 *   context: 'card' | 'chat' | 'profile'
 *   matchId?: string | null
 *   onClose: () => void
 *   onDone: ({ blocked: boolean }) => void
 */
export default function ReportModal({
  currentUserId,
  reportedUserId,
  reportedUserName,
  context,
  matchId = null,
  onClose,
  onDone,
}) {
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(context === 'chat');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const submit = async (e) => {
    e?.preventDefault();
    if (busy || !reason) return;
    setBusy(true);
    setError('');
    try {
      if (alsoBlock) {
        await blockUser(currentUserId, reportedUserId);
      }
      await submitReport({
        reporterId: currentUserId,
        reportedId: reportedUserId,
        reason,
        details: details.trim() || null,
        context,
        matchId,
      });
      setSuccess(true);
      setTimeout(() => onDone({ blocked: alsoBlock }), 1400);
    } catch (e) {
      setError(e.message || 'couldn't submit — try again?');
      setBusy(false);
    }
  };

  return (
    <div style={s.backdrop} onClick={busy ? undefined : onClose}>
      <div style={s.card} onClick={(e) => e.stopPropagation()}>
        <h2 className="rd-title-tag" style={s.title}>REPORT</h2>
        <p style={s.sub}>tell us what happened. we read every report.</p>
        {reportedUserName && (
          <p style={s.target}>
            ▸ reporting <span style={s.name}>{String(reportedUserName).toLowerCase()}</span>
          </p>
        )}

        {success ? (
          <div className="rd-banner rd-banner--success" style={{ marginTop: '1.2rem' }}>
            ▸ thanks. we'll review.
          </div>
        ) : (
          <form onSubmit={submit}>
            <fieldset style={s.fieldset}>
              <legend style={s.legend}>reason</legend>
              {REASONS.map((r) => (
                <label key={r.value} style={s.reasonRow}>
                  <input
                    type="radio"
                    name="reason"
                    value={r.value}
                    checked={reason === r.value}
                    onChange={() => setReason(r.value)}
                    style={s.radio}
                  />
                  <span style={s.reasonLabel}>{r.label}</span>
                </label>
              ))}
            </fieldset>

            <label style={s.detailsLabel}>
              <span style={s.detailsHeader}>
                <span>details (optional)</span>
                <span style={s.charCount}>
                  {details.length} / {MAX_DETAILS}
                </span>
              </span>
              <textarea
                className="rd-input"
                value={details}
                onChange={(e) => setDetails(e.target.value.slice(0, MAX_DETAILS))}
                rows={4}
                placeholder="what did they do?"
                style={s.textarea}
              />
            </label>

            <label style={s.blockRow}>
              <input
                type="checkbox"
                checked={alsoBlock}
                onChange={(e) => setAlsoBlock(e.target.checked)}
                style={s.checkbox}
              />
              <span style={s.blockLabel}>▸ also block this user</span>
            </label>

            {error && <div className="rd-banner rd-banner--error" style={{ marginTop: '1rem' }}>▸ {error}</div>}

            <div style={s.actions}>
              <div className="rd-btn-wrap">
                <button
                  type="submit"
                  className="rd-btn-neon"
                  disabled={!reason || busy}
                >
                  {busy ? '··· submitting' : 'submit report'}
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
          </form>
        )}
      </div>
    </div>
  );
}

const s = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.82)',
    backdropFilter: 'blur(6px)',
    zIndex: 100,
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: '2rem 1rem',
    overflowY: 'auto',
  },
  card: {
    position: 'relative',
    background: '#0d0d0d',
    border: '1px solid rgba(255,26,138,0.45)',
    boxShadow: '0 12px 36px rgba(0,0,0,0.7), 0 0 22px rgba(255,26,138,0.25)',
    padding: '2rem 1.4rem 1.6rem',
    width: '100%',
    maxWidth: 460,
    color: '#fff',
  },
  title: {
    fontSize: 'clamp(2.4rem, 9vw, 3.2rem)',
    transform: 'rotate(-3deg)',
    display: 'inline-block',
    marginBottom: '0.6rem',
    lineHeight: 1,
  },
  sub: {
    fontFamily: 'var(--font-body-mono), monospace',
    fontSize: '0.88rem',
    color: 'rgba(255,255,255,0.78)',
    marginBottom: '0.6rem',
  },
  target: {
    fontFamily: 'var(--font-mono-accent), monospace',
    fontSize: '0.7rem',
    letterSpacing: '0.22em',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.6)',
    marginBottom: '1rem',
  },
  name: { color: 'var(--rd-spray-pink)' },
  fieldset: {
    border: 'none',
    padding: 0,
    margin: '0 0 1rem',
  },
  legend: {
    fontFamily: 'var(--font-mono-accent), monospace',
    fontSize: '0.7rem',
    letterSpacing: '0.28em',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.55)',
    marginBottom: '0.55rem',
  },
  reasonRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.6rem',
    padding: '0.5rem 0',
    cursor: 'pointer',
  },
  radio: {
    accentColor: '#ff1a8a',
    transform: 'scale(1.15)',
  },
  reasonLabel: {
    fontFamily: 'var(--font-body-mono), monospace',
    fontSize: '0.92rem',
    color: '#fff',
  },
  detailsLabel: { display: 'block', marginBottom: '1rem' },
  detailsHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    fontFamily: 'var(--font-mono-accent), monospace',
    fontSize: '0.7rem',
    letterSpacing: '0.22em',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.55)',
    marginBottom: '0.4rem',
  },
  charCount: { color: 'rgba(255,255,255,0.45)' },
  textarea: {
    width: '100%',
    fontFamily: 'var(--font-body-mono), monospace',
    fontSize: '0.92rem',
    resize: 'vertical',
  },
  blockRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.55rem',
    padding: '0.55rem 0',
    cursor: 'pointer',
  },
  checkbox: { accentColor: '#ff1a8a', transform: 'scale(1.15)' },
  blockLabel: {
    fontFamily: 'var(--font-mono-accent), monospace',
    fontSize: '0.72rem',
    letterSpacing: '0.22em',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.85)',
  },
  actions: { marginTop: '1.2rem', display: 'flex', flexDirection: 'column' },
};
