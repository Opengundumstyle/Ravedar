import { useEffect, useState, useRef, useMemo } from 'react';
import { supabase } from './supabaseClient';
import UserCard from './UserCard';
import { motion, useAnimation, useMotionValue, useTransform, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import RadarLoader from './RadarLoader';
import DiscordCTA from './DiscordCTA';
import ChatNotificationModal from './ChatNotificationModal';

function Matches() {
  const [matches, setMatches] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showMatch, setShowMatch] = useState(false);
  const [matchOverlay, setMatchOverlay] = useState(false);
  const [loading, setLoading] = useState(true);
  const [eventName, setEventName] = useState("");
  const [matchSlogan, setMatchSlogan] = useState("");
  const [showChatModal, setShowChatModal] = useState(false);
  const [matchCount, setMatchCount] = useState(0);
  const controls = useAnimation();
  const dragging = useRef(false);
  const [isHovered, setIsHovered] = useState(false);
  const [toggled, setToggled] = useState(false);
  const navigate = useNavigate();

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
        // All the existing data fetching logic goes here
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
        
        // ... (the rest of your fetch logic from the original useEffect)
        const { data: myEvent } = await supabase.from('user_events').select('name, date, city').eq('user_id', currentUserId).single();
        if (!myEvent) {
          setMatches([]);
          return;
        }
        setEventName(myEvent.name);
        let query = supabase.from('user_events').select('user_id').eq('name', myEvent.name.trim()).eq('city', myEvent.city.trim()).neq('user_id', currentUserId);
        if (myEvent.date) {
          query = query.eq('date', myEvent.date);
        } else {
          query = query.is('date', null);
        }
        const { data: realUserEvents } = await query;
        const realUserIds = (realUserEvents || []).map(u => u.user_id);
        let realProfiles = [];
        if (realUserIds.length > 0) {
          const { data } = await supabase.from('user_profiles').select('id, name, instagram, vibe_tags, about_me, is_real').in('id', realUserIds).eq('is_real', true);
          realProfiles = data || [];
        }
        // Fetch demo (fake) profiles
        const { data: fakeProfiles } = await supabase.from('user_profiles').select('id, name, instagram, vibe_tags, about_me, is_real').eq('is_real', false);
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
        const allUserIds = [...(realProfiles || []), ...(shuffledFakeProfiles || [])].map(u => u.id);
        const { data: photos } = await supabase.from('user_photos').select('user_id, image_url, position').in('user_id', allUserIds);
        const mergePhotos = (profiles) => (profiles || []).map(profile => ({ ...profile, photos: (photos || []).filter(p => p.user_id === profile.id).sort((a, b) => a.position - b.position), }));
        const mergedRealProfiles = mergePhotos(realProfiles);
        const mergedFakeProfiles = mergePhotos(shuffledFakeProfiles);
        setMatches([...mergedRealProfiles, ...mergedFakeProfiles]);
      })();

      const bufferPromise = new Promise(resolve => setTimeout(resolve, 2500));

      await Promise.all([fetchPromise, bufferPromise]);
      setLoading(false);
    };

    fetchAndBuffer();
  }, []);

  // AnimatePresence: use a key for the card
  const [cardKey, setCardKey] = useState(0);

  const [matchedUser, setMatchedUser] = useState(null);

  const handleSwipe = async (direction, match) => {
    const currentUserId = localStorage.getItem('user_profile_id');
    if (!match || !currentUserId) return;
    await supabase.from('likes').insert({
      from_user_id: currentUserId,
      to_user_id: match.id,
      liked: direction === 'right',
    });
    if (direction === 'right') {
      setShowMatch(true);
      setTimeout(() => setShowMatch(false), 1500);
    }
  };

  const handleKeepSwiping = () => {
    setMatchOverlay(false);
    setShowMatch(false);
    setCurrentIndex(i => i + 1);
    setToggled(false);
  };

  const handleStartChat = () => {
    setShowChatModal(true);
  };

  const swipeLabel = useMemo(() => {
    if (currentX > 40) return { text: "I wanna dance with this person :)", position: "left" };
    if (currentX < -40) return { text: "I don't feel the vibe :(", position: "right" };
    return null;
  }, [currentX]);

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
          <h2 className="text-3xl font-bold text-white mb-2">That's Everyone For Now!</h2>
          <p className="text-lg text-purple-200 mb-8 max-w-md">
            You've seen all potential ravebaes for <span className="font-semibold text-white">{eventName}</span>. Check back later for new people!
          </p>
          <motion.button
            className="w-full max-w-xs py-3 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 text-white font-semibold text-lg hover:scale-105 transform transition-transform duration-200 animate-button-glow shadow-lg"
            onClick={() => navigate('/')}
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

  const overlayVariants = {
    hidden: { opacity: 0, scale: 0.8 },
    visible: { 
      opacity: 1, 
      scale: 1,
      transition: { 
        when: "beforeChildren",
        staggerChildren: 0.1,
        duration: 0.3
      }
    },
    exit: { 
      opacity: 0, 
      scale: 0.8,
      transition: { duration: 0.3 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 }
  };

  return (
    <div className="h-screen flex items-center justify-center bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 py-8 px-2 overflow-hidden relative">
      {/* Back to Home Button */}
      <motion.button
        onClick={() => navigate("/")}
        className="fixed top-4 left-4 z-[60] flex items-center gap-2 px-4 py-2 bg-black/80 backdrop-blur-md border border-white/30 rounded-full text-white hover:text-white hover:bg-black/90 shadow-xl transition-all duration-300 shadow-lg"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.5 }}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        <span className="text-sm font-medium">New Search</span>
      </motion.button>
      <div className="w-full max-w-lg md:max-w-[480px] flex flex-col items-center justify-center min-h-[70vh] relative" style={{ minHeight: 600 }}>
        {eventName && match && (
          <div className="mb-8 w-full flex flex-col md:flex-row items-center text-center md:text-left space-y-1 md:space-y-0">
            <span className="text-sm md:text-xl font-medium text-gray-300">You both are going to&nbsp;</span>
            <span className="text-lg md:text-2xl font-bold text-white truncate max-w-[280px] md:max-w-[300px]">{eventName}</span>
          </div>
        )}
        <div className="relative w-full h-[600px] flex items-center justify-center">
          {showMatch && (
            <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-[60]">
              <div className="bg-white p-8 rounded shadow text-2xl font-bold text-green-600">It's a match!</div>
            </div>
          )}
          {/* Next card: always present, never animates */}
          {matches[currentIndex + 1] && (
            <div
              key={`next-${matches[currentIndex + 1].id}`}
              className="absolute w-full h-full flex items-center justify-center pointer-events-none"
              style={{ zIndex: 0, top: 0, left: 0 }}
            >
              <UserCard user={matches[currentIndex + 1]} />
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
                setMatchOverlay(true);
                setMatchCount(prev => prev + 1);
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
                style={{ zIndex: 1, x, rotate, top: 0, left: 0 }}
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
                    className={`absolute ${swipeLabel.position === 'left' ? 'top-[200px] left-4' : 'top-4 right-4'} px-6 py-3 rounded-full text-lg font-bold shadow-lg
                      ${swipeLabel.position === 'left'
                        ? 'bg-gradient-to-r from-green-400/90 to-emerald-500/90 text-white border border-green-300/50 shadow-[0_0_20px_rgba(34,197,94,0.3)] backdrop-blur-md'
                        : 'bg-gradient-to-r from-gray-100/90 to-gray-200/90 text-gray-800 border border-gray-300/50 shadow-[0_0_20px_rgba(156,163,175,0.3)] backdrop-blur-md'}
                      transition-all duration-300 pointer-events-none select-none z-20`}
                    style={{
                      opacity: Math.min(Math.abs(currentX) / 60, 1),
                      transform: `rotate(${currentX > 0 ? 8 : -8}deg)`
                    }}
                  >
                    <span className="relative z-10">{swipeLabel.text}</span><div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse"></div>
                  </div>
                )}
                <UserCard user={matches[currentIndex]} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
       
       <AnimatePresence>
        {matchOverlay && matchedUser && currentUser && (
          <motion.div 
            className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/50 backdrop-blur-lg p-4"
            variants={overlayVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <motion.div 
              variants={itemVariants}
              className="text-5xl md:text-7xl font-bold text-white text-center"
              style={{
                textShadow: '0 0 10px #fff, 0 0 20px #fff, 0 0 30px #e60073, 0 0 40px #e60073, 0 0 50px #e60073, 0 0 60px #e60073, 0 0 70px #e60073'
              }}
            >
              It's a Vibe!
            </motion.div>

            <motion.div variants={itemVariants} className="my-6 flex items-center justify-center -space-x-8">
              <div className="w-32 h-32 md:w-40 md:h-40 rounded-full overflow-hidden border-4 border-pink-500 shadow-lg" style={{ boxShadow: '0 0 20px #e60073' }}>
                {currentUser.photos && currentUser.photos.length > 0 ? (
                  <img src={currentUser.photos[0].image_url} alt="You" className="w-full h-full object-cover" />
                ) : <div className="w-full h-full bg-gray-700" />}
              </div>
              <div className="w-32 h-32 md:w-40 md:h-40 rounded-full overflow-hidden border-4 border-purple-500 shadow-lg" style={{ boxShadow: '0 0 20px #a855f7' }}>
                {matchedUser.photos && matchedUser.photos.length > 0 ? (
                  <img src={matchedUser.photos[0].image_url} alt={matchedUser.name} className="w-full h-full object-cover" />
                ) : <div className="w-full h-full bg-gray-700" />}
              </div>
            </motion.div>

            <motion.p variants={itemVariants} className="text-lg md:text-xl font-semibold text-center text-white/90 mb-6 max-w-md">
              {matchSlogan}
            </motion.p>
          
            <motion.div variants={itemVariants} className="flex flex-col sm:flex-row gap-4 w-full max-w-sm">
              {matchCount <= 2 ? (
                <button
                  onClick={handleStartChat}
                  className="flex-1 text-center py-3 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 text-white font-bold text-lg hover:scale-105 transform transition-transform duration-200 animate-button-glow shadow-lg"
                >
                  Start Chat
                </button>
              ) : (
                <a 
                  href="https://discord.gg/hzGwGe5y" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="flex-1 text-center py-3 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-bold text-lg hover:scale-105 transform transition-transform duration-200 animate-button-glow shadow-lg"
                >
                  Join Discord
                </a>
              )}
              <button
                onClick={handleKeepSwiping}
                className="flex-1 text-center py-3 rounded-full bg-white/20 backdrop-blur-sm border border-white/30 text-white font-semibold text-lg hover:bg-white/30 transform transition-colors duration-200 shadow-md"
              >
                Keep Swiping
              </button>
            </motion.div>
            {matchCount > 2 && <DiscordCTA />}
          </motion.div>
        )}
      
         </AnimatePresence>

        <div className="flex justify-between mt-4">
          <span className="text-gray-300">Swipe left or right</span>
        </div>
      </div>

      <ChatNotificationModal 
        isOpen={showChatModal} 
        onClose={() => { setShowChatModal(false); setMatchOverlay(false); setShowMatch(false); setCurrentIndex(i => i + 1); setToggled(false); }} 
      />
    </div>
  );
}

export default Matches; 