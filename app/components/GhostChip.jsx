'use client';

import React from 'react';
import { useRouter } from 'next/navigation';

/**
 * Ambient "you're a ghost, tag in" CTA chip for anonymous users.
 * Callers gate rendering at the call site (e.g. {!isAuthenticated && <GhostChip />}).
 */
export default function GhostChip() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.push('/signup')}
      className="rd-nav-chip rd-nav-chip--ghost"
      aria-label="tag in to be seen"
    >
      ▸ GHOST · TAG IN
    </button>
  );
}
