import { useEffect, useState, useRef, useMemo } from 'react';
import { supabase } from './supabaseClient';
import UserCard from './UserCard';
import { motion, useAnimation, useMotionValue, useTransform, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import RadarLoader from './RadarLoader';
import DiscordCTA from './DiscordCTA';
import ChatNotificationModal from './ChatNotificationModal';
import FounderMatchModal from './FounderMatchModal';

function Matches() {
  const [matches, setMatches] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showMatch, setShowMatch] = useState(false);
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

  // Debug showChatModal state
  useEffect(() => {
    console.log('showChatModal state changed to:', showChatModal);
  }, [showChatModal]);

  // Debug matchCount state
  useEffect(() => {
    console.log('matchCount changed to:', matchCount);
  }, [matchCount]);

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
          setMatches([]);
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
        const { data: fakeProfiles } = await supabase.from('user_profiles').select('id, name, instagram, vibe_tags, about_me, is_real, role').or('is_real.eq.false,role.eq.founder,role.eq.co-founder');
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
        setMatches([...mergedFakeProfiles]);
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
    
    // Handle survey cards differently
    if (match.is_survey) {
      handleSurveyAction('view'); // Show survey
      setCurrentIndex(i => i + 1);
      return;
    }
    
    await supabase.from('likes').insert({
      from_user_id: currentUserId,
      to_user_id: match.id,
      liked: direction === 'right',
    });
    if (direction === 'right') {
      setShowMatch(true);
      setTimeout(() => setShowMatch(false), 1500);
    }
    
    // Increment total swipes and check for survey
    const newTotalSwipes = totalSwipes + 1;
    setTotalSwipes(newTotalSwipes);
    checkForSurvey(newTotalSwipes);
  };

  const handleKeepSwiping = () => {
    setMatchOverlay(false);
    setShowMatch(false);
    setCurrentIndex(i => i + 1);
    setToggled(false);
  };

  const handleStartChat = () => {
    console.log('handleStartChat called, setting showChatModal to true');
    setShowChatModal(true);
    console.log('showChatModal should now be true');
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

  // Survey card logic
  const checkForSurvey = (swipeCount) => {
    if (swipeCount === 12) {
      console.log('Triggering survey at swipe 12');
      
      // Create a survey card and insert it into the matches array
      const surveyCard = {
        id: `survey-${Date.now()}`,
        name: "Quick Survey",
        about_me: "How's your matching experience?",
        is_survey: true,
        survey_options: [
          { text: "👍 Good", action: "good", color: "bg-green-500 hover:bg-green-600" },
          { text: "🤔 Okay", action: "okay", color: "bg-yellow-500 hover:bg-yellow-600" },
          { text: "😕 Poor", action: "poor", color: "bg-red-500 hover:bg-red-600" }
        ],
        photos: [{ image_url: 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=400&h=600&fit=crop&crop=center', position: 0 }]
      };
      
      // Insert survey card at the next position (after current card)
      const newMatches = [...matches];
      const insertPosition = currentIndex + 1;
      newMatches.splice(insertPosition, 0, surveyCard);
      setMatches(newMatches);
      
      console.log(`Survey card inserted at position ${insertPosition}`);
    }
  };

  const handleSurveyAction = (action) => {
    // Handle different survey responses
    switch (action) {
      case 'good':
        alert('Thanks for the feedback! We\'re glad you like it! 👍');
        break;
      case 'okay':
        alert('Thanks for your honest feedback! We\'ll keep improving! 💪');
        break;
      case 'poor':
        alert('We appreciate your honesty! Please join our Discord to give detailed feedback! 📝');
        break;
    }
    
    // Move to next card
    setCurrentIndex(i => i + 1);
  };

  const swipeLabel = useMemo(() => {
    if (currentX > 40) return { text: "Down to Dance!", position: "left" };
    if (currentX < -40) return { text: "Not Vibing:/", position: "right" };
    return null;
  }, [currentX]);

  // Memoize the New Search button to prevent re-renders
  const newSearchButton = useMemo(() => (
    <motion.button
      key="new-search-button"
      onClick={() => navigate("/")}
      className="fixed top-4 left-4 z-[60] flex items-center gap-2 px-4 py-2 bg-black/80 backdrop-blur-md border border-white/30 rounded-full text-white hover:text-white hover:bg-black/90 shadow-xl transition-all duration-300 shadow-lg"
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
      </svg>
      <span className="text-sm font-medium">New Search</span>
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
          <h2 className="text-3xl font-semibold text-white mb-2">That's Everyone For Now!</h2>
          <p className="text-lg text-purple-200 mb-8 max-w-md leading-relaxed">
            You've seen all potential ravebaes for <span className="font-medium text-white">{eventName}</span>. Check back later for new people!
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
      {newSearchButton}
      <div className="w-full max-w-lg md:max-w-[480px] flex flex-col items-center justify-center min-h-[70vh] relative" style={{ minHeight: 600 }}>
        {eventName && match && (
          <div className="mb-8 w-full flex flex-col md:flex-row items-center text-center md:text-left space-y-1 md:space-y-0">
            <span className="text-sm md:text-xl font-medium text-gray-300">You both are going to&nbsp;</span>
            <span className="text-lg md:text-2xl font-semibold text-white truncate max-w-[280px] md:max-w-[300px]">{eventName}</span>
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
              {matchCount === 1 ? (
                <button
                  onClick={() => {
                    console.log('Start Chat button clicked!');
                    handleStartChat();
                  }}
                  className="flex-1 text-center py-3 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 text-white font-bold text-lg hover:scale-105 transform transition-transform duration-200 animate-button-glow shadow-lg"
                >
                  Start Chat
                </button>
              ) : matchCount === 2 ? (
                <a 
                  href="https://discord.gg/R3VYAUzWwd" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="flex-1 text-center py-3 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-bold text-lg hover:scale-105 transform transition-transform duration-200 animate-button-glow shadow-lg"
                >
                  Join Discord
                </a>
              ) : (
                <button
                  onClick={() => {
                    // Subtle message for disabled chat
                    alert('Oops! Chat feature coming soon... 🚀');
                  }}
                  className="flex-1 text-center py-3 rounded-full bg-gradient-to-r from-gray-400 to-gray-500 text-white font-bold text-lg hover:scale-105 transform transition-transform duration-200 shadow-lg cursor-not-allowed"
                  title="Chat feature coming soon..."
                >
                  Start Chat
                </button>
              )}
              <button
                onClick={handleKeepSwiping}
                className="flex-1 text-center py-3 rounded-full bg-white/20 backdrop-blur-sm border border-white/30 text-white font-semibold text-lg hover:bg-white/30 transform transition-colors duration-200 shadow-md"
              >
                Keep Swiping
              </button>
            </motion.div>
            
            {/* Feedback text for Discord match */}
            {matchCount === 2 && (
              <motion.div variants={itemVariants} className="mt-4 text-center">
                <p className="text-white/70 text-sm leading-relaxed max-w-xs mx-auto">
                Join Discord to give instant feedback,<br />
                your opinion matters to us !<br />
                (raver or not)
                </p>
              </motion.div>
            )}
            
            {/* Social Media Icons - Only show for 3rd match onwards */}
            {matchCount > 2 && (
              <motion.div variants={itemVariants} className="mt-4 text-center">
                <p className="text-white/70 text-sm mb-3">Follow us at</p>
                <div className="flex justify-center gap-4">
                  <a 
                    href="https://instagram.com/ravedar" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="w-10 h-10 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 flex items-center justify-center text-white hover:scale-110 transform transition-transform duration-200 shadow-lg"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                    </svg>
                  </a>
                  <a 
                    href="https://tiktok.com/@ravedar" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="w-10 h-10 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 flex items-center justify-center text-white hover:scale-110 transform transition-transform duration-200 shadow-lg"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
                    </svg>
                  </a>
                  <a 
                    href="https://facebook.com/ravedar" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="w-10 h-10 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 flex items-center justify-center text-white hover:scale-110 transform transition-transform duration-200 shadow-lg"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                    </svg>
                  </a>
                </div>
              </motion.div>
            )}
            {matchCount > 2 && <DiscordCTA />}
          </motion.div>
        )}
      
         </AnimatePresence>

        <div className="flex justify-between mt-4">
          <span className="text-gray-300">Swipe left or right</span>
        </div>
      </div>

      <FounderMatchModal 
        isOpen={showFounderModal} 
        onClose={() => { setShowFounderModal(false); setCurrentIndex(i => i + 1); setToggled(false); }} 
        matchedUser={matchedUser} 
        currentUser={currentUser} 
      />      <ChatNotificationModal 
        isOpen={showChatModal} 
        onClose={() => { setShowChatModal(false); setMatchOverlay(false); setShowMatch(false); setCurrentIndex(i => i + 1); setToggled(false); }} 
      />
    </div>
  );
}

export default Matches; 