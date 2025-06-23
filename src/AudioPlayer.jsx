import React, { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Volume2, VolumeX } from 'lucide-react';

const AudioPlayer = ({ src, title }) => {
  const [isMuted, setIsMuted] = useState(false);
  const audioRef = useRef(null);
  const location = useLocation();
  const fadeIntervalRef = useRef(null);

  const isMatchesPage = location.pathname === '/matches';

  // Mute audio automatically when on the matches page by fading out
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (fadeIntervalRef.current) {
      clearInterval(fadeIntervalRef.current);
    }

    if (isMatchesPage) {
      if (isMuted || audio.volume === 0) return;

      const fadeDuration = 2500; // ~2.5 seconds to fade
      
      fadeIntervalRef.current = setInterval(() => {
        if (audio.volume > 0.05) {
          audio.volume -= 0.05;
        } else {
          audio.volume = 0;
          setIsMuted(true);
          clearInterval(fadeIntervalRef.current);
        }
      }, fadeDuration / 20);
    }
    
    return () => clearInterval(fadeIntervalRef.current);

  }, [isMatchesPage]);

  // Effect for handling the first user interaction to start playback
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleFirstInteraction = () => {
      audio.play().catch(error => {
        if (error.name !== 'AbortError') {
          console.error("Audio play failed on interaction:", error);
        }
      });
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
    };

    window.addEventListener('click', handleFirstInteraction);
    window.addEventListener('keydown', handleFirstInteraction);

    return () => {
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
    };
  }, []);

  // Effect for syncing the muted state
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = isMuted;
    }
  }, [isMuted]);

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  return (
    <>
      <audio ref={audioRef} src={src} loop preload="auto" />
      <div 
        className="fixed bottom-4 right-4 z-50 flex items-end gap-4"
        style={{ textShadow: '0 1px 4px rgba(0,0,0,0.7)' }}
      >
        {!isMatchesPage && (
          <div className="text-right">
            <p className="text-sm font-semibold text-white/90 truncate max-w-[200px]" title={title}>
              {title}
            </p>
            <p className="text-xs text-white/60">
              Rights reserved. For demo only.
            </p>
          </div>
        )}
        <motion.button
          onClick={toggleMute}
          className="w-10 h-10 rounded-full bg-black/30 backdrop-blur-md border border-white/20 flex items-center justify-center text-white/80 shadow-lg"
          whileHover={{ scale: 1.1, backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
          whileTap={{ scale: 0.9 }}
        >
          <AnimatePresence mode="wait">
            {isMuted ? (
              <motion.div key="muted" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <VolumeX size={20} />
              </motion.div>
            ) : (
              <motion.div key="unmuted" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Volume2 size={20} />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.button>
      </div>
    </>
  );
};

export default AudioPlayer; 