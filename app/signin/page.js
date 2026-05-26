'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../components/AuthContext';
import GraffitiWall from '../components/GraffitiWall';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';

const SCENE_AUTO_ADVANCE_MS = 2800;
const EXPLODE_TO_RAVE_MS = 750;

export default function SignInPage() {
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();

  const [phase, setPhase] = useState('wall'); // 'wall' | 'exploding' | 'raving'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const advancedRef = useRef(false);

  // Already logged in → bounce
  useEffect(() => {
    if (isAuthenticated && user) router.push('/matches');
  }, [isAuthenticated, user, router]);

  // Auto-advance: wall → explode → rave
  useEffect(() => {
    if (phase !== 'wall') return;
    const id = setTimeout(() => {
      if (!advancedRef.current) advanceToRave();
    }, SCENE_AUTO_ADVANCE_MS);
    return () => clearTimeout(id);
  }, [phase]);

  const advanceToRave = () => {
    if (advancedRef.current) return;
    advancedRef.current = true;
    setPhase('exploding');
    setTimeout(() => setPhase('raving'), EXPLODE_TO_RAVE_MS);
  };

  // ---------------- Auth ----------------
  const handleSignIn = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (authError) throw authError;

      if (data.user) {
        localStorage.setItem('user_profile_id', data.user.id);
        localStorage.removeItem('user_section_id');
        localStorage.removeItem('user_event_data');
        localStorage.removeItem('current_room_id');
        setSuccess('▸ signed in. dropping you in ···');
        setTimeout(() => router.push('/matches'), 1100);
      }
    } catch (err) {
      console.error('Sign in error:', err);
      setError(err.message || 'failed to sign in.');
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      const isNative = Capacitor.isNativePlatform();
      const redirectTo = isNative
        ? 'ravematch://oauth/callback'
        : `${window.location.origin}/oauth/callback`;

      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, skipBrowserRedirect: isNative },
      });
      if (oauthError) throw oauthError;

      if (isNative && data?.url) {
        await Browser.open({ url: data.url });
      }
    } catch (err) {
      console.error('Google sign in error:', err);
      setError(err.message || 'failed to sign in with google.');
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setError('▸ enter your email first.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const isNative = Capacitor.isNativePlatform();
      const redirectTo = isNative
        ? 'ravematch://oauth/callback'
        : `${window.location.origin}/oauth/callback`;

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
      });
      if (resetError) throw resetError;
      setSuccess('▸ reset email sent. check your inbox.');
    } catch (err) {
      console.error('Reset error:', err);
      setError(err.message || 'failed to send reset email.');
    } finally {
      setLoading(false);
    }
  };

  const stageClass = [
    'rd-login-stage',
    phase === 'exploding' || phase === 'raving' ? 'is-exploding' : '',
    phase === 'raving' ? 'is-raving' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={stageClass}
      onClick={() => {
        if (phase === 'wall') advanceToRave();
      }}
    >
      <GraffitiWall />

      {/* ACT I — graffiti tag + drips */}
      <div className="rd-graffiti" aria-hidden={phase !== 'wall'}>
        <div className="rd-tag-main" aria-label="RAVEDAR">
          <span>R</span>
          <span>A</span>
          <span>V</span>
          <span>E</span>
          <span>D</span>
          <span>A</span>
          <span>R</span>
        </div>
        <div className="rd-tag-sub">— sign in —</div>
      </div>

      <div className="rd-drips" aria-hidden="true">
        <div className="rd-drip" style={{ left: '6%',  width: '4px', animationDelay: '1.65s', '--h': '70px' }} />
        <div className="rd-drip" style={{ left: '17%', width: '6px', animationDelay: '1.85s', '--h': '105px' }} />
        <div className="rd-drip rd-drip--yellow" style={{ left: '26%', width: '4px', animationDelay: '2.05s', '--h': '60px' }} />
        <div className="rd-drip" style={{ left: '35%', width: '5px', animationDelay: '1.75s', '--h': '85px' }} />
        <div className="rd-drip" style={{ left: '47%', width: '7px', animationDelay: '1.95s', '--h': '130px' }} />
        <div className="rd-drip rd-drip--cyan" style={{ left: '58%', width: '4px', animationDelay: '2.15s', '--h': '75px' }} />
        <div className="rd-drip" style={{ left: '68%', width: '5px', animationDelay: '1.80s', '--h': '95px' }} />
        <div className="rd-drip rd-drip--yellow" style={{ left: '79%', width: '6px', animationDelay: '2.00s', '--h': '115px' }} />
        <div className="rd-drip" style={{ left: '90%', width: '4px', animationDelay: '2.20s', '--h': '65px' }} />
      </div>

      <div className="rd-tap-prompt">▼ TAP TO ENTER ▼</div>

      {/* INTERLUDE — explosion */}
      <div className="rd-splatters" aria-hidden="true">
        <div className="rd-splat rd-splat--pink" />
        <div className="rd-splat rd-splat--yellow" />
        <div className="rd-splat rd-splat--cyan" />
        <div className="rd-splat rd-splat--green" />
        <div className="rd-splat rd-splat--purple" />
        <div className="rd-splat rd-splat--magenta" />
      </div>
      <div className="rd-flash" />

      {/* ACT II — rave + form */}
      <div className="rd-rave">
        <div className="rd-rave-laser rd-rave-laser--l1" />
        <div className="rd-rave-laser rd-rave-laser--l2" />
        <div className="rd-rave-laser rd-rave-laser--l3" />
        <div className="rd-rave-laser rd-rave-laser--l4" />

        <Sparkles count={36} />

        <svg
          className="rd-crowd"
          viewBox="0 0 1200 300"
          preserveAspectRatio="xMidYMax slice"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="rd-crowd-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#000" stopOpacity="0" />
              <stop offset="35%" stopColor="#000" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#000" />
            </linearGradient>
          </defs>
          <path
            d="M0,300 L0,200
               Q20,180 35,195 Q55,170 75,190 Q95,160 120,185
               Q145,175 165,190 Q190,165 215,188 Q240,178 260,192
               Q285,168 310,190 Q335,180 360,194 Q385,170 410,188
               Q435,178 460,192 Q485,165 510,186 Q540,176 565,190
               Q590,168 615,188 Q640,180 665,193 Q690,170 715,188
               Q740,178 765,192 Q790,168 815,186 Q840,178 865,192
               Q890,170 915,190 Q940,180 965,194 Q990,170 1015,188
               Q1040,178 1065,192 Q1090,168 1115,186 Q1140,180 1165,192
               Q1185,180 1200,200 L1200,300 Z"
            fill="url(#rd-crowd-grad)"
          />
          <g fill="#000">
            <rect x="120"  y="100" width="6" height="100" transform="rotate(-8 123 150)" />
            <rect x="250"  y="80"  width="6" height="120" transform="rotate(6 253 140)" />
            <rect x="245"  y="90"  width="6" height="110" transform="rotate(-12 248 145)" />
            <rect x="430"  y="70"  width="6" height="130" transform="rotate(4 433 135)" />
            <rect x="560"  y="95"  width="6" height="105" transform="rotate(-10 563 147)" />
            <rect x="720"  y="75"  width="6" height="125" transform="rotate(8 723 137)" />
            <rect x="715"  y="85"  width="6" height="115" transform="rotate(-6 718 142)" />
            <rect x="880"  y="100" width="6" height="100" transform="rotate(10 883 150)" />
            <rect x="1010" y="80"  width="6" height="120" transform="rotate(-4 1013 140)" />
            <rect x="1130" y="95"  width="6" height="105" transform="rotate(14 1133 147)" />
          </g>
          <g>
            <rect x="335" y="160" width="6" height="10" fill="#00ffe6" opacity="0.7" />
            <rect x="640" y="155" width="6" height="10" fill="#ff0080" opacity="0.7" />
            <rect x="940" y="165" width="6" height="10" fill="#66ff00" opacity="0.7" />
          </g>
        </svg>

        <div className="rd-strobe" />

        {/* Form */}
        <form className="rd-login-form" onSubmit={handleSignIn}>
          <h1 className="rd-neon-title">RAVEDAR</h1>

          <div className="rd-field">
            <label className="rd-field-label">
              <span className="rd-field-num">01</span>
              <span className="rd-field-arrow">▸</span>
              EMAIL
            </label>
            <input
              type="email"
              className="rd-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@vibe.zone"
              autoComplete="email"
              required
            />
          </div>

          <div className="rd-field">
            <label className="rd-field-label">
              <span className="rd-field-num">02</span>
              <span className="rd-field-arrow">▸</span>
              PASSWORD
            </label>
            <input
              type="password"
              className="rd-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </div>

          <div style={{ textAlign: 'right', marginTop: '-0.6rem', marginBottom: '0.8rem' }}>
            <button
              type="button"
              onClick={handleForgotPassword}
              className="rd-stencil-link"
              style={{ background: 'none', border: 'none', padding: 0 }}
            >
              forgot? <span className="rd-arrow">▸</span> RESET
            </button>
          </div>

          {error && <div className="rd-banner rd-banner--error">{error}</div>}
          {success && <div className="rd-banner rd-banner--success">{success}</div>}

          <div className="rd-btn-wrap" style={{ marginTop: '1.2rem' }}>
            <button type="submit" className="rd-btn-neon" disabled={loading}>
              {loading ? 'SIGNING IN ···' : 'DROP IN'}
            </button>
          </div>

          <div style={dividerWrap}>
            <span style={dividerLine} />
            <span style={dividerLabel}>or continue with</span>
            <span style={dividerLine} />
          </div>

          <button
            type="button"
            onClick={handleGoogleSignIn}
            className="rd-btn-ghost"
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            GOOGLE
          </button>

          <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
            <span className="font-mono-accent" style={{ fontSize: '0.7rem', letterSpacing: '0.2em', color: 'rgba(255,255,255,0.4)' }}>
              new here?{' '}
            </span>
            <button
              type="button"
              onClick={() => router.push('/signup')}
              className="rd-stencil-link"
              style={{ background: 'none', border: 'none', padding: 0 }}
            >
              <span className="rd-arrow">▸</span> SIGN UP
            </button>
          </div>

          <div style={{ textAlign: 'center', marginTop: '0.8rem' }}>
            <button
              type="button"
              onClick={() => router.push('/')}
              className="rd-stencil-link"
              style={{ background: 'none', border: 'none', padding: 0 }}
            >
              ◄ BACK TO HOME
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Sparkles({ count = 36 }) {
  // Stable across re-renders within a single mount; positions seeded by index
  const sparkles = React.useMemo(() => {
    return Array.from({ length: count }, (_, i) => ({
      left: ((i * 73) % 100) + '%',
      top: ((i * 41) % 70) + '%',
      delay: ((i * 0.137) % 3).toFixed(2) + 's',
      duration: (1.8 + ((i * 0.21) % 2.5)).toFixed(2) + 's',
    }));
  }, [count]);
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 4 }}>
      {sparkles.map((s, i) => (
        <div
          key={i}
          className="rd-sparkle"
          style={{
            left: s.left,
            top: s.top,
            animationDelay: s.delay,
            animationDuration: s.duration,
          }}
        />
      ))}
    </div>
  );
}

const dividerWrap = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.8rem',
  margin: '1.5rem 0',
};
const dividerLine = {
  flex: 1,
  height: '1px',
  background: 'rgba(255, 255, 255, 0.15)',
};
const dividerLabel = {
  fontFamily: 'var(--font-mono-accent), monospace',
  fontSize: '0.65rem',
  letterSpacing: '0.3em',
  color: 'rgba(255, 255, 255, 0.4)',
  textTransform: 'uppercase',
  whiteSpace: 'nowrap',
};
