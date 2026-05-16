'use client';

import React from 'react';

/**
 * Shared background for the graffiti / rave aesthetic.
 * Renders concrete wall + ambient smoke + corner ghost tags.
 * Optional: ambientLaser, radar console.
 */
export default function GraffitiWall({
  ghostTags = true,
  ambientLaser = false,
  radar = false,
  thirdSmoke = false,
}) {
  return (
    <>
      <div className="rd-wall" aria-hidden="true" />
      <div className="rd-smoke rd-smoke--a" aria-hidden="true" />
      <div className="rd-smoke rd-smoke--b" aria-hidden="true" />
      {thirdSmoke && <div className="rd-smoke rd-smoke--c" aria-hidden="true" />}

      {ambientLaser && <div className="rd-ambient-laser" aria-hidden="true" />}

      {radar && (
        <div className="rd-radar" aria-hidden="true">
          <div className="rd-radar-ring" />
          <div className="rd-radar-ring rd-radar-ring--r2" />
          <div className="rd-radar-ring rd-radar-ring--r3" />
          <div className="rd-radar-ring rd-radar-ring--r4" />
          <div className="rd-radar-crosshair" />
          <div className="rd-radar-sweep" />
          <div className="rd-blip" style={{ top: '22%', left: '38%', animationDelay: '1.4s' }} />
          <div className="rd-blip" style={{ top: '48%', left: '68%', animationDelay: '2.6s' }} />
          <div
            className="rd-blip"
            style={{
              top: '64%',
              left: '30%',
              animationDelay: '3.8s',
              background: 'var(--rd-spray-pink)',
              boxShadow: '0 0 10px var(--rd-spray-pink)',
            }}
          />
          <div className="rd-blip" style={{ top: '32%', left: '72%', animationDelay: '4.6s' }} />
          <div
            className="rd-blip"
            style={{
              top: '58%',
              left: '50%',
              animationDelay: '0.8s',
              background: 'var(--rd-spray-yellow)',
              boxShadow: '0 0 10px var(--rd-spray-yellow)',
            }}
          />
        </div>
      )}

      {ghostTags && (
        <>
          <div className="rd-ghost-tag rd-ghost-tag--a" aria-hidden="true">
            FLUX
          </div>
          <div className="rd-ghost-tag rd-ghost-tag--b" aria-hidden="true">
            404
          </div>
          <div className="rd-ghost-tag rd-ghost-tag--c" aria-hidden="true">
            EAST
          </div>
        </>
      )}
    </>
  );
}
