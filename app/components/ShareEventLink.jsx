'use client';

import React, { useState } from 'react';

/**
 * Single-button share. Prefers Web Share API (mobile-native sheet);
 * falls back to clipboard.writeText with a transient toast;
 * final fallback is a prompt() dialog.
 *
 * Props:
 *   eventName: string (required)
 *   city:      string (required)
 *   date:      string|null
 *   variant:   'primary' | 'inline'   ('primary' = rd-btn-neon, 'inline' = rd-stencil-link)
 */
export default function ShareEventLink({ eventName, city, date, variant = 'primary' }) {
  const [toast, setToast] = useState(null);

  const buildUrl = () => {
    if (typeof window === 'undefined') return '';
    const params = new URLSearchParams();
    params.set('event', eventName);
    params.set('city', city);
    if (date) params.set('date', date);
    return `${window.location.origin}/?${params.toString()}`;
  };

  const showToast = (text) => {
    setToast(text);
    setTimeout(() => setToast(null), 2000);
  };

  const handleClick = async () => {
    const url = buildUrl();
    const payload = {
      title: 'RAVEDAR',
      text: `who's vibing at ${eventName}?`,
      url,
    };

    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share(payload);
        return;
      } catch (err) {
        // AbortError = user dismissed the native sheet, treat as silent cancel.
        if (err && err.name === 'AbortError') return;
        // fall through to clipboard
      }
    }

    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(url);
        showToast('▸ link copied');
        return;
      } catch (err) {
        // fall through to prompt
      }
    }

    if (typeof window !== 'undefined' && window.prompt) {
      window.prompt('copy this link:', url);
    }
  };

  if (variant === 'inline') {
    return (
      <>
        <button
          type="button"
          onClick={handleClick}
          className="rd-stencil-link"
          style={{ background: 'none', border: 'none', cursor: 'pointer' }}
        >
          ▸ DROP THE LINK
        </button>
        {toast && (
          <span
            className="rd-banner rd-banner--success"
            style={{ display: 'inline-block', marginLeft: '0.7rem', padding: '0.3rem 0.6rem', fontSize: '0.72rem' }}
          >
            {toast}
          </span>
        )}
      </>
    );
  }

  return (
    <div className="rd-btn-wrap">
      <button type="button" onClick={handleClick} className="rd-btn-neon">
        ▸ DROP THE LINK
      </button>
      {toast && (
        <div
          className="rd-banner rd-banner--success"
          style={{ marginTop: '0.6rem', textAlign: 'center' }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
