'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getUserConversations } from '../../lib/api/chat';
import { supabase } from '../../lib/supabaseClient';
import GraffitiWall from '../components/GraffitiWall';

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const diffDays = Math.floor((now - d) / (1000 * 60 * 60 * 24));
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function ChatInboxPage() {
  const router = useRouter();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const uid = localStorage.getItem('user_profile_id');
    if (!uid) {
      router.push('/signin');
      return;
    }

    const load = async () => {
      try {
        const data = await getUserConversations(uid);
        setConversations(data);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    load();

    const channel = supabase
      .channel(`inbox:${uid}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const m = payload.new;
          if (m.from_user_id === uid || m.to_user_id === uid) {
            getUserConversations(uid).then(setConversations).catch(() => {});
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'matches' },
        (payload) => {
          const m = payload.new;
          if (m.user_a_id === uid || m.user_b_id === uid) {
            getUserConversations(uid).then(setConversations).catch(() => {});
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);

  return (
    <div className="rd-screen scrollable">
      <GraffitiWall ambientLaser />

      {/* TOP BAR */}
      <div style={topBar.wrap}>
        <button
          className="rd-nav-chip"
          onClick={() => router.push('/matches')}
          style={{ pointerEvents: 'auto' }}
        >
          ◄ BACK
        </button>
        <div className="rd-status-pill" style={{ pointerEvents: 'auto' }}>
          <span className="rd-status-dot" />
          INBOX ▸ LIVE
        </div>
      </div>

      <div style={layout.container}>
        {/* HEADER */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 className="rd-neon-title" style={layout.title}>messages</h1>
          <div className="font-mono-accent" style={layout.subtitle}>
            ▸ your matched ravers
          </div>
        </div>

        {/* LOADING */}
        {loading && (
          <div style={list.wrap}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} style={skel.row}>
                <div style={skel.avatar} />
                <div style={{ flex: 1 }}>
                  <div style={{ ...skel.line, width: '40%' }} />
                  <div style={{ ...skel.line, width: '70%', marginTop: '0.4rem' }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ERROR */}
        {error && <div className="rd-banner rd-banner--error">▸ {error}</div>}

        {/* EMPTY */}
        {!loading && !error && conversations.length === 0 && (
          <div style={empty.wrap}>
            <div style={empty.glyph}>◌</div>
            <div className="font-mono-accent" style={empty.title}>
              no signals yet
            </div>
            <div className="font-mono-accent" style={empty.sub}>
              swipe right · mutual likes drop in here
            </div>
            <div className="rd-btn-wrap" style={{ marginTop: '1.6rem' }}>
              <button className="rd-btn-neon" onClick={() => router.push('/matches')}>
                START SWIPING
              </button>
            </div>
          </div>
        )}

        {/* LIST */}
        {!loading && !error && conversations.length > 0 && (
          <div style={list.wrap}>
            {conversations.map((c) => {
              const unread = c.unread_count > 0;
              return (
                <button
                  key={c.match_id}
                  onClick={() => router.push(`/chat/thread?user=${c.other_user_id}`)}
                  style={{
                    ...list.row,
                    ...(unread ? list.rowUnread : null),
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--rd-spray-pink)';
                    e.currentTarget.style.boxShadow = '0 0 14px rgba(255,26,138,0.18)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = unread
                      ? 'var(--rd-spray-pink)'
                      : 'rgba(255,255,255,0.12)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <div style={list.avatarWrap}>
                    {c.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.photo} alt={c.name} style={list.avatar} />
                    ) : (
                      <div style={{ ...list.avatar, ...list.avatarFallback }}>
                        {c.name?.[0]?.toUpperCase() || '?'}
                      </div>
                    )}
                    {unread && <span style={list.badge}>{c.unread_count}</span>}
                  </div>

                  <div style={list.body}>
                    <div style={list.headerRow}>
                      <span style={list.name}>
                        {String(c.name || '').toLowerCase()}
                        {(c.role === 'founder' || c.role === 'co-founder') && (
                          <span style={list.roleChip}>{c.role}</span>
                        )}
                      </span>
                      <span style={list.time}>{formatTime(c.last_message_at)}</span>
                    </div>
                    <div style={{ ...list.preview, ...(unread ? list.previewUnread : null) }}>
                      {c.last_message
                        ? `${c.last_message_from_me ? '› ' : ''}${c.last_message}`
                        : '▸ matched — say something'}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const topBar = {
  wrap: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1.1rem 1.25rem',
    pointerEvents: 'none',
  },
};

const layout = {
  container: {
    position: 'relative',
    zIndex: 10,
    maxWidth: '520px',
    margin: '0 auto',
    padding: '5.5rem 1.25rem 4rem',
  },
  title: {
    fontSize: 'clamp(2.4rem, 9vw, 3.6rem)',
    transform: 'rotate(-3deg)',
    display: 'inline-block',
    lineHeight: 1,
    marginBottom: '0.6rem',
  },
  subtitle: {
    fontSize: '0.7rem',
    letterSpacing: '0.32em',
    color: 'rgba(255,255,255,0.5)',
    textTransform: 'uppercase',
  },
};

const list = {
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.55rem',
  },
  row: {
    display: 'flex',
    gap: '0.85rem',
    alignItems: 'center',
    padding: '0.85rem',
    background: 'rgba(0,0,0,0.45)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '2px',
    cursor: 'pointer',
    width: '100%',
    textAlign: 'left',
    fontFamily: 'var(--font-body-mono), sans-serif',
    color: '#fff',
    transition: 'border-color 0.18s, box-shadow 0.18s',
  },
  rowUnread: {
    borderColor: 'var(--rd-spray-pink)',
    boxShadow: 'inset 0 0 12px rgba(255,26,138,0.12)',
  },
  avatarWrap: {
    position: 'relative',
    flexShrink: 0,
  },
  avatar: {
    width: '54px',
    height: '54px',
    borderRadius: '50%',
    objectFit: 'cover',
    border: '1px solid rgba(255,255,255,0.18)',
    display: 'block',
  },
  avatarFallback: {
    background: 'linear-gradient(135deg, var(--rd-spray-pink), var(--rd-rave-purple))',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'var(--font-graffiti), cursive',
    fontSize: '1.6rem',
  },
  badge: {
    position: 'absolute',
    top: '-4px',
    right: '-4px',
    minWidth: '20px',
    height: '20px',
    padding: '0 6px',
    borderRadius: '10px',
    background: 'var(--rd-spray-pink)',
    color: '#000',
    fontFamily: 'var(--font-mono-accent), sans-serif',
    fontSize: '0.65rem',
    fontWeight: 700,
    letterSpacing: '0.05em',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 0 10px var(--rd-spray-pink)',
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: '0.6rem',
  },
  name: {
    fontFamily: 'var(--font-mono-accent), sans-serif',
    fontSize: '0.85rem',
    letterSpacing: '0.18em',
    color: '#fff',
    textTransform: 'uppercase',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: 1,
    minWidth: 0,
  },
  roleChip: {
    marginLeft: '0.5rem',
    fontFamily: 'var(--font-mono-accent), sans-serif',
    fontSize: '0.55rem',
    letterSpacing: '0.2em',
    color: 'var(--rd-spray-yellow)',
    border: '1px solid rgba(255,233,0,0.45)',
    padding: '0.15rem 0.4rem',
    borderRadius: '2px',
    textTransform: 'uppercase',
  },
  time: {
    flexShrink: 0,
    fontFamily: 'var(--font-mono-accent), sans-serif',
    fontSize: '0.6rem',
    letterSpacing: '0.16em',
    color: 'rgba(255,255,255,0.4)',
    textTransform: 'uppercase',
  },
  preview: {
    marginTop: '0.3rem',
    fontFamily: 'var(--font-body-mono), sans-serif',
    fontSize: '0.78rem',
    color: 'rgba(255,255,255,0.55)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  previewUnread: {
    color: '#fff',
  },
};

const skel = {
  row: {
    display: 'flex',
    gap: '0.85rem',
    padding: '0.85rem',
    background: 'rgba(0,0,0,0.4)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '2px',
  },
  avatar: {
    width: '54px',
    height: '54px',
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.08)',
  },
  line: {
    height: '0.8rem',
    background: 'rgba(255,255,255,0.08)',
    borderRadius: '2px',
  },
};

const empty = {
  wrap: {
    textAlign: 'center',
    padding: '3rem 1rem',
    border: '1px dashed rgba(255,255,255,0.18)',
    background: 'rgba(0,0,0,0.35)',
    borderRadius: '2px',
  },
  glyph: {
    fontFamily: 'var(--font-graffiti), cursive',
    fontSize: '3.5rem',
    color: 'var(--rd-spray-pink)',
    textShadow: '0 0 18px rgba(255,26,138,0.6)',
    marginBottom: '0.8rem',
    lineHeight: 1,
  },
  title: {
    fontSize: '0.9rem',
    letterSpacing: '0.28em',
    color: '#fff',
    textTransform: 'uppercase',
    marginBottom: '0.5rem',
  },
  sub: {
    fontSize: '0.65rem',
    letterSpacing: '0.26em',
    color: 'rgba(255,255,255,0.45)',
    textTransform: 'uppercase',
  },
};
