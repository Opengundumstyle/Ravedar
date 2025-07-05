import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";

const RadarLoader = ({ eventName }) => {
  const [currentMessage, setCurrentMessage] = useState(0);

  // Cleaner loading messages
  const loadingMessages = [
    "🎵 Finding your rave crew...",
    "💫 Connecting like-minded souls...",
    "🎉 Discovering your next adventure...",
    "🌟 Manifesting good vibes...",
    "🎭 Matching energy levels...",
    "🌈 Creating magical connections..."
  ];

  useEffect(() => {
    const messageInterval = setInterval(() => {
      setCurrentMessage(prev => (prev + 1) % loadingMessages.length);
    }, 2500);

    return () => clearInterval(messageInterval);
  }, []);

  return (
    <div className="h-screen w-full flex flex-col items-center justify-center bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 text-white overflow-hidden relative">
      {/* Subtle background animation */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/20 via-purple-900/20 to-pink-900/20 animate-pulse"></div>
      
      {/* Main content container */}
      <div className="relative z-10 flex flex-col items-center justify-center">
        {/* Simplified radar animation */}
        <div className="relative w-32 h-32 mb-8">
          {/* Main radar ring */}
          <motion.div
            className="absolute inset-0 rounded-full border-2 border-pink-400/60"
            animate={{
              scale: [1, 1.3, 1],
              opacity: [0.6, 0.3, 0.6],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
          
          {/* Secondary ring */}
          <motion.div
            className="absolute inset-0 rounded-full border border-purple-400/40"
            animate={{
              scale: [1, 1.5, 1],
              opacity: [0.4, 0.1, 0.4],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              delay: 0.5,
              ease: "easeInOut",
            }}
          />

          {/* Center dot */}
          <motion.div 
            className="absolute top-1/2 left-1/2 w-3 h-3 bg-white rounded-full -translate-x-1/2 -translate-y-1/2"
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.8, 1, 0.8],
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        </div>

        {/* Loading text */}
        <div className="text-center px-4 max-w-sm">
          {/* Main title */}
          <motion.h2
            className="text-heading text-2xl text-white mb-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            Finding Your Match
          </motion.h2>

          {/* Cycling message */}
          <motion.div
            key={currentMessage}
            className="text-body-large text-white/80 mb-6"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.4 }}
          >
            {loadingMessages[currentMessage]}
          </motion.div>

          {/* Event name */}
          {eventName && (
            <motion.div
              className="text-body text-white/70 mb-8"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.5 }}
            >
              Preparing for <span className="text-gradient-primary font-semibold">{eventName}</span>
            </motion.div>
          )}

          {/* Clean progress bar */}
          <div className="w-48 h-1 bg-white/20 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-pink-500 to-purple-600 rounded-full"
              initial={{ width: "0%" }}
              animate={{ width: "100%" }}
              transition={{ duration: 2.5, ease: "easeInOut" }}
            />
          </div>
        </div>
      </div>

      {/* Subtle bottom accent */}
      <motion.div
        className="absolute bottom-12 left-1/2 transform -translate-x-1/2 w-24 h-0.5 bg-gradient-to-r from-transparent via-white/30 to-transparent rounded-full"
        animate={{
          scaleX: [0.8, 1, 0.8],
          opacity: [0.4, 0.7, 0.4],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
    </div>
  );
};

export default RadarLoader; 