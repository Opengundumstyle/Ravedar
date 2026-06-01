'use client';

import React from 'react';
import GraffitiWall from './GraffitiWall';

export default function RadarLoader({ eventName = 'tonight' }) {
  return (
    <div className="rd-screen">
      <GraffitiWall />
      <div
        style={{
          position: 'relative',
          zIndex: 10,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1.5rem',
        }}
      >
        <div className="rd-scan-radar" style={{ marginBottom: '2rem' }}>
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
        <div className="rd-scan-status">▸ TUNING IN</div>
        <div className="rd-scan-substatus">
          locking on{' '}
          <span style={{ color: 'var(--rd-spray-pink)' }}>
            {eventName.toUpperCase()}
          </span>
        </div>
      </div>
    </div>
  );
}
