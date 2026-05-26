'use client';

import React, { useState } from 'react';
import OverflowMenu from './OverflowMenu';

const DEFAULT_PHOTO =
  'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=600&h=750&fit=crop&crop=center';

export default function UserCard({ user, onSurveyAction, onCardAnswer, onReport, disableAnimation = false }) {
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [showFullAbout, setShowFullAbout] = useState(false);

  if (!user) return null;

  // ---------------- SURVEY CARD ----------------
  if (user.is_survey) {
    return (
      <div className="rd-flyer">
        <div className="rd-tape rd-tape--left" />
        <div className="rd-tape rd-tape--right" />

        <div
          style={{
            position: 'relative',
            zIndex: 2,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            padding: '2.5rem 1.4rem',
            textAlign: 'center',
          }}
        >
          <div
            className="rd-role-stamp rd-role-stamp--dj"
            style={{ transform: 'rotate(-4deg)', marginBottom: '1.5rem' }}
          >
            OPINION POLL
          </div>

          <h3
            className="rd-flyer-name"
            style={{
              fontSize: 'clamp(2rem, 7vw, 2.8rem)',
              textAlign: 'center',
              transform: 'rotate(-1.5deg)',
              marginBottom: '1rem',
            }}
          >
            {user.name}
          </h3>

          <p
            className="rd-about"
            style={{ fontSize: '1rem', maxWidth: '320px', marginBottom: '2rem' }}
          >
            {user.about_me}
          </p>

          <div style={{ width: '100%', maxWidth: '280px', display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
            {user.survey_options.map((option) => (
              <button
                key={option.action}
                onClick={() => onSurveyAction && onSurveyAction(option.action)}
                disabled={disableAnimation}
                style={surveyBtnStyle(option.action)}
              >
                {option.text.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <FlyerDripEdge />
      </div>
    );
  }

  // ---------------- DAILY DROP CARD ----------------
  if (user.is_card) {
    const reveal = user.reveal; // { pct, cohort, label } once answered, else null
    const cohortWord =
      reveal?.cohort === 'event' ? 'ravers here'
      : reveal?.cohort === 'city' ? `ravers in ${user.city || 'your city'}`
      : 'ravers on ravedar';

    return (
      <div className="rd-flyer">
        <div className="rd-tape rd-tape--left" />
        <div className="rd-tape rd-tape--right" />

        <div
          style={{
            position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', height: '100%',
            padding: '2.5rem 1.4rem', textAlign: 'center',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-mono-accent), monospace', textTransform: 'uppercase',
              letterSpacing: '0.3em', fontSize: '0.7rem', color: 'var(--rd-spray-cyan)',
              marginBottom: '1.5rem',
            }}
          >
            ▸ daily drop
          </div>

          {reveal ? (
            <>
              <div
                style={{
                  fontFamily: 'var(--font-graffiti), cursive',
                  fontSize: 'clamp(3rem, 14vw, 4.5rem)', lineHeight: 1,
                  color: 'var(--rd-spray-cyan)', transform: 'rotate(-3deg)', marginBottom: '0.8rem',
                }}
              >
                {reveal.pct}%
              </div>
              <p className="rd-about" style={{ fontSize: '1rem', maxWidth: '300px' }}>
                you + {reveal.pct}% of {cohortWord} picked{' '}
                <span style={{ color: 'var(--rd-spray-yellow)' }}>{reveal.label}</span>
              </p>
            </>
          ) : (
            <>
              <h3
                className="rd-flyer-name"
                style={{ fontSize: 'clamp(1.7rem, 6vw, 2.4rem)', transform: 'rotate(-1.5deg)', marginBottom: '1.6rem' }}
              >
                {user.question}
              </h3>
              <div style={{ width: '100%', maxWidth: '280px', display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
                <button
                  onClick={() => onCardAnswer && onCardAnswer('a')}
                  disabled={disableAnimation}
                  style={cardOptStyle('a')}
                >
                  ◂ {String(user.option_a).toUpperCase()}
                </button>
                <button
                  onClick={() => onCardAnswer && onCardAnswer('b')}
                  disabled={disableAnimation}
                  style={cardOptStyle('b')}
                >
                  {String(user.option_b).toUpperCase()} ▸
                </button>
              </div>
            </>
          )}
        </div>

        <FlyerDripEdge />
      </div>
    );
  }

  // ---------------- REGULAR USER FLYER ----------------
  const photos = user.photos || [];
  const currentPhoto = photos[currentPhotoIndex] || { image_url: DEFAULT_PHOTO };

  const nextPhoto = (e) => {
    e?.stopPropagation();
    if (photos.length > 1) setCurrentPhotoIndex((i) => (i + 1) % photos.length);
  };
  const prevPhoto = (e) => {
    e?.stopPropagation();
    if (photos.length > 1)
      setCurrentPhotoIndex((i) => (i - 1 + photos.length) % photos.length);
  };

  const roleClass = roleStampClass(user.role);
  const aboutText = user.about_me || 'no bio yet';
  const aboutLong = aboutText.length > 110;

  return (
    <div className="rd-flyer">
      <div className="rd-tape rd-tape--left" />
      <div className="rd-tape rd-tape--right" />

      {onReport && (
        <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 4 }}>
          <OverflowMenu
            ariaLabel="card actions"
            items={[
              { key: 'report', label: 'report', danger: true, onSelect: () => onReport(user) },
            ]}
          />
        </div>
      )}

      {/* Photo */}
      <div className="rd-photo-frame">
        {photos.length > 1 && (
          <div className="rd-photo-dots">
            {photos.map((_, i) => (
              <span key={i} className={i === currentPhotoIndex ? 'is-active' : ''} />
            ))}
          </div>
        )}
        <img
          src={currentPhoto.image_url}
          alt={`${user.name}`}
          draggable={false}
          onDragStart={(e) => e.preventDefault()}
        />
        {photos.length > 1 && !disableAnimation && (
          <>
            <button
              type="button"
              className="rd-photo-nav rd-photo-nav--left"
              onClick={prevPhoto}
              onMouseDown={(e) => e.stopPropagation()}
              aria-label="previous photo"
            >
              ‹
            </button>
            <button
              type="button"
              className="rd-photo-nav rd-photo-nav--right"
              onClick={nextPhoto}
              onMouseDown={(e) => e.stopPropagation()}
              aria-label="next photo"
            >
              ›
            </button>
          </>
        )}
      </div>

      {/* Info */}
      <div className="rd-flyer-info">
        <h3 className="rd-flyer-name">{user.name}</h3>
        <div style={{ marginBottom: '0.55rem', display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' }}>
          {user.role && (
            <span className={`rd-role-stamp ${roleClass}`}>{user.role}</span>
          )}
          {user.instagram && (
            <a
              href={`https://instagram.com/${String(user.instagram).replace('@', '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rd-ig-handle"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {user.instagram}
            </a>
          )}
        </div>

        <p className="rd-about" style={!showFullAbout && aboutLong ? clamp2 : undefined}>
          {aboutText}
        </p>
        {aboutLong && !disableAnimation && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowFullAbout((v) => !v);
            }}
            onMouseDown={(e) => e.stopPropagation()}
            className="rd-about-more"
          >
            {showFullAbout ? '— show less —' : '— show more —'}
          </button>
        )}

        {user.vibe_tags && user.vibe_tags.length > 0 && (
          <div className="rd-vibe-tags" style={{ marginTop: '0.8rem' }}>
            {user.vibe_tags.slice(0, 3).map((tag, i) => (
              <span key={i} className="rd-vibe-tag">
                {tag}
              </span>
            ))}
            {user.vibe_tags.length > 3 && (
              <span className="rd-vibe-tag" style={{ opacity: 0.6 }}>
                +{user.vibe_tags.length - 3}
              </span>
            )}
          </div>
        )}
      </div>

      <FlyerDripEdge />
    </div>
  );
}

function roleStampClass(role) {
  if (!role) return '';
  const r = String(role).toLowerCase();
  if (r === 'founder') return 'rd-role-stamp--founder';
  if (r === 'co-founder' || r === 'cofounder') return 'rd-role-stamp--cofounder';
  if (r.includes('dj')) return 'rd-role-stamp--dj';
  return '';
}

function FlyerDripEdge() {
  return (
    <div className="rd-flyer-drips" aria-hidden="true">
      <svg viewBox="0 0 400 12" preserveAspectRatio="none">
        <path
          d="M0,0 L0,4 L20,4 L24,10 L28,4 L60,4 L63,8 L66,4 L120,4 L124,11 L128,4 L180,4 L184,7 L188,4 L240,4 L244,10 L248,4 L300,4 L304,9 L308,4 L360,4 L364,8 L368,4 L400,4 L400,0 Z"
          fill="#ff1a8a"
        />
      </svg>
    </div>
  );
}

function cardOptStyle(side) {
  return {
    fontFamily: 'var(--font-neon), sans-serif',
    fontSize: '0.95rem',
    letterSpacing: '0.18em',
    padding: '0.95rem 1rem',
    cursor: 'pointer',
    border: '2px solid #1a1a1a',
    borderRadius: 2,
    textTransform: 'uppercase',
    transition: 'all 0.18s',
    boxShadow: '3px 3px 0 rgba(0,0,0,0.7)',
    background: side === 'a' ? 'var(--rd-spray-cyan)' : 'var(--rd-spray-pink)',
    color: side === 'a' ? '#1a1a1a' : '#fff',
  };
}

function surveyBtnStyle(action) {
  const base = {
    fontFamily: 'var(--font-neon), sans-serif',
    fontSize: '0.95rem',
    letterSpacing: '0.28em',
    padding: '0.95rem 1rem',
    cursor: 'pointer',
    border: '2px solid #1a1a1a',
    borderRadius: 2,
    textTransform: 'uppercase',
    transition: 'all 0.18s',
    boxShadow: '3px 3px 0 rgba(0,0,0,0.7)',
  };
  if (action === 'good') {
    return { ...base, background: '#66ff00', color: '#1a1a1a' };
  }
  if (action === 'poor') {
    return { ...base, background: '#ff1a8a', color: '#fff' };
  }
  return { ...base, background: '#ffe900', color: '#1a1a1a' };
}

const clamp2 = {
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
};
