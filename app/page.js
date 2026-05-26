'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '../lib/supabaseClient';
import { createUserEvent } from '../lib/api/matches';
import { ensureUserId } from '../lib/ensureUserId';
import GraffitiWall from './components/GraffitiWall';
import { useAuth } from './components/AuthContext';
import GhostChip from './components/GhostChip';

const HERO_PHRASES = [
  { type: 'small', text: 'connect through experience with' },
  { type: 'tag',   text: 'RAVEDAR' },
  { type: 'small', text: 'find your rave match' },
];

export default function HomePage() {
  const [eventName, setEventName] = useState('');
  const [eventSuggestions, setEventSuggestions] = useState([]);
  const [city, setCity] = useState('');
  const [citySuggestions, setCitySuggestions] = useState([]);
  const [date, setDate] = useState('');
  const [error, setError] = useState('');
  const [eventInputFocused, setEventInputFocused] = useState(false);
  const [cityInputFocused, setCityInputFocused] = useState(false);
  const [happeningSoonCity, setHappeningSoonCity] = useState('');
  const [selectedSuggestion, setSelectedSuggestion] = useState(null);

  const [phraseIdx, setPhraseIdx] = useState(0);
  const [scanState, setScanState] = useState(null); // null | { status, sub }

  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const searchParams = useSearchParams();

  // ---------------- Pre-fill from query params ----------------
  useEffect(() => {
    if (!searchParams) return;
    const e = searchParams.get('event');
    const c = searchParams.get('city');
    const d = searchParams.get('date');
    if (!e && !c && !d) return; // nothing to seed

    if (e) setEventName(e);
    if (c) setCity(c);
    if (d) setDate(d);

    // Strip the params so refresh doesn't re-seed and overwrite user edits.
    router.replace('/');
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------- Hero cycling ----------------
  useEffect(() => {
    const id = setInterval(() => {
      setPhraseIdx((i) => (i + 1) % HERO_PHRASES.length);
    }, 3000);
    return () => clearInterval(id);
  }, []);

  // ---------------- Event / DJ autocomplete (Supabase) ----------------
  useEffect(() => {
    const fetchSuggestions = async () => {
      if (!eventName.trim()) {
        setEventSuggestions([]);
        return;
      }
      const searchName = eventName.trim().toLowerCase();
      const { data: eventData } = await supabase
        .from('events')
        .select('id, name')
        .ilike('name', `%${searchName}%`)
        .not('name', 'ilike', '%unnamed event%')
        .limit(5);
      const { data: artistData } = await supabase
        .from('artists')
        .select('id, name')
        .ilike('name', `%${searchName}%`)
        .limit(5);

      const seen = new Set();
      const uniqueEvents = [];
      (eventData || []).forEach((e) => {
        if (!seen.has(e.name)) {
          seen.add(e.name);
          uniqueEvents.push({ type: 'event', id: e.id, name: e.name });
        }
      });
      setEventSuggestions([
        ...uniqueEvents,
        ...(artistData || []).map((a) => ({ type: 'artist', id: a.id, name: a.name })),
      ]);
    };
    fetchSuggestions();
  }, [eventName]);

  // ---------------- City autocomplete + happening-soon ----------------
  useEffect(() => {
    const fetchCitySuggestions = async () => {
      if (!eventName.trim()) {
        setCitySuggestions([]);
        setHappeningSoonCity('');
        return;
      }
      let soonestCity = '';
      let allCities = [];

      if (selectedSuggestion) {
        if (selectedSuggestion.type === 'event') {
          const { data: eventRows } = await supabase
            .from('events')
            .select('city, date')
            .ilike('name', `%${selectedSuggestion.name}%`)
            .order('date', { ascending: true });
          if (eventRows && eventRows.length > 0) {
            soonestCity = eventRows[0].city;
            allCities = eventRows.map((e) => e.city);
          }
        } else if (selectedSuggestion.type === 'artist') {
          const { data: artistEventRows } = await supabase
            .from('event_artists')
            .select('event_id')
            .eq('artist_id', selectedSuggestion.id)
            .limit(100);
          const eventIds = (artistEventRows || []).map((ea) => ea.event_id);
          if (eventIds.length > 0) {
            const { data: eventsByArtist } = await supabase
              .from('events')
              .select('city, date')
              .in('id', eventIds)
              .order('date', { ascending: true })
              .limit(1);
            if (eventsByArtist && eventsByArtist.length > 0) {
              soonestCity = eventsByArtist[0].city;
            }
            const { data: allArtistCities } = await supabase
              .from('events')
              .select('city')
              .in('id', eventIds);
            if (allArtistCities) allCities = allArtistCities.map((e) => e.city);
          }
        }
      } else {
        const searchName = eventName.trim().toLowerCase();
        const { data: eventCities } = await supabase
          .from('events')
          .select('city, date')
          .ilike('name', `%${searchName}%`)
          .order('date', { ascending: true })
          .limit(1);
        if (eventCities && eventCities.length > 0) soonestCity = eventCities[0].city;
        const { data: allEventCities } = await supabase
          .from('events')
          .select('city')
          .ilike('name', `%${searchName}%`);
        if (allEventCities) allCities = allEventCities.map((e) => e.city);
      }

      allCities = [...new Set(allCities)];
      let filtered = allCities;
      if (city.trim()) {
        filtered = allCities.filter((c) =>
          c.toLowerCase().includes(city.trim().toLowerCase())
        );
      }
      if (allCities.length > 1) {
        filtered = filtered.filter((c) => c !== soonestCity);
      }
      setCitySuggestions(filtered);
      setHappeningSoonCity(soonestCity);
    };
    fetchCitySuggestions();
  }, [eventName, city, selectedSuggestion]);

  // ---------------- Submit ----------------
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!eventName.trim() || !city.trim()) {
      setError('▸ both event and city are required.');
      return;
    }

    setScanState({
      status: `▸ scanning ${eventName}`,
      sub: (
        <>
          in <span className="rd-accent">{city.toUpperCase()}</span> · locking on signal
        </>
      ),
    });

    // Short scripted scan beats while createUserEvent runs in parallel.
    const navTimeout = setTimeout(async () => {
      try {
        const userId = await ensureUserId();
        const eventDate = date === '' ? null : date;
        const room = await createUserEvent(userId, eventName, city, eventDate);
        if (room?.id) localStorage.setItem('current_room_id', room.id);
        router.push('/matches');
      } catch (err) {
        console.error('createUserEvent failed:', err);
        setScanState(null);
        setError(`▸ ${err.message || 'unexpected error.'}`);
      }
    }, 2200);

    setTimeout(
      () =>
        setScanState({
          status: '▸ triangulating ···',
          sub: <>{Math.floor(Math.random() * 20) + 8} ravers within range</>,
        }),
      900
    );
    setTimeout(
      () =>
        setScanState({
          status: '▸ match pool ready',
          sub: <>dropping you in ···</>,
        }),
      1700
    );

    return () => clearTimeout(navTimeout);
  };

  // ---------------- Selecting suggestions ----------------
  const pickEvent = (s) => {
    setEventName(s.name);
    setSelectedSuggestion(s);
    setEventSuggestions([]);
  };
  const pickCity = (name) => {
    setCity(name);
    setCitySuggestions([]);
  };

  const heroNode = useMemo(
    () =>
      HERO_PHRASES.map((p, i) => {
        const active = i === phraseIdx ? ' is-active' : '';
        if (p.type === 'tag') {
          return (
            <div
              key={i}
              className={`rd-hero-phrase${active}`}
              style={hero.phrase}
            >
              <div className="rd-title-tag" style={hero.tag}>
                {p.text}
              </div>
            </div>
          );
        }
        return (
          <div key={i} className={`rd-hero-phrase${active}`} style={hero.phrase}>
            <div className="font-neon" style={hero.small}>
              {p.text}
            </div>
          </div>
        );
      }),
    [phraseIdx]
  );

  return (
    <div className="rd-screen scrollable">
      <GraffitiWall radar />

      <div style={layout.container}>
        {/* HERO */}
        <div style={layout.hero}>
          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', justifyContent: 'center', marginBottom: '1.2rem', flexWrap: 'wrap' }}>
            <div className="rd-status-pill" style={{ margin: 0 }}>
              <span className="rd-status-dot" />
              RAVEDAR ▸ ONLINE
            </div>
            {!isAuthenticated && <GhostChip />}
          </div>
          <div style={layout.heroTagline}>{heroNode}</div>
        </div>

        {/* FORM */}
        <form onSubmit={handleSubmit}>
          {/* EVENT / DJ */}
          <div className="rd-field">
            <label className="rd-field-label">
              <span className="rd-field-num">01</span>
              <span className="rd-field-arrow">▸</span>
              EVENT or DJ
            </label>
            <input
              type="text"
              className="rd-input"
              value={eventName}
              onChange={(e) => {
                setEventName(e.target.value);
                setSelectedSuggestion(null);
              }}
              onFocus={() => setEventInputFocused(true)}
              onBlur={() => setTimeout(() => setEventInputFocused(false), 180)}
              placeholder="EDC · TOMORROWLAND · SKRILLEX ..."
              autoComplete="off"
              required
            />
            {eventInputFocused && eventSuggestions.length > 0 && (
              <div className="rd-dropdown">
                <div className="rd-dropdown-header">▸ results</div>
                {eventSuggestions.map((s) => (
                  <button
                    type="button"
                    key={`${s.type}-${s.id}`}
                    className="rd-dropdown-item"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      pickEvent(s);
                    }}
                  >
                    <span className={`rd-type-chip rd-type-chip--${s.type}`}>
                      {s.type}
                    </span>
                    <span>{s.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* CITY */}
          <div className="rd-field">
            <label className="rd-field-label">
              <span className="rd-field-num">02</span>
              <span className="rd-field-arrow">▸</span>
              CITY
            </label>
            {happeningSoonCity && (
              <div className="rd-hot-sticker">
                <span className="rd-arrow">▸</span>
                {happeningSoonCity.toLowerCase()}
              </div>
            )}
            <input
              type="text"
              className="rd-input"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              onFocus={() => setCityInputFocused(true)}
              onBlur={() => setTimeout(() => setCityInputFocused(false), 180)}
              placeholder="LAS VEGAS · MIAMI · AMSTERDAM ..."
              autoComplete="off"
              required
            />
            {cityInputFocused && (citySuggestions.length > 0 || happeningSoonCity) && (
              <div className="rd-dropdown">
                <div className="rd-dropdown-header">▸ cities</div>
                {happeningSoonCity && (
                  <button
                    type="button"
                    className="rd-dropdown-item"
                    style={{
                      background: 'rgba(255, 233, 0, 0.07)',
                      borderLeftColor: 'var(--rd-spray-yellow)',
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      pickCity(happeningSoonCity);
                    }}
                  >
                    <span className="rd-type-chip rd-type-chip--city">hot</span>
                    <span>{happeningSoonCity}</span>
                  </button>
                )}
                {citySuggestions.map((c) => (
                  <button
                    type="button"
                    key={c}
                    className="rd-dropdown-item"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      pickCity(c);
                    }}
                  >
                    <span className="rd-type-chip rd-type-chip--city">city</span>
                    <span>{c}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* DATE */}
          <div className="rd-field">
            <label className="rd-field-label">
              <span className="rd-field-num">03</span>
              <span className="rd-field-arrow">▸</span>
              DATE <span className="rd-field-opt">(opt.)</span>
            </label>
            <input
              type="date"
              className="rd-input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          {error && <div className="rd-banner rd-banner--error">{error}</div>}

          <div className="rd-btn-wrap rd-btn-wrap--pulse" style={{ marginTop: '2rem' }}>
            <button type="submit" className="rd-btn-neon">
              DEPLOY RADAR
            </button>
          </div>

          <button
            type="button"
            onClick={() => router.push('/signin')}
            className="rd-stencil-link"
            style={{ display: 'block', margin: '1.2rem auto', background: 'none', border: 'none' }}
          >
            got an account? <span className="rd-arrow">▸</span> SIGN IN
          </button>
        </form>

        {/* FOOTER */}
        <div style={{ textAlign: 'center', marginTop: '3rem' }}>
          <div
            className="font-mono-accent"
            style={{
              fontSize: '0.72rem',
              letterSpacing: '0.32em',
              color: 'rgba(255,255,255,0.45)',
              marginBottom: '1.5rem',
              textTransform: 'uppercase',
            }}
          >
            connect with fellow ravers who share your vibe
          </div>
          <div className="rd-socials" style={{ marginBottom: '1.4rem' }}>
            <a
              className="rd-social"
              href="https://instagram.com/ravedar.app"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Instagram"
            >
              <svg fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
              </svg>
            </a>
            <a
              className="rd-social"
              href="https://discord.gg/R3VYAUzWwd"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Discord"
            >
              <svg fill="currentColor" viewBox="0 0 24 24">
                <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419-.019 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1568 2.4189Z" />
              </svg>
            </a>
            <span className="rd-social is-disabled" aria-label="TikTok coming soon">
              <svg fill="currentColor" viewBox="0 0 24 24">
                <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
              </svg>
            </span>
            <span className="rd-social is-disabled" aria-label="Facebook coming soon">
              <svg fill="currentColor" viewBox="0 0 24 24">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
            </span>
          </div>
          <div
            className="font-mono-accent"
            style={{
              fontSize: '0.6rem',
              letterSpacing: '0.4em',
              color: 'rgba(255,255,255,0.25)',
            }}
          >
            © RAVEDAR · MMXXVI
          </div>
        </div>
      </div>

      {/* SCAN OVERLAY */}
      <div className={`rd-scan-overlay${scanState ? ' is-open' : ''}`}>
        <div className="rd-scan-radar">
          <div className="rd-ring" />
          <div className="rd-ring rd-ring--r2" />
          <div className="rd-ring rd-ring--r3" />
          <div className="rd-ring rd-ring--r4" />
          <div className="rd-scan-sweep" />
          <div
            className="rd-scan-blip"
            style={{ top: '30%', left: '38%', animationDelay: '0.4s' }}
          />
          <div
            className="rd-scan-blip"
            style={{
              top: '55%',
              left: '65%',
              animationDelay: '0.8s',
              background: 'var(--rd-spray-yellow)',
              boxShadow: '0 0 12px var(--rd-spray-yellow)',
            }}
          />
          <div
            className="rd-scan-blip"
            style={{ top: '68%', left: '32%', animationDelay: '1.2s' }}
          />
          <div
            className="rd-scan-blip"
            style={{
              top: '38%',
              left: '70%',
              animationDelay: '1.5s',
              background: 'var(--rd-spray-green)',
              boxShadow: '0 0 12px var(--rd-spray-green)',
            }}
          />
        </div>
        <div className="rd-scan-status">{scanState?.status}</div>
        <div className="rd-scan-substatus">{scanState?.sub}</div>
      </div>

      {/* Hero phrase transition (scoped style) */}
      <style>{`
        .rd-hero-phrase {
          position: absolute;
          opacity: 0;
          transform: translateY(8px);
          transition: opacity 0.6s ease, transform 0.6s ease;
          width: 100%;
          text-align: center;
        }
        .rd-hero-phrase.is-active {
          opacity: 1;
          transform: translateY(0);
        }
        .rd-accent { color: var(--rd-spray-pink); }
      `}</style>
    </div>
  );
}

// inline style constants
const layout = {
  container: {
    position: 'relative',
    zIndex: 10,
    maxWidth: '460px',
    margin: '0 auto',
    padding: '2.5rem 1.5rem 5rem',
  },
  hero: {
    textAlign: 'center',
    marginBottom: '2.5rem',
    minHeight: '200px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  heroTagline: {
    height: '5.5rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    width: '100%',
  },
};

const hero = {
  phrase: {},
  small: {
    fontSize: '0.92rem',
    letterSpacing: '0.32em',
    color: 'rgba(255, 255, 255, 0.75)',
    textTransform: 'uppercase',
    textShadow: '0 0 12px rgba(255, 255, 255, 0.18)',
  },
  tag: {
    fontSize: 'clamp(3rem, 11vw, 4.8rem)',
    transform: 'rotate(-3deg)',
    display: 'inline-block',
    lineHeight: 1,
  },
};
