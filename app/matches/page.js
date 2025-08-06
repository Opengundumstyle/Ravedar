'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import { supabase } from '../../lib/supabaseClient';
import UserCard from '../components/UserCard';
import { motion, useAnimation, useMotionValue, useTransform, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import RadarLoader from '../components/RadarLoader';
import DiscordCTA from '../components/DiscordCTA';
import ChatNotificationModal from '../components/ChatNotificationModal';
import FounderMatchModal from '../components/FounderMatchModal';
import { useAuth } from '../components/AuthContext';

export default function MatchesPage() {
  const [matches, setMatches] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [matchOverlay, setMatchOverlay] = useState(false);
  const [loading, setLoading] = useState(true);
  const [eventName, setEventName] = useState("");
  const [showFounderModal, setShowFounderModal] = useState(false);
  const [matchSlogan, setMatchSlogan] = useState("");
  const [showChatModal, setShowChatModal] = useState(false);
  const [matchCount, setMatchCount] = useState(0);
  const [showCTACard, setShowCTACard] = useState(false);
  const [currentCTA, setCurrentCTA] = useState(null);
  const [totalSwipes, setTotalSwipes] = useState(0);
  const [showTooFakeModal, setShowTooFakeModal] = useState(false);
  const [showAuthCTAModal, setShowAuthCTAModal] = useState(false);
  const [showGoodFeedbackModal, setShowGoodFeedbackModal] = useState(false);
  const [showPoorFeedbackModal, setShowPoorFeedbackModal] = useState(false);
  const controls = useAnimation();
  const dragging = useRef(false);
  const [isHovered, setIsHovered] = useState(false);
  const [toggled, setToggled] = useState(false);
  const router = useRouter();
  const { isAuthenticated } = useAuth();

  // Track swipe direction for exit animation
  const [swipeDirection, setSwipeDirection] = useState(null);
  const lastSwipe = useRef({ direction: null, index: null });

  // Place x and rotate in component scope
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-300, 0, 300], [-20, 0, 20]);

  // Reset x when currentIndex changes
  useEffect(() => {
    x.set(0);
  }, [currentIndex]);

  const [currentX, setCurrentX] = useState(0);

  useEffect(() => {
    const unsubscribe = x.on('change', (latest) => {
      setCurrentX(latest);
    });
    return () => unsubscribe();
  }, [x]);

  const slogans = [
    "🎉 {name} is down to vibe with you at {event}!",
    "🎉 You and {name} are vibing at {event} — let's go!",
    "🎉 Looks like {name} is feeling your vibe for {event}!",
    "🎉 You've just synced up with {name} for {event}!",
    "🎉 {name} is ready to light up {event} with you!"
  ];

  useEffect(() => {
    const fetchAndBuffer = async () => {
      const fetchPromise = (async () => {
        // Check if user has proper session data, redirect to home if not
        const userId = localStorage.getItem('user_profile_id');
        const sectionId = localStorage.getItem('user_section_id');
        
        if (!userId || !sectionId) {
          router.push('/');
          return;
        }
        const currentUserId = localStorage.getItem('user_profile_id');
        if (!currentUserId) {
          setMatches([]);
          return;
        }

        const { data: currentUserProfile } = await supabase
          .from('user_profiles')
          .select('id, name, photos:user_photos(image_url, position)')
          .eq('id', currentUserId)
          .single();
        setCurrentUser(currentUserProfile);
        
        const { data: myEvent } = await supabase.from('user_events').select('name, date, city').eq('user_id', currentUserId).single();
        if (!myEvent) {
          // If user doesn't have an event set up, redirect to home to select an event
          router.push('/');
          return;
        }
        setEventName(myEvent.name);

        // Fetch demo (fake) profiles and founder/co-founder profiles
        const { data: fakeProfiles } = await supabase
          .from('user_profiles')
          .select('id, name, instagram, vibe_tags, about_me, is_real, role')
          .or('is_real.eq.false,role.eq.founder,role.eq.co-founder');
        
        // Shuffle fakeProfiles using Fisher-Yates
        function shuffle(array) {
          let m = array.length, t, i;
          while (m) {
            i = Math.floor(Math.random() * m--);
            t = array[m];
            array[m] = array[i];
            array[i] = t;
          }
          return array;
        }
        const shuffledFakeProfiles = shuffle(fakeProfiles || []);
        const allUserIds = [...(shuffledFakeProfiles || [])].map(u => u.id);
        const { data: photos } = await supabase.from('user_photos').select('user_id, image_url, position').in('user_id', allUserIds);
        const mergePhotos = (profiles) => (profiles || []).map(profile => ({ ...profile, photos: (photos || []).filter(p => p.user_id === profile.id).sort((a, b) => a.position - b.position), }));
        const mergedFakeProfiles = mergePhotos(shuffledFakeProfiles);
        
        // Create survey card
        const surveyCard = {
          id: 'survey-card',
          name: "Quick Demo Survey",
          about_me: "How's your matching experience?!",
          is_survey: true,
          survey_options: [
            { text: "👍 Good", action: "good", color: "bg-green-500 hover:bg-green-600" },
            { text: "😕 Poor", action: "poor", color: "bg-red-500 hover:bg-red-600" }
          ],
          photos: [{ image_url: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&h=600&fit=crop&crop=center', position: 0 }]
        };
        
        // Insert survey card at position 15 (after 14 regular cards)
        const finalProfiles = [...mergedFakeProfiles];
        if (finalProfiles.length >= 15) {
          finalProfiles.splice(15, 0, surveyCard);
        } else {
          // If we have fewer than 15 profiles, add survey card at the end
          finalProfiles.push(surveyCard);
        }
        
        setMatches(finalProfiles);
      })();

      const bufferPromise = new Promise(resolve => setTimeout(resolve, 2500));

      await Promise.all([fetchPromise, bufferPromise]);
      setLoading(false);
    };

    fetchAndBuffer();
  }, [router]);

  // AnimatePresence: use a key for the card
  const [cardKey, setCardKey] = useState(0);

  const [matchedUser, setMatchedUser] = useState(null);

  const handleSwipe = async (direction, match) => {
    const currentUserId = localStorage.getItem('user_profile_id');
    if (!match || !currentUserId) return;
    
    // Handle survey cards - let them go through normal swipe animation
    if (match.is_survey) {
      // Survey cards don't need database interaction, just move to next
      setCurrentIndex(i => i + 1);
      return;
    }
    
    await supabase.from('likes').insert({
      from_user_id: currentUserId,
      to_user_id: match.id,
      liked: direction === 'right',
    });
    if (direction === 'right' && match.role !== "founder" && match.role !== "co-founder") {
      setMatchOverlay(true);
      // Don't auto-close the match overlay - let user click "Keep Swiping"
    }
    
    // Increment total swipes
    const newTotalSwipes = totalSwipes + 1;
    setTotalSwipes(newTotalSwipes);
  };

  const handleKeepSwiping = () => {
    setMatchOverlay(false);
    // Don't increment currentIndex here since it's already incremented in onExitComplete
    setToggled(false);
  };

  const handleStartChat = () => {
    setShowChatModal(true);
  };

  const handleSurveyAction = (action) => {
    // Handle different survey responses
    switch (action) {
      case 'good':
        setShowGoodFeedbackModal(true);
        break;
      case 'okay':
        alert('Thanks for your honest feedback! We\'ll keep improving! 💪');
        break;
      case 'poor':
        setShowPoorFeedbackModal(true);
        break;
      case 'too fake':
        setShowTooFakeModal(true);
        return; // Don't move to next card yet
    }
    
    // Instead of directly moving to next card, trigger swipe animation
    // This will make the survey card animate out smoothly
    setSwipeDirection('right');
    lastSwipe.current = { direction: 'right', index: currentIndex };
  };

  const handleAuthCTAAction = async (action) => {
    if (action === 'google_auth') {
      // TODO: Implement Google OAuth
      alert('Google OAuth coming soon! 🔐');
      setShowAuthCTAModal(false);
      setCurrentIndex(i => i + 1);
    } else if (action === 'facebook_auth') {
      // TODO: Implement Facebook OAuth
      alert('Facebook OAuth coming soon! 🔐');
      setShowAuthCTAModal(false);
      setCurrentIndex(i => i + 1);
    } else if (action === 'apple_auth') {
      // TODO: Implement Apple OAuth
      alert('Apple OAuth coming soon! 🔐');
      setShowAuthCTAModal(false);
      setCurrentIndex(i => i + 1);
    } else if (action === 'continue_demo') {
      setShowAuthCTAModal(false);
      setMatchOverlay(false); // Close the match overlay
    } else if (action === 'signup') {
      // Navigate to signup page
      router.push('/signup');
      setShowAuthCTAModal(false);
    }
  };

  const swipeLabel = useMemo(() => {
    if (currentX > 40) return { text: "Yes :D", position: "left" };
    if (currentX < -40) return { text: "Nah :/", position: "right" };
    return null;
  }, [currentX]);

  // Memoize the New Search button to prevent re-renders
  const newSearchButton = useMemo(() => (
    <motion.button
      key="new-search-button"
      onClick={() => router.push("/")}
      className="fixed top-4 left-4 z-[60] flex items-center gap-2 px-3 py-2 bg-white rounded-full text-gray-800 hover:bg-gray-100 shadow-md transition-all duration-200 sm:px-4 sm:py-2"
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
      </svg>
      <span className="text-sm font-medium hidden sm:inline">Back</span>
    </motion.button>
  ), [router]);

  // Memoize the User Panel button to prevent re-renders
  const userPanelButton = useMemo(() => (
    <motion.button
      key="user-panel-button"
      onClick={() => router.push("/user-panel")}
      className="fixed top-4 right-4 z-[60] flex items-center gap-2 px-3 py-2 bg-black/80 backdrop-blur-md border border-white/30 rounded-full text-white hover:text-white hover:bg-black/90 shadow-xl transition-all duration-300 shadow-lg sm:px-4 sm:py-2"
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
      <span className="text-sm font-medium hidden sm:inline">Profile</span>
    </motion.button>
  ), [router]);

  if (loading) {
    return <RadarLoader eventName={eventName} />;
  }

  if (currentIndex >= matches.length) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 text-white overflow-hidden p-4">
        <motion.div 
          className="text-center flex flex-col items-center"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="text-6xl mb-4">✨</div>
          <h2 className="text-display text-3xl text-white mb-2">That's Everyone For Now!</h2>
          <p className="text-body-large text-white/80 mb-8 max-w-md leading-relaxed">
            You've seen all potential ravebaes for <span className="text-heading text-white">{eventName}</span>. Check back later for new people!
          </p>
          <motion.button
            className="w-full max-w-xs py-3 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 text-white font-semibold text-lg hover:scale-105 transform transition-transform duration-200 animate-button-glow shadow-lg"
            onClick={() => router.push('/')}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            Find a New Vibe
          </motion.button>
        </motion.div>
      </div>
    );
  }

  const match = matches[currentIndex];

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 py-4 px-4 sm:py-8 sm:px-2 overflow-hidden relative">
      {newSearchButton}
      {isAuthenticated && userPanelButton}
      <div className="w-full max-w-lg md:max-w-[480px] flex flex-col items-center justify-center min-h-[80vh] sm:min-h-[70vh] relative" style={{ minHeight: 'calc(100vh - 2rem)' }}>
        {eventName && match && (
          <div className="mb-4 sm:mb-8 w-full flex flex-col md:flex-row items-center text-center md:text-left space-y-1 md:space-y-0 px-2">
            <span className="text-body text-white/70">You both are going to&nbsp;</span>
            <span className="text-heading text-lg sm:text-xl text-white truncate max-w-[280px] md:max-w-[300px]">{eventName}</span>
          </div>
        )}
        <div className="relative w-full h-[600px] flex items-center justify-center mb-4 sm:mb-8">
          {/* Next card: always present, never animates */}
          {matches[currentIndex + 1] && (
            <div
              key={`next-${matches[currentIndex + 1].id}`}
              className="absolute w-full h-full flex items-center justify-center pointer-events-none"
              style={{ zIndex: 0, top: 0, left: 0 }}
            >
              <UserCard user={matches[currentIndex + 1]} onSurveyAction={handleSurveyAction} />
            </div>
          )}
          {/* Top card: only rendered if swipeDirection is null, animates out on swipe */}
          <AnimatePresence initial={false} onExitComplete={() => {
            if (lastSwipe.current.direction) {
              const swipedMatch = matches[lastSwipe.current.index];
              handleSwipe(lastSwipe.current.direction, swipedMatch);
              if (lastSwipe.current.direction === 'right') {
                setMatchedUser(swipedMatch);
                const sloganTemplate = slogans[Math.floor(Math.random() * slogans.length)];
                const slogan = sloganTemplate
                  .replace('{name}', swipedMatch.name)
                  .replace('{event}', eventName);
                setMatchSlogan(slogan);
                if (swipedMatch.role === "founder" || swipedMatch.role === "co-founder") {
                  setShowFounderModal(true);
                  // Don't show regular match overlay for founders
                } else {
                  setMatchOverlay(true);
                  setMatchCount(prev => prev + 1);
                }
              }
              setCurrentIndex(i => i + 1);
              setSwipeDirection(null);
              setToggled(false);
              lastSwipe.current = { direction: null, index: null };
            }
          }}>
            {matches[currentIndex] && swipeDirection === null && (
              <motion.div
                key={`top-${currentIndex}`}
                className="absolute w-full h-full flex items-center justify-center"
                style={{ zIndex: 1, x, rotate, scale: 1, top: 0, left: 0 }}
                initial={{ scale: 1, y: 0, opacity: 1 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                exit={lastSwipe.current.direction === 'right' ? { x: 500, opacity: 0 } : lastSwipe.current.direction === 'left' ? { x: -500, opacity: 0 } : { opacity: 0 }}
                transition={{ type: 'spring', stiffness: 200, damping: 20, opacity: { duration: 0.35 } }}
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                onDragEnd={(_, info) => {
                  if (info.offset.x > 120) {
                    x.set(0);
                    setSwipeDirection('right');
                    lastSwipe.current = { direction: 'right', index: currentIndex };
                  } else if (info.offset.x < -120) {
                    x.set(0);
                    setSwipeDirection('left');
                    lastSwipe.current = { direction: 'left', index: currentIndex };
                  }
                }}
              >
                {swipeLabel && (
                  <div
                    className={`absolute ${swipeLabel.position === 'left' ? 'left-4' : 'right-4'} px-6 py-3 rounded-full text-lg font-bold
                      ${swipeLabel.position === 'left'
                        ? 'bg-black/20 text-white backdrop-blur-sm'
                        : 'bg-gray-200 text-gray-700 border-2 border-gray-400'}
                      transition-all duration-200 pointer-events-none select-none z-20 transform-gpu`}
                    style={{
                      top: '25%',
                      opacity: currentX > 0 ? 1 : Math.min(Math.abs(currentX) / 60, 1),
                      transform: `rotate(${currentX > 0 ? 8 : -8}deg) scale(${Math.min(Math.abs(currentX) / 100 + 0.8, 1.2)}) ${currentX > 0 ? 'rotate(-12deg)' : 'rotate(12deg)'}`,
                      boxShadow: currentX > 0 ? '0 0 5px #ff69b4, 0 0 10px #ff69b4, 0 0 15px #ff69b4, 0 0 20px #ff69b4, 0 0 35px #ff69b4, 0 0 40px #ff69b4, inset 0 0 20px rgba(255, 105, 180, 0.3)' : '0 4px 12px rgba(0, 0, 0, 0.3)',
                      textShadow: currentX > 0 ? '0 0 5px #fff, 0 0 10px #fff, 0 0 15px #fff, 0 0 20px #ff69b4, 0 0 35px #ff69b4, 0 0 40px #ff69b4, 0 0 55px #ff69b4, 0 0 75px #ff69b4' : undefined,
                      filter: currentX > 0 ? 'blur(0.3px)' : undefined,
                      border: currentX > 0 ? '2px solid #ff69b4' : undefined,
                      background: currentX > 0 ? 'linear-gradient(135deg, rgba(255, 105, 180, 0.1) 0%, rgba(255, 105, 180, 0.05) 50%, rgba(255, 105, 180, 0.1) 100%)' : undefined,
                      borderRadius: currentX > 0 ? '25px' : undefined,
                    }}
                  >
                    {currentX > 0 ? (
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold tracking-wide">
                          {swipeLabel.text}
                        </span>
                      </div>
                    ) : (
                      <span className="font-semibold">
                        {swipeLabel.text}
                      </span>
                    )}
                  </div>
                )}
                <UserCard user={matches[currentIndex]} onSurveyAction={handleSurveyAction} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
       
        {/* Swipe instruction text - moved outside card container */}
        <div className="flex justify-center mt-2 sm:mt-4 px-4">
          <div className="relative">
            {/* Main text with simple glow */}
            <div className="text-body text-white text-sm sm:text-base font-bold tracking-wider uppercase relative z-10 px-2">
              <span className="relative">
                <span className="absolute inset-0 bg-pink-500 blur-sm opacity-50"></span>
                <span className="relative text-white drop-shadow-lg">
                  SWIPE LEFT OR RIGHT
                </span>
              </span>
            </div>
            
            {/* Simple angular accent lines */}
            <div className="absolute -left-1 top-1/2 transform -translate-y-1/2 w-2 h-0.5 bg-pink-500"></div>
            <div className="absolute -right-1 top-1/2 transform -translate-y-1/2 w-2 h-0.5 bg-pink-500"></div>
          </div>
        </div>
      </div>

      <FounderMatchModal 
        isOpen={showFounderModal} 
        onClose={() => { setShowFounderModal(false); setToggled(false); }} 
        matchedUser={matchedUser} 
        currentUser={currentUser} 
      />
      <ChatNotificationModal 
        isOpen={showChatModal} 
        onClose={() => { setShowChatModal(false); setMatchOverlay(false); setCurrentIndex(i => i + 1); setToggled(false); }} 
      />

      {/* Add other modals here - Too Fake, Good Feedback, Poor Feedback, Auth CTA */}
      {/* These would be the same as in the original file */}
    </div>
  );
} 