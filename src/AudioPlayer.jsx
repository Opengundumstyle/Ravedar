import React, { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Volume2, VolumeX } from 'lucide-react';

const AudioVisualizer = ({ analyserNode }) => {
  const canvasRef = useRef(null);
  const animationFrameId = useRef(null);

  useEffect(() => {
    if (!analyserNode || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    analyserNode.fftSize = 256;
    const bufferLength = analyserNode.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animationFrameId.current = requestAnimationFrame(draw);
      analyserNode.getByteFrequencyData(dataArray);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const numBars = 16;
      const barWidth = canvas.width / numBars;
      let x = 0;

      for (let i = 0; i < numBars; i++) {
        const sliceWidth = Math.floor(bufferLength / numBars);
        const start = i * sliceWidth;
        const end = start + sliceWidth;
        const dataSlice = dataArray.slice(start, end);
        const avg = dataSlice.reduce((a, b) => a + b, 0) / sliceWidth;
        
        const barHeight = Math.pow(avg / 255, 2.5) * canvas.height;

        const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
        gradient.addColorStop(0, '#d8b4fe'); // Lighter purple
        gradient.addColorStop(1, '#f9a8d4'); // Lighter pink
        
        ctx.fillStyle = gradient;
        ctx.fillRect(x, canvas.height - barHeight, barWidth - 2, barHeight);

        x += barWidth;
      }
    };

    draw();

    return () => {
      cancelAnimationFrame(animationFrameId.current);
    };
  }, [analyserNode]);

  return <canvas ref={canvasRef} width="64" height="32" className="w-16 h-8" />;
};

const AudioPlayer = ({ src, title }) => {
  const [volume, setVolume] = useState(1);
  const lastVolumeRef = useRef(1);
  const [isMuted, setIsMuted] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  const audioRef = useRef(null);
  const audioContextRef = useRef(null);
  const location = useLocation();
  const fadeIntervalRef = useRef(null);
  const [analyserNode, setAnalyserNode] = useState(null);

  const isMatchesPage = location.pathname === '/matches';

  // Mute audio automatically when on the matches page by fading out
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (fadeIntervalRef.current) {
      clearInterval(fadeIntervalRef.current);
    }

    if (isMatchesPage) {
      if (audio.volume === 0) return;

      const fadeDuration = 2500; // ~2.5 seconds to fade
      
      fadeIntervalRef.current = setInterval(() => {
        if (audio.volume > 0.05) {
          audio.volume -= 0.05;
        } else {
          audio.volume = 0;
          setVolume(0);
          clearInterval(fadeIntervalRef.current);
        }
      }, fadeDuration / 20);
    }
    
    return () => clearInterval(fadeIntervalRef.current);

  }, [isMatchesPage]);

  // Initialize audio context and setup
  const setupAudioContext = async () => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      
      const audioContext = audioContextRef.current;
      
      // Resume audio context if suspended (required for mobile)
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }
      
      const audio = audioRef.current;
      if (!audio) return;
      
      const source = audioContext.createMediaElementSource(audio);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyser.connect(audioContext.destination);
      setAnalyserNode(analyser);
      
      return true;
    } catch (error) {
      console.error("Failed to setup audio context:", error);
      return false;
    }
  };

  // Effect for handling the first user interaction to start playback
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || hasInteracted) return;

    const handleFirstInteraction = async (event) => {
      if (hasInteracted) return;
      
      // Prevent default to avoid any conflicts
      event.preventDefault();
      
      setHasInteracted(true);
      
      try {
        // Setup audio context first
        const contextReady = await setupAudioContext();
        if (!contextReady) {
          console.error("Audio context setup failed");
          setHasInteracted(false);
          return;
        }
        
        // Set initial volume
        audio.volume = volume;
        
        // Try to play audio
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          await playPromise;
          setIsPlaying(true);
        }
      } catch (error) {
        console.error("Audio play failed on interaction:", error);
        // If autoplay fails, we'll try again on next interaction
        setHasInteracted(false);
      }
    };

    // Add multiple event listeners for better mobile support
    const events = ['click', 'touchstart', 'touchend', 'keydown'];
    
    events.forEach(event => {
      window.addEventListener(event, handleFirstInteraction, { once: true, passive: false });
    });

    return () => {
      events.forEach(event => {
        window.removeEventListener(event, handleFirstInteraction);
      });
    };
  }, [hasInteracted, volume]);

  // Effect for syncing the volume state to the audio element
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
    setIsMuted(volume === 0);
  }, [volume]);
  
  const toggleMute = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    try {
      if (volume > 0) {
        lastVolumeRef.current = volume;
        setVolume(0);
      } else {
        const newVolume = lastVolumeRef.current || 1;
        setVolume(newVolume);
        
        // If audio was paused due to being muted, try to resume
        if (audio.paused && hasInteracted) {
          // Ensure audio context is resumed
          if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
            await audioContextRef.current.resume();
          }
          await audio.play();
          setIsPlaying(true);
        }
      }
    } catch (error) {
      console.error("Error toggling mute:", error);
    }
  };

  // Handle audio play/pause events
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
    };
  }, []);

  return (
    <>
      <audio ref={audioRef} src={src} loop preload="auto" />
      <div 
        className="fixed bottom-4 right-4 z-50 flex items-end gap-4"
        style={{ textShadow: '0 1px 4px rgba(0,0,0,0.7)' }}
      >
        {!isMatchesPage && (
          <div className="text-right">
            <div className="w-40 overflow-hidden">
              <span
                className={`block text-sm font-semibold text-white/90 ${title.length > 24 ? 'marquee' : ''}`}
                title={title}
                style={{ minWidth: '100%' }}
              >
                {title}
              </span>
            </div>
            <p className="text-xs text-white/60">
              Rights reserved. For demo only.
            </p>
          </div>
        )}
        <div 
          className="relative w-16 h-16 flex items-center justify-center"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={toggleMute}
            onTouchEnd={toggleMute}
            className="w-16 h-10 flex items-center justify-center cursor-pointer"
          >
            {isMuted ? (
              <VolumeX size={20} className="text-white" />
            ) : (
              <>
                {analyserNode && isPlaying && <AudioVisualizer analyserNode={analyserNode} />}
                {!isPlaying && hasInteracted && <Volume2 size={20} className="text-white" />}
              </>
            )}
          </motion.div>
        </div>
      </div>
    </>
  );
};

export default AudioPlayer; 