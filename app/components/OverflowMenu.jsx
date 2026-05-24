'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * OverflowMenu — a "⋯" button that opens a small action sheet.
 *
 * Props:
 *   items: Array<{ key: string, label: string, danger?: boolean, onSelect: () => void }>
 *   ariaLabel?: string  (defaults to "more actions")
 *   align?: 'left' | 'right'  (defaults to 'right')
 */
export default function OverflowMenu({ items, ariaLabel = 'more actions', align = 'right' }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onEsc = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  return (
    <div ref={rootRef} style={s.root}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onMouseDown={(e) => e.stopPropagation()}
        style={s.btn}
      >
        ⋯
      </button>
      {open && (
        <div role="menu" style={{ ...s.sheet, [align]: 0 }}>
          {items.map((it) => (
            <button
              key={it.key}
              role="menuitem"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                it.onSelect();
              }}
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                ...s.item,
                color: it.danger ? 'var(--rd-spray-pink)' : '#fff',
              }}
            >
              <span style={s.arrow}>▸</span>
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const s = {
  root: {
    position: 'relative',
    display: 'inline-block',
  },
  btn: {
    width: 36,
    height: 36,
    border: '1px solid rgba(255,255,255,0.25)',
    background: 'rgba(0,0,0,0.55)',
    color: '#fff',
    fontFamily: 'var(--font-mono-accent), monospace',
    fontSize: '1.05rem',
    letterSpacing: '0.1em',
    cursor: 'pointer',
    borderRadius: 2,
    backdropFilter: 'blur(4px)',
  },
  sheet: {
    position: 'absolute',
    top: 'calc(100% + 6px)',
    minWidth: 180,
    background: 'rgba(15,15,15,0.96)',
    border: '1px solid rgba(255,26,138,0.4)',
    boxShadow: '0 8px 24px rgba(0,0,0,0.6), 0 0 14px rgba(255,26,138,0.25)',
    padding: '0.35rem 0',
    zIndex: 60,
    backdropFilter: 'blur(8px)',
  },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.55rem',
    width: '100%',
    padding: '0.65rem 0.9rem',
    background: 'transparent',
    border: 'none',
    fontFamily: 'var(--font-mono-accent), monospace',
    fontSize: '0.72rem',
    letterSpacing: '0.22em',
    textTransform: 'lowercase',
    textAlign: 'left',
    cursor: 'pointer',
  },
  arrow: {
    color: 'var(--rd-spray-pink)',
    fontFamily: 'var(--font-mono-accent), monospace',
  },
};
