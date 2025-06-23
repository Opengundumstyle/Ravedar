import React from "react";

const RadarLoader = ({ eventName }) => (
  <div className="h-screen w-full flex flex-col items-center justify-center bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 text-white overflow-hidden">
    <div className="relative w-48 h-48">
      {/* Sonar Ping Rings */}
      <div className="absolute inset-0 rounded-full border-2 border-purple-400/80 animate-sonar-ping" />
      <div className="absolute inset-0 rounded-full border-2 border-pink-400/60 animate-sonar-ping" style={{ animationDelay: '0.5s' }}/>
      <div className="absolute inset-0 rounded-full border-2 border-sky-400/40 animate-sonar-ping" style={{ animationDelay: '1s' }}/>

      {/* Radar sweep remains the same */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div 
          className="w-full h-full rounded-full origin-center"
          style={{
            background: 'conic-gradient(from 0deg, rgba(236, 72, 153, 0.5), rgba(168, 85, 247, 0.2), transparent 40%)',
            animation: 'spin 2.5s linear infinite',
          }}
        />
      </div>

      {/* Center dot remains the same */}
      <div className="absolute top-1/2 left-1/2 w-4 h-4 bg-white rounded-full -translate-x-1/2 -translate-y-1/2 shadow-lg shadow-white/50" />
    </div>
    <div className="mt-12 text-xl text-purple-200 font-semibold tracking-wider animate-text-pulse text-center px-4">
      {eventName 
        ? `Searching for your potential ravebae at ${eventName}...`
        : 'Searching for matches...'
      }
    </div>
  </div>
);

export default RadarLoader; 