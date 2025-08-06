import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '../../lib/supabaseClient';

export default function UserCard({ user, onSurveyAction }) {
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [showFullAbout, setShowFullAbout] = useState(false);

  if (!user) return null;

  // Handle survey cards
  if (user.is_survey) {
    return (
      <motion.div
        className="w-full h-full bg-black/40 backdrop-blur-sm border border-white/20 rounded-2xl overflow-hidden relative"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-pink-500/20 to-purple-600/20"></div>
        
        <div className="relative z-10 h-full flex flex-col justify-center items-center p-6 text-center">
          <div className="text-6xl mb-4">📊</div>
          <h3 className="text-heading text-2xl text-white mb-2">{user.name}</h3>
          <p className="text-body text-white/80 mb-6">{user.about_me}</p>
          
          <div className="space-y-3 w-full max-w-xs">
            {user.survey_options.map((option, index) => (
              <motion.button
                key={option.action}
                onClick={() => onSurveyAction(option.action)}
                className={`w-full py-3 px-4 rounded-xl text-white font-semibold transition-all duration-200 ${option.color}`}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {option.text}
              </motion.button>
            ))}
          </div>
        </div>
      </motion.div>
    );
  }

  const photos = user.photos || [];
  const currentPhoto = photos[currentPhotoIndex] || { image_url: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=600&fit=crop&crop=center' };

  const nextPhoto = () => {
    if (photos.length > 1) {
      setCurrentPhotoIndex((prev) => (prev + 1) % photos.length);
    }
  };

  const prevPhoto = () => {
    if (photos.length > 1) {
      setCurrentPhotoIndex((prev) => (prev - 1 + photos.length) % photos.length);
    }
  };

  const toggleAbout = () => {
    setShowFullAbout(!showFullAbout);
  };

  return (
    <motion.div
      className="w-full h-full bg-black/40 backdrop-blur-sm border border-white/20 rounded-2xl overflow-hidden relative"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
    >
      {/* Photo */}
      <div className="relative h-2/3 bg-gradient-to-br from-gray-800 to-gray-900">
        <img
          src={currentPhoto.image_url}
          alt={`${user.name}'s photo`}
          className="w-full h-full object-cover"
        />
        
        {/* Photo Navigation */}
        {photos.length > 1 && (
          <>
            <button
              onClick={prevPhoto}
              className="absolute left-2 top-1/2 transform -translate-y-1/2 w-8 h-8 bg-black/50 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-black/70 transition-colors duration-200"
            >
              ‹
            </button>
            <button
              onClick={nextPhoto}
              className="absolute right-2 top-1/2 transform -translate-y-1/2 w-8 h-8 bg-black/50 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-black/70 transition-colors duration-200"
            >
              ›
            </button>
            
            {/* Photo Indicators */}
            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex space-x-2">
              {photos.map((_, index) => (
                <div
                  key={index}
                  className={`w-2 h-2 rounded-full transition-colors duration-200 ${
                    index === currentPhotoIndex ? 'bg-white' : 'bg-white/50'
                  }`}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* User Info */}
      <div className="p-4 h-1/3 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-heading text-xl text-white font-semibold">
              {user.name}
              {user.role && (
                <span className="ml-2 text-sm bg-gradient-to-r from-pink-500 to-purple-600 text-white px-2 py-1 rounded-full">
                  {user.role}
                </span>
              )}
            </h3>
            {user.instagram && (
              <a
                href={`https://instagram.com/${user.instagram.replace('@', '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-pink-400 hover:text-pink-300 transition-colors duration-200"
              >
                {user.instagram}
              </a>
            )}
          </div>

          {/* About Me */}
          <div className="mb-3">
            <p className={`text-body text-white/80 ${!showFullAbout && user.about_me?.length > 100 ? 'line-clamp-2' : ''}`}>
              {user.about_me || "No bio yet"}
            </p>
            {user.about_me?.length > 100 && (
              <button
                onClick={toggleAbout}
                className="text-pink-400 hover:text-pink-300 text-sm font-medium transition-colors duration-200"
              >
                {showFullAbout ? 'Show less' : 'Show more'}
              </button>
            )}
          </div>
        </div>

        {/* Vibe Tags */}
        {user.vibe_tags && user.vibe_tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {user.vibe_tags.slice(0, 3).map((tag, index) => (
              <span
                key={index}
                className="px-2 py-1 bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg text-xs text-white/80"
              >
                {tag}
              </span>
            ))}
            {user.vibe_tags.length > 3 && (
              <span className="px-2 py-1 bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg text-xs text-white/60">
                +{user.vibe_tags.length - 3} more
              </span>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
} 