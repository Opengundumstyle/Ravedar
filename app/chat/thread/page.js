'use client';

import { useEffect, useRef, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  getConversation,
  sendMessage,
  markMessagesAsRead,
  getMatchBetween,
  getProfileForChat,
} from '../../../lib/api/chat';
import { supabase } from '../../../lib/supabaseClient';
import GraffitiWall from '../../components/GraffitiWall';
import OverflowMenu from '../../components/OverflowMenu';
import ReportModal from '../../components/ReportModal';
import EndConnectionModal from '../../components/EndConnectionModal';

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatDayDivider(iso) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'today';
  const yest = new Date(now);
  yest.setDate(yest.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return 'yesterday';
  return d
    .toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
    .toLowerCase();
}

function ChatThreadInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const otherUserId = searchParams.get('user');

  const [myId, setMyId] = useState(null);
  const [otherProfile, setOtherProfile] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notMatched, setNotMatched] = useState(false);
  const [matchId, setMatchId] = useState(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [endConnectionMode, setEndConnectionMode] = useState(null);
  const [evicted, setEvicted] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const uid = localStorage.getItem('user_profile_id');
    if (!uid) {
      router.push('/signin');
      return;
    }
    if (uid === otherUserId) {
      router.push('/chat');
      return;
    }
    setMyId(uid);

    let channel;
    const load = async () => {
      try {
        const match = await getMatchBetween(uid, otherUserId);
        if (!match) {
          setNotMatched(true);
          setLoading(false);
          return;
        }
        setMatchId(match.id);
        const [profile, convo] = await Promise.all([
          getProfileForChat(otherUserId),
          getConversation(uid, otherUserId),
        ]);
        setOtherProfile(profile);
        setMessages(convo);
        setLoading(false);
        markMessagesAsRead(uid, otherUserId).catch(() => {});

        channel = supabase
          .channel(`thread:${[uid, otherUserId].sort().join(':')}`)
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'messages' },
            (payload) => {
              const m = payload.new;
              const inThread =
                (m.from_user_id === uid && m.to_user_id === otherUserId) ||
                (m.from_user_id === otherUserId && m.to_user_id === uid);
              if (!inThread) return;
              setMessages((prev) => {
                if (prev.some((p) => p.id === m.id)) return prev;
                return [...prev, m];
              });
              if (m.to_user_id === uid) {
                markMessagesAsRead(uid, otherUserId).catch(() => {});
              }
            }
          )
          .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'messages' },
            (payload) => {
              const m = payload.new;
              setMessages((prev) => prev.map((p) => (p.id === m.id ? { ...p, ...m } : p)));
            }
          )
          .on(
            'postgres_changes',
            { event: 'DELETE', schema: 'public', table: 'matches', filter: `id=eq.${match.id}` },
            () => {
              setEvicted(true);
              setTimeout(() => router.push('/chat'), 1500);
            }
          )
          .subscribe();
      } catch (e) {
        setError(e.message);
        setLoading(false);
      }
    };
    load();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [otherUserId, router]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  const handleSend = async (e) => {
    e?.preventDefault();
    const text = draft.trim();
    if (!text || sending || !myId) return;

    const optimistic = {
      id: `tmp-${Date.now()}`,
      from_user_id: myId,
      to_user_id: otherUserId,
      message: text,
      message_type: 'text',
      sent_at: new Date().toISOString(),
      read_at: null,
      _optimistic: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    setDraft('');
    setSending(true);

    try {
      const saved = await sendMessage(myId, otherUserId, text);
      setMessages((prev) => prev.map((m) => (m.id === optimistic.id ? saved : m)));
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setError(err.message);
      setDraft(text);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  // Not-matched lockout
  if (notMatched) {
    return (
      <div className="rd-screen">
        <GraffitiWall ambientLaser />
        <div style={lockout.wrap}>
          <div style={lockout.glyph}>✕</div>
          <h1 className="rd-neon-title" style={lockout.title}>
            no match
          </h1>
          <div className="font-mono-accent" style={lockout.sub}>
            both ravers must swipe right to drop in.
          </div>
          <div className="rd-btn-wrap" style={{ marginTop: '1.4rem' }}>
            <button className="rd-btn-neon" onClick={() => router.push('/chat')}>
              ◄ BACK TO MESSAGES
            </button>
          </div>
        </div>
      </div>
    );
  }

  let lastDay = null;

  return (
    <div style={page.wrap}>
      <GraffitiWall ambientLaser />

      {/* HEADER */}
      <header style={header.bar}>
        <button
          className="rd-nav-chip"
          onClick={() => router.push('/chat')}
          style={{ pointerEvents: 'auto' }}
        >
          ◄ BACK
        </button>

        <div style={header.identity}>
          {otherProfile?.photos?.[0]?.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={otherProfile.photos[0].image_url}
              alt={otherProfile?.name || 'user'}
              style={header.avatar}
            />
          ) : (
            <div style={{ ...header.avatar, ...header.avatarFallback }}>
              {otherProfile?.name?.[0]?.toUpperCase() || '?'}
            </div>
          )}
          <div style={{ minWidth: 0, textAlign: 'left' }}>
            <div style={header.name}>
              {String(otherProfile?.name || '···').toLowerCase()}
            </div>
            {otherProfile?.instagram && (
              <a
                href={`https://instagram.com/${otherProfile.instagram.replace(/^@/, '')}`}
                target="_blank"
                rel="noreferrer"
                style={header.handle}
              >
                @{otherProfile.instagram.replace(/^@/, '')}
              </a>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', pointerEvents: 'auto' }}>
          <div className="rd-bpm-tag">
            <span className="rd-bpm-dot" />
            LIVE
          </div>
          <OverflowMenu
            ariaLabel="chat actions"
            items={[
              { key: 'report',  label: 'report',  danger: true,  onSelect: () => setReportOpen(true) },
              { key: 'unmatch', label: 'unmatch', danger: false, onSelect: () => setEndConnectionMode('unmatch') },
              { key: 'block',   label: 'block',   danger: true,  onSelect: () => setEndConnectionMode('block') },
            ]}
          />
        </div>
      </header>

      {/* MESSAGES */}
      <div ref={scrollRef} style={msgs.scroll}>
        <div style={msgs.inner}>
          {loading && (
            <div style={msgs.loading} className="font-mono-accent">
              ▸ tuning in ···
            </div>
          )}
          {error && (
            <div className="rd-banner rd-banner--error" style={{ margin: '0 0.6rem' }}>
              ▸ {error}
            </div>
          )}
          {!loading && messages.length === 0 && (
            <div style={msgs.emptyWrap}>
              <div style={msgs.emptyGlyph}>♥</div>
              <div className="font-mono-accent" style={msgs.emptyTitle}>
                you matched with{' '}
                <span style={{ color: 'var(--rd-spray-pink)' }}>
                  {String(otherProfile?.name || '').toLowerCase()}
                </span>
              </div>
              <div className="font-mono-accent" style={msgs.emptySub}>
                ▸ drop the first message
              </div>
            </div>
          )}

          {messages.map((m) => {
            const mine = m.from_user_id === myId;
            const day = formatDayDivider(m.sent_at);
            const showDay = day !== lastDay;
            lastDay = day;
            return (
              <div key={m.id}>
                {showDay && (
                  <div style={msgs.dayDivider} className="font-mono-accent">
                    ─── {day} ───
                  </div>
                )}
                <div style={{ ...msgs.row, justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                  <div
                    style={{
                      ...msgs.bubble,
                      ...(mine ? msgs.bubbleMine : msgs.bubbleTheirs),
                      ...(m._optimistic ? { opacity: 0.6 } : null),
                    }}
                  >
                    <div style={msgs.bubbleText}>{m.message}</div>
                    <div
                      style={{
                        ...msgs.meta,
                        color: mine ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.45)',
                      }}
                    >
                      {formatTime(m.sent_at)}
                      {mine && m.read_at && <span style={{ marginLeft: '0.4rem' }}>· read</span>}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* COMPOSER */}
      <form onSubmit={handleSend} style={composer.wrap}>
        <div style={composer.inner}>
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="type a message ···"
            rows={1}
            maxLength={2000}
            className="rd-input"
            style={composer.textarea}
          />
          <button
            type="submit"
            disabled={!draft.trim() || sending}
            style={{
              ...composer.send,
              opacity: !draft.trim() || sending ? 0.4 : 1,
              cursor: !draft.trim() || sending ? 'not-allowed' : 'pointer',
            }}
            aria-label="send"
          >
            ▸
          </button>
        </div>
      </form>

      {evicted && (
        <div style={{ position: 'absolute', top: 80, left: 0, right: 0, zIndex: 50, padding: '0 1rem' }}>
          <div className="rd-banner">▸ this conversation ended.</div>
        </div>
      )}

      {reportOpen && (
        <ReportModal
          currentUserId={myId}
          reportedUserId={otherUserId}
          reportedUserName={otherProfile?.name}
          context="chat"
          matchId={matchId}
          onClose={() => setReportOpen(false)}
          onDone={({ blocked }) => {
            setReportOpen(false);
            if (blocked) router.push('/chat');
          }}
        />
      )}

      {endConnectionMode && (
        <EndConnectionModal
          mode={endConnectionMode}
          currentUserId={myId}
          otherUserId={otherUserId}
          otherUserName={otherProfile?.name}
          onClose={() => setEndConnectionMode(null)}
          onDone={() => {
            setEndConnectionMode(null);
            router.push('/chat');
          }}
        />
      )}
    </div>
  );
}

const page = {
  wrap: {
    position: 'fixed',
    inset: 0,
    background: '#000',
    color: '#fff',
    fontFamily: 'var(--font-body-mono), monospace',
    display: 'flex',
    flexDirection: 'column',
    isolation: 'isolate',
    overflow: 'hidden',
  },
};

const header = {
  bar: {
    position: 'relative',
    zIndex: 10,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '0.7rem',
    padding: '0.9rem 1rem',
    background: 'rgba(0,0,0,0.7)',
    backdropFilter: 'blur(8px)',
    borderBottom: '1px solid rgba(255,26,138,0.25)',
    boxShadow: '0 4px 22px rgba(0,0,0,0.45)',
  },
  identity: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '0.6rem',
  },
  avatar: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    objectFit: 'cover',
    border: '1px solid var(--rd-spray-pink)',
    boxShadow: '0 0 10px rgba(255,26,138,0.4)',
    flexShrink: 0,
    display: 'block',
  },
  avatarFallback: {
    background: 'linear-gradient(135deg, var(--rd-spray-pink), var(--rd-rave-purple))',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: 'var(--font-graffiti), cursive',
    fontSize: '1.2rem',
    color: '#fff',
  },
  name: {
    fontFamily: 'var(--font-mono-accent), monospace',
    fontSize: '0.85rem',
    letterSpacing: '0.2em',
    color: '#fff',
    textTransform: 'uppercase',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  handle: {
    display: 'block',
    fontFamily: 'var(--font-mono-accent), monospace',
    fontSize: '0.62rem',
    letterSpacing: '0.16em',
    color: 'var(--rd-spray-yellow)',
    textDecoration: 'none',
    marginTop: '0.15rem',
  },
};

const msgs = {
  scroll: {
    position: 'relative',
    zIndex: 5,
    flex: 1,
    overflowY: 'auto',
    padding: '1rem 0',
  },
  inner: {
    maxWidth: '640px',
    margin: '0 auto',
    padding: '0 1rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.4rem',
  },
  loading: {
    textAlign: 'center',
    fontSize: '0.72rem',
    letterSpacing: '0.32em',
    color: 'rgba(255,255,255,0.4)',
    padding: '2.5rem 0',
    textTransform: 'uppercase',
  },
  emptyWrap: {
    textAlign: 'center',
    padding: '3rem 1rem',
  },
  emptyGlyph: {
    fontFamily: 'var(--font-graffiti), cursive',
    fontSize: '3.5rem',
    color: 'var(--rd-spray-pink)',
    textShadow: '0 0 22px rgba(255,26,138,0.7)',
    marginBottom: '0.8rem',
    lineHeight: 1,
  },
  emptyTitle: {
    fontSize: '0.85rem',
    letterSpacing: '0.24em',
    color: '#fff',
    textTransform: 'uppercase',
    marginBottom: '0.4rem',
  },
  emptySub: {
    fontSize: '0.65rem',
    letterSpacing: '0.28em',
    color: 'rgba(255,255,255,0.45)',
    textTransform: 'uppercase',
  },
  dayDivider: {
    textAlign: 'center',
    fontSize: '0.6rem',
    letterSpacing: '0.32em',
    color: 'rgba(255,255,255,0.3)',
    textTransform: 'uppercase',
    padding: '1rem 0 0.5rem',
  },
  row: {
    display: 'flex',
    width: '100%',
  },
  bubble: {
    maxWidth: '76%',
    padding: '0.55rem 0.85rem',
    borderRadius: '2px',
    fontSize: '0.92rem',
    lineHeight: 1.4,
    wordBreak: 'break-word',
    border: '1px solid',
  },
  bubbleMine: {
    background: 'var(--rd-spray-pink)',
    borderColor: 'var(--rd-spray-pink)',
    color: '#000',
    boxShadow: '0 0 14px rgba(255,26,138,0.45)',
    fontFamily: 'var(--font-body-mono), monospace',
  },
  bubbleTheirs: {
    background: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.18)',
    color: '#fff',
    fontFamily: 'var(--font-body-mono), monospace',
  },
  bubbleText: {
    whiteSpace: 'pre-wrap',
  },
  meta: {
    marginTop: '0.25rem',
    fontFamily: 'var(--font-mono-accent), monospace',
    fontSize: '0.55rem',
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    textAlign: 'right',
  },
};

const composer = {
  wrap: {
    position: 'relative',
    zIndex: 10,
    flexShrink: 0,
    padding: '0.7rem 0.9rem 1rem',
    background: 'rgba(0,0,0,0.75)',
    backdropFilter: 'blur(8px)',
    borderTop: '1px solid rgba(255,26,138,0.25)',
  },
  inner: {
    maxWidth: '640px',
    margin: '0 auto',
    display: 'flex',
    alignItems: 'flex-end',
    gap: '0.5rem',
  },
  textarea: {
    flex: 1,
    minHeight: '44px',
    maxHeight: '120px',
    resize: 'none',
    padding: '0.7rem 0.9rem',
    fontFamily: 'var(--font-body-mono), monospace',
    fontSize: '0.92rem',
  },
  send: {
    flexShrink: 0,
    width: '46px',
    height: '46px',
    border: '1px solid var(--rd-spray-cyan)',
    background: 'rgba(0,0,0,0.7)',
    color: 'var(--rd-spray-cyan)',
    fontFamily: 'var(--font-mono-accent), monospace',
    fontSize: '1.3rem',
    borderRadius: '2px',
    boxShadow: '0 0 14px rgba(0,231,255,0.35), inset 0 0 8px rgba(0,231,255,0.15)',
    transition: 'transform 0.12s',
  },
};

const lockout = {
  wrap: {
    position: 'relative',
    zIndex: 10,
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2rem 1.5rem',
    textAlign: 'center',
  },
  glyph: {
    fontFamily: 'var(--font-graffiti), cursive',
    fontSize: '4rem',
    color: 'var(--rd-spray-pink)',
    textShadow: '0 0 22px rgba(255,26,138,0.7)',
    marginBottom: '0.6rem',
    lineHeight: 1,
  },
  title: {
    fontSize: 'clamp(2.4rem, 9vw, 3.6rem)',
    transform: 'rotate(-3deg)',
    display: 'inline-block',
    lineHeight: 1,
    marginBottom: '0.8rem',
  },
  sub: {
    fontSize: '0.72rem',
    letterSpacing: '0.32em',
    color: 'rgba(255,255,255,0.55)',
    textTransform: 'uppercase',
    maxWidth: '320px',
  },
};

export default function ChatThreadPage() {
  return (
    <Suspense fallback={null}>
      <ChatThreadInner />
    </Suspense>
  );
}
