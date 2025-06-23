import { useEffect, useState, useRef, useMemo } from 'react';
import { supabase } from './supabaseClient';
import UserCard from './UserCard';
import { motion, useAnimation, useMotionValue, useTransform, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import RadarLoader from './RadarLoader';

function Matches() {
  const [matches, setMatches] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showMatch, setShowMatch] = useState(false);
  const [matchOverlay, setMatchOverlay] = useState(false);
  const [loading, setLoading] = useState(true);
  const [eventName, setEventName] = useState("");
  const [matchSlogan, setMatchSlogan] = useState("");
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
        const { data: fakeProfiles } = await supabase.from('user_profiles').select('id, name, instagram, vibe_tags, about_me, is_real').eq('is_real', false);
        const allUserIds = [...(realProfiles || []), ...(fakeProfiles || [])].map(u => u.id);
        const { data: photos } = await supabase.from('user_photos').select('user_id, image_url, position').in('user_id', allUserIds);
        const mergePhotos = (profiles) => (profiles || []).map(profile => ({ ...profile, photos: (photos || []).filter(p => p.user_id === profile.id).sort((a, b) => a.position - b.position), }));
        const mergedRealProfiles = mergePhotos(realProfiles);
        const mergedFakeProfiles = mergePhotos(fakeProfiles);
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

  const swipeLabel = useMemo(() => {
    if (currentX > 40) return { text: "I wanna dance with this person :)", position: "left" };
    if (currentX < -40) return { text: "I don't feel the vibe :(", position: "right" };
    return null;
  }, [currentX]);

  if (loading) {
    return <RadarLoader />;
  }

  if (currentIndex >= matches.length) {
    return (
      <div className="text-center mt-8 flex flex-col items-center">
        <div className="text-lg font-semibold mb-4">No more users to show :</div>
        <button
          className="mt-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition"
          onClick={() => navigate('/')}
        >
          Go Home
        </button>
      </div>
    );
  }

  const match = matches[currentIndex];

  return (
    <div className="h-screen flex items-center justify-center bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 py-8 px-2 overflow-hidden">
      <div className="w-full max-w-lg md:max-w-[480px] flex flex-col items-center justify-center min-h-[70vh] relative" style={{ minHeight: 600 }}>
        {eventName && match && (
          <div className="mb-8 w-full flex flex-col md:flex-row items-center text-center md:text-left space-y-1 md:space-y-0">
            <span className="text-sm md:text-xl font-medium text-gray-300">You both are going to&nbsp;</span>
            <span className="text-lg md:text-2xl font-bold text-white truncate max-w-[280px] md:max-w-[300px]">{eventName}</span>
          </div>
        )}
        <div className="relative w-full h-[600px] flex items-center justify-center">
          {showMatch && (
            <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
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
                    className={`absolute ${swipeLabel.position === 'left' ? 'top-4 left-4' : 'top-4 right-4'} px-6 py-2 rounded-full text-lg font-bold shadow-lg
                      ${swipeLabel.position === 'left'
                        ? 'bg-green-500 text-white border-2 border-green-700'
                        : 'bg-gray-200 text-gray-700 border-2 border-gray-400'}
                      transition-all duration-200 pointer-events-none select-none z-20`}
                    style={{
                      opacity: Math.min(Math.abs(currentX) / 60, 1),
                      transform: `rotate(${currentX > 0 ? 8 : -8}deg)`
                    }}
                  >
                    {swipeLabel.text}
                  </div>
                )}
                <UserCard user={matches[currentIndex]} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
       
       {matchOverlay && matchedUser && (
  <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black bg-opacity-40 backdrop-blur-md">
    <div className="mb-4 md:mb-8 text-xl md:text-2xl font-extrabold text-center text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
      {matchSlogan}
    </div>
    <div className="bg-white rounded-2xl shadow-2xl p-0 max-w-3xl w-full flex flex-col md:flex-row items-stretch text-center relative overflow-hidden">
      <div className="w-full flex flex-col items-center justify-center bg-gradient-to-b from-indigo-900 via-purple-900 to-pink-900 p-4 md:p-6 border-b md:border-b-0 md:border-r border-gray-100">
        <div className="w-full flex flex-col items-center">
          <div className="w-28 h-36 md:w-40 md:h-52 rounded-2xl overflow-hidden bg-gray-100 border border-gray-200 mb-4 flex items-center justify-center">
            {matchedUser && matchedUser.photos && matchedUser.photos.length > 0 ? (
              <img
                src={matchedUser.photos[0].image_url}
                alt="User pic"
                className="w-full h-full object-cover object-top bg-gray-100"
                draggable={false}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-300">No Photo</div>
            )}
          </div>
          <div className="font-bold text-lg md:text-2xl text-gray-800 text-center truncate w-full">
            {matchedUser.name} {matchedUser.instagram && <span className="text-gray-300 text-sm md:text-base">@{matchedUser.instagram}</span>}
          </div>
          {!matchedUser.is_real && (
            <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 bg-pink-100 text-pink-700 rounded-full text-xs font-bold uppercase tracking-wide shadow-sm">
              <span role="img" aria-label="star">🌟</span> Demo Raver
            </div>
          )}
          <div className="text-sm md:text-base text-gray-600 text-center w-full break-words line-clamp-3 min-h-[3.5em] mt-3">
            {matchedUser.about_me}
          </div>
          {/* {matchedUser.vibe_tags && matchedUser.vibe_tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 justify-center max-h-12 overflow-y-auto mt-3">
              {matchedUser.vibe_tags.map((tag, i) => (
                <span key={i} className="bg-blue-100 text-blue-800 px-2 py-0.5 md:px-3 md:py-1 rounded-full text-xs font-semibold whitespace-nowrap">{tag}</span>
              ))}
            </div>
          )} */}
        </div>
      </div>
      <div className="w-full flex flex-col items-center justify-center p-4 md:p-6">
        <div className="text-sm md:text-base text-gray-700 mb-3">
          Your match is part of our <span className="font-semibold text-pink-500">demo raver crew</span>, helping us test and build the ultimate rave connection experience.
        </div>
        <div className="text-sm md:text-base text-gray-700 mb-2">💬 <span className="font-semibold">Chat isn't live yet, but you can:</span></div>
        <div className="text-sm md:text-base text-gray-700 mb-3 flex flex-col items-start w-full">
          <span className="mb-1">👉 <span className="font-semibold text-indigo-600">Join our Private Discord</span> - your feedback means the world to us!</span>
        </div>
        <div className="flex gap-3 w-full justify-center mb-3">
          <a href="https://discord.gg/hzGwGe5y" target="_blank" rel="noopener noreferrer" className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full font-bold text-base shadow-lg transition text-center">Join Discord</a>
        </div>
        <button
          onClick={handleKeepSwiping}
          className="mt-2 px-6 py-2 bg-white border border-gray-300 text-gray-700 rounded-full font-semibold text-base shadow-sm hover:bg-gray-50 transition"
        >
          Keep Swiping
        </button>
      </div>
    </div>
  </div>
)}

        <div className="flex justify-between mt-4">
          <span className="text-gray-300">Swipe left or right</span>
        </div>
      </div>
    </div>
  );
}

export default Matches;
