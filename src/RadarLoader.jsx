import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";

const RadarLoader = ({ eventName }) => {
  const [loadingText, setLoadingText] = useState("");
  const [dots, setDots] = useState("");

  // Animated loading text
  useEffect(() => {
    const baseText = 'Initializing your rave experience';
    setLoadingText(baseText);
  }, []);

  // Loading messages that cycle
  const loadingMessages = [
    "🎵 Scanning the dance floor...",
    "🎪 Finding your rave crew...",
    "💫 Connecting like-minded souls...",
    "🎉 Discovering your next adventure...",
    "🌟 Manifesting good vibes...",
    "🎭 Matching energy levels...",
    "🌈 Creating magical connections...",
    "🎊 Building your rave family..."
  ];

  const [currentMessage, setCurrentMessage] = useState(0);

  useEffect(() => {
    const messageInterval = setInterval(() => {
      setCurrentMessage(prev => (prev + 1) % loadingMessages.length);
    }, 2000);

    return () => clearInterval(messageInterval);
  }, []);

  return (
    <div className="h-screen w-full flex flex-col items-center justify-center bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 text-white overflow-hidden relative">
      {/* Animated background particles */}
      <div className="absolute inset-0 overflow-hidden">
        {[...Array(20)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 bg-white/30 rounded-full"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
            }}
            animate={{
              y: [0, -100, 0],
              opacity: [0, 1, 0],
            }}
            transition={{
              duration: 3 + Math.random() * 2,
              repeat: Infinity,
              delay: Math.random() * 2,
            }}
          />
        ))}
      </div>

      {/* Main radar container */}
      <div className="relative z-10">
        {/* Outer glow ring */}
        <motion.div
          className="absolute inset-0 w-64 h-64 rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(236, 72, 153, 0.3) 0%, transparent 70%)',
          }}
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.6, 0.3],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />

        {/* Radar circles */}
        <div className="relative w-48 h-48">
          {/* Multiple sonar rings with different colors and timing */}
          <motion.div
            className="absolute inset-0 rounded-full border-2 border-purple-400/80"
            animate={{
              scale: [0.3, 1.5],
              opacity: [1, 0],
            }}
            transition={{
              duration: 2.5,
              repeat: Infinity,
              ease: "easeOut",
            }}
          />
          <motion.div
            className="absolute inset-0 rounded-full border-2 border-pink-400/60"
            animate={{
              scale: [0.3, 1.5],
              opacity: [1, 0],
            }}
            transition={{
              duration: 2.5,
              repeat: Infinity,
              delay: 0.5,
              ease: "easeOut",
            }}
          />
          <motion.div
            className="absolute inset-0 rounded-full border-2 border-sky-400/40"
            animate={{
              scale: [0.3, 1.5],
              opacity: [1, 0],
            }}
            transition={{
              duration: 2.5,
              repeat: Infinity,
              delay: 1,
              ease: "easeOut",
            }}
          />

          {/* Radar sweep with enhanced gradient */}
          <div className="absolute inset-0 flex items-center justify-center">
            <motion.div 
              className="w-full h-full rounded-full origin-center"
              style={{
                background: 'conic-gradient(from 0deg, rgba(236, 72, 153, 0.8), rgba(168, 85, 247, 0.6), rgba(59, 130, 246, 0.4), transparent 50%)',
              }}
              animate={{ rotate: 360 }}
              transition={{
                duration: 2.5,
                repeat: Infinity,
                ease: "linear",
              }}
            />
          </div>

          {/* Center dot with pulsing effect */}
          <motion.div 
            className="absolute top-1/2 left-1/2 w-4 h-4 bg-white rounded-full -translate-x-1/2 -translate-y-1/2 shadow-lg"
            animate={{
              scale: [1, 1.2, 1],
              boxShadow: [
                "0 0 10px rgba(255, 255, 255, 0.5)",
                "0 0 20px rgba(255, 255, 255, 0.8)",
                "0 0 10px rgba(255, 255, 255, 0.5)",
              ],
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />

          {/* Orbiting particles around the radar */}
          {[...Array(6)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-2 h-2 bg-white/60 rounded-full"
              style={{
                left: "50%",
                top: "50%",
                marginLeft: "-4px",
                marginTop: "-4px",
              }}
              animate={{
                x: [0, Math.cos((i * 60) * Math.PI / 180) * 80],
                y: [0, Math.sin((i * 60) * Math.PI / 180) * 80],
                opacity: [0, 1, 0],
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                delay: i * 0.5,
                ease: "easeInOut",
              }}
            />
          ))}
        </div>
      </div>

      {/* Loading text with enhanced styling */}
      <div className="mt-12 text-center px-4 relative z-10">
        {/* Main loading text */}
        <motion.div
          className="text-heading text-xl text-purple-200 tracking-wider mb-4"
          animate={{ opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          {loadingText}
        </motion.div>

        {/* Cycling messages */}
        <motion.div
          key={currentMessage}
          className="text-body-large text-white/80 font-medium"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.5 }}
        >
          {loadingMessages[currentMessage]}
        </motion.div>

        {/* Event name if provided */}
        {eventName && (
          <motion.div
            className="mt-4 text-body text-white/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1, duration: 0.5 }}
          >
            Preparing for <span className="text-gradient-primary font-semibold">{eventName}</span>
          </motion.div>
        )}

        {/* Progress indicator */}
        <div className="mt-8 flex justify-center">
          <motion.div
            className="w-32 h-1 bg-white/20 rounded-full overflow-hidden"
            initial={{ opacity: 0, scaleX: 0 }}
            animate={{ opacity: 1, scaleX: 1 }}
            transition={{ delay: 0.5, duration: 0.8 }}
          >
            <motion.div
              className="h-full bg-gradient-to-r from-pink-500 to-purple-600 rounded-full"
              initial={{ width: "0%" }}
              animate={{ width: "100%" }}
              transition={{ duration: 3, ease: "easeInOut" }}
            />
          </motion.div>
        </div>

        {/* Additional info */}
        <motion.div
          className="mt-6 text-caption text-white/40"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5, duration: 0.5 }}
        >
          Connecting to the rave universe...
        </motion.div>
      </div>

      {/* Bottom decorative line */}
      <motion.div
        className="absolute bottom-8 left-1/2 transform -translate-x-1/2 w-32 h-1 bg-gradient-to-r from-transparent via-white/50 to-transparent rounded-full"
        animate={{
          scaleX: [0.5, 1, 0.5],
          opacity: [0.3, 0.8, 0.3],
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