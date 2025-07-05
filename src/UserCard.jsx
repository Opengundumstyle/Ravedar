import React, { useRef } from 'react';
import { motion } from 'framer-motion';

function UserCard({ user, onSurveyAction }) {
  const cardRef = useRef(null);

  // If it's a survey card, render survey options
  if (user.is_survey) {
    return (
      <div className="bg-black/20 backdrop-blur-lg rounded-2xl shadow-lg flex flex-col items-center w-[448px] h-[600px] mx-auto transition-all duration-300 p-1 cursor-pointer">
        <div className="bg-black/20 backdrop-blur-lg rounded-2xl flex flex-col items-center w-full h-full p-0 relative">
          {/* Survey Badge */}
          <div className="absolute top-4 right-4 z-10 bg-gradient-to-r from-blue-500 to-purple-500 text-white px-3 py-1 rounded-full text-caption font-semibold shadow-lg border border-white/20 backdrop-blur-sm animate-pulse">
            SURVEY
          </div>
          
          {/* Photo area: full height with overlay */}
          <div className="w-full h-full flex-shrink-0 flex justify-center items-center">
            <div className="w-full h-full rounded-2xl overflow-hidden bg-gradient-to-br from-purple-900 via-pink-900 to-indigo-900 flex items-center justify-center relative">
              {/* Background pattern */}
              <div className="absolute inset-0 opacity-20">
                <div className="w-full h-full bg-gradient-to-br from-purple-500/30 via-pink-500/30 to-indigo-500/30"></div>
              </div>
              
              {/* Ravedar Logo/Text */}
              <div className="relative z-10 text-center">
                <div className="text-display text-6xl font-black text-white mb-4 tracking-wider text-neon" style={{
                  background: 'linear-gradient(45deg, #fff, #e0e7ff, #fff)',
                  backgroundClip: 'text',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent'
                }}>
                  RAVEDAR
                </div>
                <div className="text-body-large text-white/80 font-medium tracking-wide">
                  <a 
                    href="#" 
                    className="hover:text-white transition-colors duration-300 underline decoration-white/30 hover:decoration-white/60"
                    onClick={(e) => {
                      e.preventDefault();
                      // Placeholder for future functionality
                      console.log('Connect through experience clicked');
                    }}
                  >
                    Connect through experience
                  </a>
                </div>
              </div>
              
              {/* Animated particles effect */}
              <div className="absolute inset-0 overflow-hidden">
                {[...Array(6)].map((_, i) => (
                  <div
                    key={i}
                    className="absolute w-2 h-2 bg-white/30 rounded-full animate-pulse"
                    style={{
                      left: `${20 + i * 15}%`,
                      top: `${30 + i * 10}%`,
                      animationDelay: `${i * 0.5}s`,
                      animationDuration: '2s'
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
          
          {/* Survey Info area: overlay on bottom */}
          <div className="absolute bottom-0 left-0 right-0 flex flex-col justify-end w-full h-[210px] px-4 py-3 bg-gradient-to-t from-black/80 via-black/50 to-transparent rounded-b-2xl">
            {/* Title */}
            <div className="h-8 text-heading text-xl text-white text-center truncate w-full">
              {user.name}
            </div>
            {/* Question */}
            <div className="h-[72px] text-body text-gray-100 text-center w-full overflow-hidden leading-relaxed">
              <p className="line-clamp-3">{user.about_me}</p>
            </div>
            {/* Survey Options */}
            <div className="h-12 flex flex-wrap gap-2 justify-center items-center overflow-hidden px-2">
              {user.survey_options && user.survey_options.map((option, i) => (
                <button
                  key={i}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSurveyAction && onSurveyAction(option.action);
                  }}
                  className={`px-4 py-2 rounded-full text-caption font-bold whitespace-nowrap backdrop-blur-sm transition-all duration-300 hover:scale-110 transform shadow-lg border-2 ${
                    option.text === "👍 Good" 
                      ? "bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 border-green-400/50 text-white shadow-green-500/25" 
                      : option.text === "🤔 Okay"
                      ? "bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-600 hover:to-amber-600 border-yellow-400/50 text-white shadow-yellow-500/25"
                      : option.text === "😕 Poor"
                      ? "bg-gradient-to-r from-red-500 to-rose-500 hover:from-red-600 hover:to-rose-600 border-red-400/50 text-white shadow-red-500/25"
                      : "bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 border-purple-400/50 text-white shadow-purple-500/25"
                  }`}
                  style={{
                    textShadow: '0 1px 2px rgba(0,0,0,0.3)',
                    boxShadow: option.text === "👍 Good" 
                      ? '0 4px 15px rgba(34, 197, 94, 0.3), 0 0 20px rgba(34, 197, 94, 0.2)' 
                      : option.text === "🤔 Okay"
                      ? '0 4px 15px rgba(234, 179, 8, 0.3), 0 0 20px rgba(234, 179, 8, 0.2)'
                      : option.text === "😕 Poor"
                      ? '0 4px 15px rgba(239, 68, 68, 0.3), 0 0 20px rgba(239, 68, 68, 0.2)'
                      : '0 4px 15px rgba(168, 85, 247, 0.3), 0 0 20px rgba(168, 85, 247, 0.2)'
                  }}
                >
                  {option.text}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-black/20 backdrop-blur-lg rounded-2xl shadow-lg flex flex-col items-center w-[448px] h-[600px] mx-auto transition-all duration-300 p-1 cursor-pointer">
      <div className="bg-black/20 backdrop-blur-lg rounded-2xl flex flex-col items-center w-full h-full p-0 relative">
        {/* Demo Badge */}
        {user.is_real === false && (
          <div className="absolute top-4 right-4 z-10 bg-gradient-to-r from-orange-500 to-red-500 text-white px-3 py-1 rounded-full text-caption font-semibold shadow-lg border border-white/20 backdrop-blur-sm animate-pulse">
            DEMO USER
          </div>
        )}
        
        {/* Founder Badge */}
        {user.role === 'founder' && (
          <div className="absolute top-4 right-4 z-10 bg-gradient-to-r from-purple-600 to-pink-600 text-white px-3 py-1 rounded-full text-caption font-semibold shadow-lg border border-white/20 backdrop-blur-sm animate-pulse">
            FOUNDER
          </div>
        )}
        
        {/* Co-Founder Badge */}
        {user.role === 'co-founder' && (
          <div className="absolute top-4 right-4 z-10 bg-gradient-to-r from-blue-600 to-purple-600 text-white px-3 py-1 rounded-full text-caption font-semibold shadow-lg border border-white/20 backdrop-blur-sm animate-pulse">
            CO-FOUNDER
          </div>
        )}
        
        {/* Photo area: full height with overlay */}
        <div className="w-full h-full flex-shrink-0 flex justify-center items-center">
          <div className="w-full h-full rounded-2xl overflow-hidden bg-gray-100 flex items-center justify-center">
            {user.photos && user.photos.length > 0 ? (
              <img
                src={user.photos[0].image_url}
                alt="User pic"
                className="w-full h-full object-cover object-center bg-gray-100"
                draggable={false}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-400 text-body">No Photo</div>
            )}
          </div>
        </div>
        {/* Info area: overlay on bottom */}
        <div className="absolute bottom-0 left-0 right-0 flex flex-col justify-end w-full h-[210px] px-4 py-3 bg-gradient-to-t from-black/80 via-black/50 to-transparent rounded-b-2xl">
          {/* Name and Instagram - fixed height */}
          <div className="h-8 text-heading text-xl text-white text-center truncate w-full">
            {user.name} {user.instagram && <span className="text-body text-gray-200 font-normal">@{user.instagram}</span>}
          </div>
          {/* About Me - fixed height */}
          <div className="h-[72px] text-body text-gray-100 text-center w-full overflow-hidden leading-relaxed">
            <p className="line-clamp-3">{user.about_me}</p>
          </div>
          {/* Tags - fixed height */}
          {user.vibe_tags && user.vibe_tags.length > 0 && (
            <div className="h-12 flex flex-wrap gap-1.5 justify-center items-center overflow-hidden px-2">
              {user.vibe_tags.map((tag, i) => (
                <span key={i} className="bg-white/20 text-white px-2 py-0.5 rounded-full text-caption font-medium whitespace-nowrap backdrop-blur-sm">{tag}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default UserCard; 