'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import GraffitiWall from '../components/GraffitiWall';
import { listBlockedAccounts, unblockUser } from '../../lib/api/blocks';

const DEFAULT_PHOTO =
  'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=120&h=120&fit=crop&crop=center';

export default function SettingsPage() {
  const router = useRouter();
  const [myId, setMyId] = useState(null);
  const [blocked, setBlocked] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const uid = localStorage.getItem('user_profile_id');
    if (!uid) {
      router.push('/signin');
      return;
    }
    setMyId(uid);

    listBlockedAccounts(uid)
      .then((list) => {
        setBlocked(list);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [router]);

  const handleUnblock = async (targetId) => {
    if (!myId) return;
    try {
      await unblockUser(myId, targetId);
      setBlocked((prev) => prev.filter((b) => b.id !== targetId));
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="rd-screen scrollable">
      <GraffitiWall ghostTags={false} />

      <div style={page.topbar}>
        <button className="rd-nav-chip" onClick={() => router.push('/user-panel')}>
          ◄ BACK
        </button>
        <div style={page.statusPill} className="rd-status-pill">
          <span className="rd-status-dot" />
          ravedar ▸ settings
        </div>
        <div style={{ width: 60 }} />
      </div>

      <div style={page.column}>
        <h1 className="rd-title-tag" style={page.title}>SETTINGS</h1>

        <section style={page.section}>
          <h2 style={page.sectionHeader}>▸ blocked accounts</h2>

          {error && (
            <div className="rd-banner rd-banner--error" style={{ marginBottom: '1rem' }}>
              ▸ {error}
            </div>
          )}

          {loading && <div style={page.muted}>▸ loading ···</div>}

          {!loading && blocked.length === 0 && (
            <div style={page.muted}>you haven't blocked anyone.</div>
          )}

          {!loading && blocked.length > 0 && (
            <ul style={page.list}>
              {blocked.map((b) => (
                <li key={b.id} style={page.row}>
                  <img
                    src={b.photo_url || DEFAULT_PHOTO}
                    alt=""
                    style={page.avatar}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={page.name}>{String(b.name).toLowerCase()}</div>
                    <div style={page.meta}>
                      blocked {new Date(b.blocked_at).toLocaleDateString()}
                    </div>
                  </div>
                  <button
                    className="rd-btn-ghost"
                    style={page.unblockBtn}
                    onClick={() => handleUnblock(b.id)}
                  >
                    unblock
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

const page = {
  topbar: {
    position: 'sticky',
    top: 0,
    zIndex: 50,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0.9rem 1rem',
    background: 'rgba(0,0,0,0.55)',
    backdropFilter: 'blur(6px)',
    borderBottom: '1px solid rgba(255,26,138,0.18)',
  },
  statusPill: {},
  column: {
    position: 'relative',
    zIndex: 10,
    maxWidth: 460,
    margin: '0 auto',
    padding: '2rem 1.5rem 5rem',
  },
  title: {
    fontSize: 'clamp(2.6rem, 10vw, 4rem)',
    transform: 'rotate(-3deg)',
    display: 'inline-block',
    marginBottom: '2rem',
    lineHeight: 1,
  },
  section: {},
  sectionHeader: {
    fontFamily: 'var(--font-mono-accent), monospace',
    fontSize: '0.78rem',
    letterSpacing: '0.3em',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.65)',
    marginBottom: '1rem',
  },
  muted: {
    fontFamily: 'var(--font-mono-accent), monospace',
    fontSize: '0.72rem',
    letterSpacing: '0.22em',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.45)',
    padding: '0.5rem 0',
  },
  list: { listStyle: 'none', margin: 0, padding: 0 },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.8rem',
    padding: '0.8rem 0',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 2,
    objectFit: 'cover',
    border: '1px solid rgba(255,26,138,0.4)',
  },
  name: {
    fontFamily: 'var(--font-mono-accent), monospace',
    fontSize: '0.85rem',
    letterSpacing: '0.2em',
    textTransform: 'uppercase',
    color: '#fff',
  },
  meta: {
    fontFamily: 'var(--font-body-mono), monospace',
    fontSize: '0.72rem',
    color: 'rgba(255,255,255,0.45)',
    marginTop: '0.15rem',
  },
  unblockBtn: { padding: '0.45rem 0.85rem', fontSize: '0.7rem' },
};
