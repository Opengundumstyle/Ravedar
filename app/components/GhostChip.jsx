'use client';

import React from 'react';
import { useRouter } from 'next/navigation';

/**
 * Ambient "you're a ghost, tag in" CTA chip for anonymous users.
 * Renders nothing if the caller passes hidden=true (e.g. authenticated).
 */
export default function GhostChip({ hidden = false, style }) {
  const router = useRouter();
  if (hidden) return null;
  return (
    <button
      type="button"
      onClick={() => router.push('/signup')}
      className="rd-nav-chip rd-nav-chip--ghost"
      aria-label="tag in to be seen"
      style={style}
    >
      ▸ GHOST · TAG IN
    </button>
  );
}
