import { useEffect, useState, useRef } from 'react';
import { supabase } from './supabaseClient';
import UserCard from './UserCard';
import { motion, useAnimation, useMotionValue, useTransform, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

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

  // Tinder-like: rotate card as you drag
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-300, 0, 300], [-20, 0, 20]);

  const slogans = [
    "🎉 {name} is down to vibe with you at {event}!",
    "🎉 You and {name} are vibing at {event} — let's go!",
    "🎉 Looks like {name} is feeling your vibe for {event}!",
    "🎉 You've just synced up with {name} for {event}!",
    "🎉 {name} is ready to light up {event} with you!"
  ];

  useEffect(() => {
    const fetchMatches = async () => {
      setLoading(true);
      const currentUserId = localStorage.getItem('user_profile_id');
      if (!currentUserId) {
        setMatches([]);
        setLoading(false);
        return;
      }
      // 1. Get current user's event
      const { data: myEvent } = await supabase
        .from('user_events')
        .select('name, date, city')
        .eq('user_id', currentUserId)
        .single();
      if (!myEvent) {
        setMatches([]);
        setLoading(false);
        return;
      }
      setEventName(myEvent.name);
      // 2. Find real users attending the same event (excluding current user)
      let query = supabase
        .from('user_events')
        .select('user_id')
        .eq('name', myEvent.name.trim())
        .eq('city', myEvent.city.trim())
        .neq('user_id', currentUserId);
      if (myEvent.date) {
        query = query.eq('date', myEvent.date);
      } else {
        query = query.is('date', null);
      }
      const { data: realUserEvents } = await query;
      const realUserIds = (realUserEvents || []).map(u => u.user_id);
      let realProfiles = [];
      if (realUserIds.length > 0) {
        const { data } = await supabase
          .from('user_profiles')
          .select('id, name, instagram, vibe_tags, about_me, is_real')
          .in('id', realUserIds)
          .eq('is_real', true);
        realProfiles = data || [];
      }
      // 3. Fetch all fake users
      const { data: fakeProfiles } = await supabase
        .from('user_profiles')
        .select('id, name, instagram, vibe_tags, about_me, is_real')
        .eq('is_real', false);
      // After fetching realProfiles and fakeProfiles, get all user IDs
      const allUserIds = [...(realProfiles || []), ...(fakeProfiles || [])].map(u => u.id);
      const { data: photos } = await supabase
        .from('user_photos')
        .select('user_id, image_url, position')
        .in('user_id', allUserIds);
      // Merge photos into each user
      const mergePhotos = (profiles) =>
        (profiles || []).map(profile => ({
          ...profile,
          photos: (photos || []).filter(p => p.user_id === profile.id).sort((a, b) => a.position - b.position),
        }));
      const mergedRealProfiles = mergePhotos(realProfiles);
      const mergedFakeProfiles = mergePhotos(fakeProfiles);
      setMatches([...mergedRealProfiles, ...mergedFakeProfiles]);
      setLoading(false);
    };
    fetchMatches();
  }, []);

  const handleSwipe = async (direction, match) => {
    const currentUserId = localStorage.getItem('user_profile_id');
    if (!match || !currentUserId) return;
    await supabase.from('likes').insert({
      from_user_id: currentUserId,
      to_user_id: match.id,
      liked: direction === 'right',
    });
    if (direction === 'right') {
      // Pick a random slogan and interpolate name/event
      const sloganTemplate = slogans[Math.floor(Math.random() * slogans.length)];
      const slogan = sloganTemplate
        .replace('{name}', match.name)
        .replace('{event}', eventName);
      setMatchSlogan(slogan);
      setMatchOverlay(true);
      return;
    }
    setCurrentIndex(i => i + 1);
    setToggled(false); // reset toggle on new card
  };

  const handleKeepSwiping = () => {
    setMatchOverlay(false);
    setShowMatch(false);
    setCurrentIndex(i => i + 1);
    setToggled(false);
  };

  if (loading) {
    return <div className="text-center mt-8">Loading matches...</div>;
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-pink-50 py-8 px-2">
      <div className="w-full max-w-md flex flex-col items-center justify-center min-h-[70vh]">
        {eventName && match && (
          <div className="mb-8 w-full flex items-center">
            <span className="text-xl font-medium text-gray-400">You both are going to&nbsp;</span>
            <span className="text-2xl font-bold text-gray-900">{eventName}</span>
          </div>
        )}
       
       {matchOverlay && (
  <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black bg-opacity-70">
    <div className="mb-4 md:mb-8 text-xl md:text-2xl font-bold text-black text-center">
      {matchSlogan}
    </div>
    <div className="bg-white rounded-2xl shadow-2xl p-0 max-w-3xl w-full flex flex-col md:flex-row items-stretch text-center relative overflow-hidden">
      <div className="w-full flex flex-col items-center justify-center bg-gradient-to-b from-blue-50 via-white to-pink-50 p-4 md:p-6 border-b md:border-b-0 md:border-r border-gray-100">
        <div className="w-full flex flex-col items-center">
          <div className="w-28 h-36 md:w-40 md:h-52 rounded-2xl overflow-hidden bg-gray-100 border border-gray-200 mb-4 flex items-center justify-center">
            {match.photos && match.photos.length > 0 ? (
              <img
                src={match.photos[0].image_url}
                alt="User pic"
                className="w-full h-full object-cover object-top bg-gray-100"
                draggable={false}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-400">No Photo</div>
            )}
          </div>
          <div className="font-bold text-lg md:text-2xl text-gray-800 text-center truncate w-full">
            {match.name} {match.instagram && <span className="text-gray-400 text-sm md:text-base">@{match.instagram}</span>}
          </div>
          {!match.is_real && (
            <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 bg-pink-100 text-pink-700 rounded-full text-xs font-bold uppercase tracking-wide shadow-sm">
              <span role="img" aria-label="star">🌟</span> Demo Raver
            </div>
          )}
          <div className="text-sm md:text-base text-gray-600 text-center w-full break-words line-clamp-3 min-h-[3.5em] mt-3">
            {match.about_me}
          </div>
          {match.vibe_tags && match.vibe_tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 justify-center max-h-12 overflow-y-auto mt-3">
              {match.vibe_tags.map((tag, i) => (
                <span key={i} className="bg-blue-100 text-blue-800 px-2 py-0.5 md:px-3 md:py-1 rounded-full text-xs font-semibold whitespace-nowrap">{tag}</span>
              ))}
            </div>
          )}
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

        <AnimatePresence mode="wait">
          {!matchOverlay && match && (
            <motion.div
              key={match.id}
              className="touch-none relative cursor-pointer"
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              style={{ x, rotate, zIndex: 2, touchAction: 'pan-x' }}
              onDragStart={() => { dragging.current = true; }}
              onDragEnd={(_e, info) => {
                dragging.current = false;
                if (info.offset.x > 120) {
                  controls.start({ x: 500, opacity: 0 });
                  setTimeout(() => handleSwipe('right', match), 200);
                } else if (info.offset.x < -120) {
                  controls.start({ x: -500, opacity: 0 });
                  setTimeout(() => handleSwipe('left', match), 200);
                } else {
                  controls.start({ x: 0, opacity: 1 });
                }
              }}
              animate={controls}
              initial={{ x: 0, opacity: 1, scale: 1 }}
              exit={{ x: x.get() > 0 ? 500 : -500, opacity: 0, scale: 0.8 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30, opacity: { duration: 0.3 } }}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.98 }}
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
              onClick={() => setToggled(t => !t)}
            >
              <UserCard user={match} />
              {isHovered && (
                <div className="absolute inset-0 rounded-2xl ring-2 ring-blue-400 pointer-events-none"></div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
        <div className="flex justify-between mt-4">
          <span className="text-gray-400">Swipe left or right</span>
        </div>
      </div>
    </div>
  );
}

export default Matches;
