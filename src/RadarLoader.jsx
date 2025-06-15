import React from "react";

const RadarLoader = () => (
  <div className="flex flex-col items-center justify-center h-full w-full">
    <div className="relative w-40 h-40">
      {/* Radar circle */}
      <div className="absolute inset-0 rounded-full border-4 border-blue-300 animate-pulse" />
      {/* Radar sweep */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-36 h-36 rounded-full bg-gradient-to-tr from-blue-400/60 via-blue-200/0 to-blue-200/0 animate-spin-slow origin-bottom-left" />
      </div>
      {/* Center dot */}
      <div className="absolute top-1/2 left-1/2 w-4 h-4 bg-blue-500 rounded-full -translate-x-1/2 -translate-y-1/2 shadow-lg" />
    </div>
    <div className="mt-8 text-lg text-blue-600 font-semibold tracking-wide animate-pulse">
      Scanning for rave matches...
    </div>
  </div>
);

export default RadarLoader; 