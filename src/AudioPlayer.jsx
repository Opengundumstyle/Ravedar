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
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);

  const audioRef = useRef(null);
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

  // Effect for handling the first user interaction to start playback
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const setupAudioContext = () => {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioContext.createMediaElementSource(audio);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyser.connect(audioContext.destination);
      setAnalyserNode(analyser);
    };

    const handleFirstInteraction = () => {
      if (!analyserNode) {
        setupAudioContext();
      }
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

  // Effect for syncing the volume state to the audio element
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
    setIsMuted(volume === 0);
  }, [volume]);
  
  const toggleMute = () => {
    if (volume > 0) {
      lastVolumeRef.current = volume;
      setVolume(0);
    } else {
      setVolume(lastVolumeRef.current || 1);
    }
  };
  
  const handleVolumeChange = (e) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    if (newVolume > 0) {
      lastVolumeRef.current = newVolume;
    }
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
        <div 
          className="relative w-16 h-16 flex items-center justify-center"
          onPointerEnter={() => setShowVolumeSlider(true)}
          onPointerLeave={() => setShowVolumeSlider(false)}
        >
          <AnimatePresence>
            {showVolumeSlider ? (
              <motion.div
                key="slider"
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.7 }}
                className="absolute w-full h-full flex items-center justify-center"
              >
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={volume}
                  onChange={handleVolumeChange}
                  className="w-16 h-3 appearance-none bg-transparent cursor-pointer 
                             [&::-webkit-slider-runnable-track]:rounded-full 
                             [&::-webkit-slider-runnable-track]:bg-gradient-to-t 
                             [&::-webkit-slider-runnable-track]:from-pink-500/50 
                             [&::-webkit-slider-runnable-track]:to-purple-500/50
                             [&::-webkit-slider-thumb]:appearance-none 
                             [&::-webkit-slider-thumb]:h-4 
                             [&::-webkit-slider-thumb]:w-4 
                             [&::-webkit-slider-thumb]:rounded-full 
                             [&::-webkit-slider-thumb]:bg-white"
                  style={{ transform: 'rotate(-90deg)' }}
                />
              </motion.div>
            ) : (
              <motion.div
                key="visualizer"
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.7 }}
                onClick={toggleMute}
                className="w-16 h-10 flex items-center justify-center cursor-pointer"
              >
                {isMuted ? (
                  <VolumeX size={20} />
                ) : (
                  <>
                    {analyserNode && <AudioVisualizer analyserNode={analyserNode} />}
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </>
  );
};

export default AudioPlayer; 