import { useEffect, useState, useRef, useMemo } from 'react';
import { supabase } from './supabaseClient';
import UserCard from './UserCard';
import { motion, useAnimation, useMotionValue, useTransform, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import RadarLoader from './RadarLoader';
import DiscordCTA from './DiscordCTA';
import ChatNotificationModal from './ChatNotificationModal';
import FounderMatchModal from './FounderMatchModal';
import { useAuth } from './AuthContext';

function Matches() {
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
  const navigate = useNavigate();
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
        // All the existing data fetching logic goes here
        // Check if user has proper session data, redirect to home if not
        const userId = localStorage.getItem('user_profile_id');
        const sectionId = localStorage.getItem('user_section_id');
        
        if (!userId || !sectionId) {
          navigate('/');
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
        
        // ... (the rest of your fetch logic from the original useEffect)
        const { data: myEvent } = await supabase.from('user_events').select('name, date, city').eq('user_id', currentUserId).single();
        if (!myEvent) {
          // If user doesn't have an event set up, redirect to home to select an event
          navigate('/');
          return;
        }
        setEventName(myEvent.name);
        // --- Real users query (commented out for now, re-enable when you want to include real users) ---
        // let query = supabase.from('user_events').select('user_id').eq('name', myEvent.name.trim()).eq('city', myEvent.city.trim()).neq('user_id', currentUserId);
        // if (myEvent.date) {
        //   query = query.eq('date', myEvent.date);
        // } else {
        //   query = query.is('date', null);
        // }
        // const { data: realUserEvents } = await query;
        // const realUserIds = (realUserEvents || []).map(u => u.user_id);
        // let realProfiles = [];
        // if (realUserIds.length > 0) {
        //   const { data } = await supabase.from('user_profiles').select('id, name, instagram, vibe_tags, about_me, is_real, role').in('id', realUserIds).eq('is_real', true);
        //   realProfiles = data || [];
        // }
        //
        // const allUserIds = [...(realProfiles || []), ...(shuffledFakeProfiles || [])].map(u => u.id);
        // const mergedRealProfiles = mergePhotos(realProfiles);
        // setMatches([...mergedRealProfiles, ...mergedFakeProfiles]);
        // --- End real users query ---

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
  }, []);

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

  const getCTAContent = (type) => {
    switch (type) {
      case 'rate':
        return {
          title: "Rate Our Demo",
          subtitle: "What's your experience with Ravedar so far?",
          actions: [
            { text: "👍 Love it!", action: "positive", color: "bg-green-500 hover:bg-green-600" },
            { text: "👎 Needs work", action: "negative", color: "bg-red-500 hover:bg-red-600" },
            { text: "🤔 Need more time", action: "skip", color: "bg-gray-500 hover:bg-gray-600" }
          ]
        };
      case 'founder':
        return {
          title: "Why Build Another Dating App?",
          subtitle: "Hear our founder's story about revolutionizing the rave scene",
          actions: [
            { text: "Tell me more", action: "learn", color: "bg-purple-500 hover:bg-purple-600" },
            { text: "Skip for now", action: "skip", color: "bg-gray-500 hover:bg-gray-600" }
          ]
        };
      case 'signup':
        return {
          title: "Ready for the Next Step?",
          subtitle: "Be the first to match with fellow ravers at soft launch",
          actions: [
            { text: "Sign me up!", action: "signup", color: "bg-pink-500 hover:bg-pink-600" },
            { text: "Maybe later", action: "skip", color: "bg-gray-500 hover:bg-gray-600" }
          ]
        };
      case 'influencer':
        return {
          title: "Collaborate & Join Our Journey",
          subtitle: "Be our lifestyle influencer if you truly think this will change the raving scene",
          actions: [
            { text: "I'm interested", action: "influencer", color: "bg-indigo-500 hover:bg-indigo-600" },
            { text: "Not for me", action: "skip", color: "bg-gray-500 hover:bg-gray-600" }
          ]
        };
      default:
        return null;
    }
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
      navigate('/signup');
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
      onClick={() => navigate("/")}
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
  ), [navigate]);

  // Memoize the User Panel button to prevent re-renders
  const userPanelButton = useMemo(() => (
    <motion.button
      key="user-panel-button"
      onClick={() => navigate("/user-panel")}
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
  ), [navigate]);

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
       
       <AnimatePresence>
        {matchOverlay && matchedUser && currentUser && (
          <motion.div 
            className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/50 backdrop-blur-lg p-4 sm:p-6"
            variants={overlayVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <motion.div 
              variants={itemVariants}
              className="text-display text-4xl sm:text-5xl md:text-7xl font-bold text-white text-center px-2"
              style={{
                textShadow: '0 0 10px #fff, 0 0 20px #fff, 0 0 30px #e60073, 0 0 40px #e60073, 0 0 50px #e60073, 0 0 60px #e60073, 0 0 70px #e60073'
              }}
            >
              It's a Vibe!
            </motion.div>

            <motion.div variants={itemVariants} className="my-4 sm:my-6 flex items-center justify-center -space-x-4 sm:-space-x-8">
              <div className="w-32 h-32 sm:w-36 sm:h-36 md:w-44 md:h-44 rounded-full overflow-hidden border-4 border-pink-500 shadow-lg" style={{ boxShadow: '0 0 20px #e60073' }}>
                {currentUser.photos && currentUser.photos.length > 0 ? (
                  <img src={currentUser.photos[0].image_url} alt="You" className="w-full h-full object-cover" />
                ) : <div className="w-full h-full bg-gray-700" />}
              </div>
              <div className="w-32 h-32 sm:w-36 sm:h-36 md:w-44 md:h-44 rounded-full overflow-hidden border-4 border-purple-500 shadow-lg" style={{ boxShadow: '0 0 20px #a855f7' }}>
                {matchedUser.photos && matchedUser.photos.length > 0 ? (
                  <img src={matchedUser.photos[0].image_url} alt={matchedUser.name} className="w-full h-full object-cover" />
                ) : <div className="w-full h-full bg-gray-700" />}
              </div>
            </motion.div>

            <motion.p variants={itemVariants} className="text-body text-sm sm:text-body-large text-white/90 mb-4 sm:mb-6 max-w-md px-4 text-center">
              {matchSlogan}
            </motion.p>
          
            <motion.div variants={itemVariants} className="flex flex-col sm:flex-row gap-3 sm:gap-4 w-full max-w-sm px-4">
              {matchCount === 1 ? (
                <button
                  onClick={() => {
                    handleStartChat();
                  }}
                  className="flex-1 text-center py-3 px-4 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 text-white font-semibold text-base sm:text-lg hover:scale-105 transform transition-transform duration-200 animate-button-glow shadow-lg"
                >
                  Start Chat
                </button>
              ) : matchCount === 2 ? (
                <a 
                  href="https://discord.gg/R3VYAUzWwd" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="flex-1 text-center py-3 px-4 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-semibold text-base sm:text-lg hover:scale-105 transform transition-transform duration-200 animate-button-glow shadow-lg"
                >
                  Join Discord
                </a>
              ) : (
                <button
                  onClick={() => {
                    // Show signup modal instead of alert for disabled chat
                    setShowAuthCTAModal(true);
                  }}
                  className="flex-1 text-center py-3 px-4 rounded-full bg-gradient-to-r from-gray-400 to-gray-500 text-white font-semibold text-base sm:text-lg hover:scale-105 transform transition-transform duration-200 shadow-lg cursor-pointer"
                  title="Chat feature coming soon..."
                >
                  Start Chat
                </button>
              )}
              <button
                onClick={handleKeepSwiping}
                className="flex-1 text-center py-3 px-4 rounded-full bg-white/20 backdrop-blur-sm border border-white/30 text-white font-semibold text-base sm:text-lg hover:bg-white/30 transform transition-colors duration-200 shadow-md"
              >
                Keep Swiping
              </button>
            </motion.div>
            
            {/* Feedback text for Discord match */}
            {matchCount === 2 && (
              <motion.div variants={itemVariants} className="mt-4 text-center px-4">
                <p className="text-body text-sm sm:text-base text-white/70 leading-relaxed max-w-xs mx-auto">
                Join Discord to give instant feedback,<br />
                your opinion matters to us 
                
                </p>
              </motion.div>
            )}
            
            {/* Social Media Icon - Only show for 3rd match onwards, alternating */}
            {matchCount > 2 && (
              <motion.div variants={itemVariants} className="mt-4 text-center px-4">
                <p className="text-body text-sm sm:text-base text-white/70 mb-3">
                  {((matchCount - 3) % 2 === 1) ? 'join us at' : 'follow us at'}
                </p>
                <div className="flex justify-center gap-3 sm:gap-4">
                  {(() => {
                    const isDiscordCycle = (matchCount - 3) % 2 === 1;
                    
                    if (isDiscordCycle) {
                      // Discord cycle
                      return (
                        <a
                          href="https://discord.gg/R3VYAUzWwd"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-white hover:scale-110 transform transition-transform duration-200 shadow-lg"
                        >
                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276c-.598.3428-1.2205.6447-1.8733.8923a.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5218 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"/>
                          </svg>
                        </a>
                      );
                    } else {
                      // Instagram, TikTok, Facebook cycle
                      return (
                        <>
                          <a
                            href="https://instagram.com/ravedar.app"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-10 h-10 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 flex items-center justify-center text-white hover:scale-110 transform transition-transform duration-200 shadow-lg"
                          >
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                            </svg>
                          </a>
                          <a
                            href="https://www.tiktok.com/@ravedar.app"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-10 h-10 rounded-full bg-black flex items-center justify-center text-white hover:scale-110 transform transition-transform duration-200 shadow-lg"
                          >
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-.88-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
                            </svg>
                          </a>
                          <a
                            href="https://facebook.com/ravedar.app"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white hover:scale-110 transform transition-transform duration-200 shadow-lg"
                          >
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                            </svg>
                          </a>
                        </>
                      );
                    }
                  })()}
                </div>
              </motion.div>
            )}

          </motion.div>
        )}
      
         </AnimatePresence>

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
      />      <ChatNotificationModal 
        isOpen={showChatModal} 
        onClose={() => { setShowChatModal(false); setMatchOverlay(false); setCurrentIndex(i => i + 1); setToggled(false); }} 
      />

      {/* Too Fake Modal */}
      <AnimatePresence>
        {showTooFakeModal && (
          <motion.div
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="bg-black/90 backdrop-blur-md rounded-2xl p-8 w-full max-w-md mx-4 shadow-2xl border border-white/20"
              initial={{ scale: 0.8, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.8, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
            >
              <div className="text-center">
              
                <h2 className="text-heading text-2xl text-white mb-4">
                  Chill... it's only the Demo
                </h2>
                <p className="text-body text-white/70 leading-relaxed mb-6">
                  Swipe more we have a surprise for you ;)
                </p>
                <motion.button
                  onClick={() => {
                    setShowTooFakeModal(false);
                    setCurrentIndex(i => i + 1); // Move to next card after closing modal
                  }}
                  className="w-full py-3 px-6 rounded-full bg-gradient-to-r from-purple-500 to-pink-600 text-white font-bold text-lg hover:scale-105 transform transition-transform duration-200 shadow-lg"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  Got it 😄
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Good Feedback Modal */}
      <AnimatePresence>
        {showGoodFeedbackModal && (
          <motion.div
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="bg-black/90 backdrop-blur-md rounded-2xl p-8 w-full max-w-md mx-4 shadow-2xl border border-white/20"
              initial={{ scale: 0.8, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.8, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
            >
              <div className="text-center">
                <div className="text-4xl mb-4">👍</div>
                <h2 className="text-heading text-2xl text-white mb-4">
                  Thanks for the feedback!
                </h2>
                <p className="text-body text-white/70 leading-relaxed mb-6">
                  We're glad you like it! Your feedback helps us improve the experience for everyone.
                </p>
                <motion.button
                  onClick={() => {
                    setShowGoodFeedbackModal(false);
                    setCurrentIndex(i => i + 1); // Move to next card after closing modal
                  }}
                  className="w-full py-3 px-6 rounded-full bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold text-lg hover:scale-105 transform transition-transform duration-200 shadow-lg"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  Continue Swiping ✨
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Poor Feedback Modal */}
      <AnimatePresence>
        {showPoorFeedbackModal && (
          <motion.div
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="bg-black/90 backdrop-blur-md rounded-2xl p-8 w-full max-w-md mx-4 shadow-2xl border border-white/20"
              initial={{ scale: 0.8, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.8, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
            >
              <div className="text-center">
                <div className="text-4xl mb-4">📝</div>
                <h2 className="text-heading text-2xl text-white mb-4">
                  We appreciate your honesty!
                </h2>
                <p className="text-body text-white/70 leading-relaxed mb-6">
                  Your feedback is valuable to us. Please join our Discord to give detailed feedback and help us improve!
                </p>
                <div className="space-y-3">
                  <motion.a
                    href="https://discord.gg/R3VYAUzWwd"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full py-3 px-6 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-bold text-lg hover:scale-105 transform transition-transform duration-200 shadow-lg"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    Join Discord 💬
                  </motion.a>
                  <motion.button
                    onClick={() => {
                      setShowPoorFeedbackModal(false);
                      setCurrentIndex(i => i + 1); // Move to next card after closing modal
                    }}
                    className="w-full py-3 px-6 rounded-full bg-white/20 backdrop-blur-sm border border-white/30 text-white font-semibold text-lg hover:bg-white/30 transform transition-colors duration-200 shadow-md"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    Continue Swiping
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Auth CTA Modal */}
      <AnimatePresence>
        {showAuthCTAModal && (
          <motion.div
            className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="bg-black/95 backdrop-blur-lg rounded-2xl sm:rounded-3xl p-6 sm:p-8 w-full max-w-sm sm:max-w-lg mx-2 sm:mx-4 shadow-2xl border border-white/30 max-h-[90vh] overflow-y-auto"
              initial={{ scale: 0.8, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.8, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
            >
              <div className="text-center">
                
                {/* Subtitle */}
                <h3 className="text-heading text-lg sm:text-xl text-purple-300 mb-3 sm:mb-4">
                  Ready for the next step?
                </h3>
                
                {/* Description */}
                <p className="text-body text-sm sm:text-lg text-white/70 leading-relaxed mb-6 sm:mb-8">
                  Upload your photos and connect with real ravers at your events!
                </p>
                
                {/* Main Sign Up Button */}
                <motion.button
                  onClick={() => handleAuthCTAAction('signup')}
                  className="w-full py-3 sm:py-4 px-6 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 text-white font-bold text-lg sm:text-xl hover:scale-105 transform transition-transform duration-200 shadow-lg border border-pink-400/30 mb-4 sm:mb-6"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  style={{
                    boxShadow: '0 0 20px rgba(236, 72, 153, 0.3), 0 0 40px rgba(168, 85, 247, 0.2)'
                  }}
                >
                  <div className="flex items-center justify-center gap-2 sm:gap-3">
                    <span className="text-xl sm:text-2xl">✨</span>
                    <span>Sign Up</span>
                    <span className="text-xl sm:text-2xl">✨</span>
                  </div>
                </motion.button>
                
                {/* Divider */}
                <div className="flex items-center mb-4 sm:mb-6">
                  <div className="flex-1 h-px bg-gray-600"></div>
                  <span className="px-3 sm:px-4 text-gray-400 text-xs sm:text-sm font-medium">or continue with</span>
                  <div className="flex-1 h-px bg-gray-600"></div>
                </div>
                
                {/* Social Login Buttons */}
                <div className="space-y-2 sm:space-y-3">
                  <motion.button
                    onClick={() => handleAuthCTAAction('google_auth')}
                    className="w-full py-2.5 sm:py-3 px-4 sm:px-6 rounded-full bg-white text-gray-800 font-medium text-sm sm:text-base hover:scale-105 transform transition-transform duration-200 shadow-lg border border-gray-200"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className="flex items-center justify-center gap-2 sm:gap-3">
                      <svg className="w-5 h-5 sm:w-6 sm:h-6" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                      </svg>
                      <span>Continue with Google</span>
                    </div>
                  </motion.button>
                  
                  <motion.button
                    onClick={() => handleAuthCTAAction('apple_auth')}
                    className="w-full py-2.5 sm:py-3 px-4 sm:px-6 rounded-full bg-black text-white font-medium text-sm sm:text-base hover:scale-105 transform transition-transform duration-200 shadow-lg border border-gray-700"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className="flex items-center justify-center gap-2 sm:gap-3">
                      <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                      </svg>
                      <span>Continue with Apple</span>
                    </div>
                  </motion.button>
                  
                  <motion.button
                    onClick={() => handleAuthCTAAction('facebook_auth')}
                    className="w-full py-2.5 sm:py-3 px-4 sm:px-6 rounded-full bg-blue-600 text-white font-medium text-sm sm:text-base hover:scale-105 transform transition-transform duration-200 shadow-lg border border-blue-500"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className="flex items-center justify-center gap-2 sm:gap-3">
                      <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                    </svg>
                    <span>Continue with Facebook</span>
                  </div>
                </motion.button>
              </div>
            
            {/* Continue Demo Option */}
            <div className="mt-4 sm:mt-6 pt-3 sm:pt-4 border-t border-gray-700">
              <motion.button
                onClick={() => handleAuthCTAAction('continue_demo')}
                className="text-body text-white/60 hover:text-white font-medium text-xs sm:text-sm transition-colors duration-200"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                Continue Demo for now
              </motion.button>
            </div>
            
            {/* Additional info */}
            <p className="text-caption text-white/40 mt-3 sm:mt-4 leading-relaxed">
              You can always sign up later to unlock photo uploads and real matching!
            </p>
          </div>
        </motion.div>
      </motion.div>
      )}
    </AnimatePresence>
  </div>
);
}


export default Matches; 