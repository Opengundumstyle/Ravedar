import React from 'react';
import { motion } from 'framer-motion';

export default function RadarLoader({ eventName = "Loading..." }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex flex-col items-center justify-center p-4">
      <div className="text-center">
        {/* Radar Animation */}
        <div className="relative mb-8">
          <motion.div
            className="w-32 h-32 border-4 border-pink-500/30 rounded-full"
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.3, 0.6, 0.3],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
          <motion.div
            className="absolute top-1/2 left-1/2 w-24 h-24 border-4 border-purple-500/50 rounded-full transform -translate-x-1/2 -translate-y-1/2"
            animate={{
              scale: [1, 1.3, 1],
              opacity: [0.5, 0.8, 0.5],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 0.5,
            }}
          />
          <motion.div
            className="absolute top-1/2 left-1/2 w-16 h-16 border-4 border-indigo-500/70 rounded-full transform -translate-x-1/2 -translate-y-1/2"
            animate={{
              scale: [1, 1.4, 1],
              opacity: [0.7, 1, 0.7],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 1,
            }}
          />
          
          {/* Center Dot */}
          <div className="absolute top-1/2 left-1/2 w-4 h-4 bg-gradient-to-r from-pink-500 to-purple-600 rounded-full transform -translate-x-1/2 -translate-y-1/2 animate-pulse" />
        </div>

        {/* Loading Text */}
        <motion.h2
          className="text-display text-2xl text-white mb-2"
          animate={{
            opacity: [0.5, 1, 0.5],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          {eventName}
        </motion.h2>
        
        <p className="text-body text-white/60">
          Finding your perfect rave match...
        </p>
      </div>
    </div>
  );
} 