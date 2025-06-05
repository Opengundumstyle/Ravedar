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
  const controls = useAnimation();
  const dragging = useRef(false);
  const [isHovered, setIsHovered] = useState(false);
  const [toggled, setToggled] = useState(false);
  const navigate = useNavigate();

  // Tinder-like: rotate card as you drag
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-300, 0, 300], [-20, 0, 20]);

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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70">
            <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full flex flex-col items-center text-center relative">
              <div className="text-3xl font-extrabold text-pink-500 mb-2">It's a match</div>
              <div className="text-lg text-gray-700 mb-4">You can be matching with real rave enthusiasts like this at your fingertip!</div>
              <a href="#" target="_blank" rel="noopener noreferrer" className="mb-4 inline-block px-4 py-2 bg-indigo-600 text-white rounded-full font-semibold hover:bg-indigo-700 transition">Join private Discord chat</a>
              <div className="mb-4 text-gray-500">Follow us on</div>
              <div className="flex gap-4 mb-4">
                {/* Instagram */}
                <a href="#" target="_blank" rel="noopener noreferrer" className="hover:scale-110 transition">
                  <svg width="28" height="28" fill="none" viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="#E1306C"/><path d="M12 8.4A3.6 3.6 0 1 0 12 15.6 3.6 3.6 0 0 0 12 8.4Zm0 5.9a2.3 2.3 0 1 1 0-4.6 2.3 2.3 0 0 1 0 4.6Zm4.5-6.1a.9.9 0 1 1-1.8 0 .9.9 0 0 1 1.8 0ZM17.7 7.1a2.6 2.6 0 0 0-1.5-1.5c-.7-.3-1.5-.3-4.2-.3s-3.5 0-4.2.3a2.6 2.6 0 0 0-1.5 1.5c-.3.7-.3 1.5-.3 4.2s0 3.5.3 4.2a2.6 2.6 0 0 0 1.5 1.5c.7.3 1.5.3 4.2.3s3.5 0 4.2-.3a2.6 2.6 0 0 0 1.5-1.5c.3-.7.3-1.5.3-4.2s0-3.5-.3-4.2Zm-1.1 8.1a1.6 1.6 0 0 1-1.1 1.1c-.8.3-2.7.2-3.5.2s-2.7 0-3.5-.2a1.6 1.6 0 0 1-1.1-1.1c-.3-.8-.2-2.7-.2-3.5s0-2.7.2-3.5a1.6 1.6 0 0 1 1.1-1.1c.8-.3 2.7-.2 3.5-.2s2.7 0 3.5.2a1.6 1.6 0 0 1 1.1 1.1c.3.8.2 2.7.2 3.5s0 2.7-.2 3.5Z" fill="#fff"/></svg>
                </a>
                {/* TikTok */}
                <a href="#" target="_blank" rel="noopener noreferrer" className="hover:scale-110 transition">
                  <svg width="28" height="28" fill="none" viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="#000"/><path d="M17.5 9.5c-.7 0-1.3-.2-1.8-.6V15c0 2-1.6 3.6-3.6 3.6S8.5 17 8.5 15s1.6-3.6 3.6-3.6c.2 0 .4 0 .6.1v1.5c-.2-.1-.4-.1-.6-.1-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2V7.5h1.5c.1.7.7 1.3 1.4 1.4v.6Z" fill="#fff"/></svg>
                </a>
                {/* Facebook */}
                <a href="#" target="_blank" rel="noopener noreferrer" className="hover:scale-110 transition">
                  <svg width="28" height="28" fill="none" viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="#1877F3"/><path d="M15.5 8.5h-1.5c-.2 0-.5.2-.5.5v1.5h2l-.3 2h-1.7v5h-2v-5H9.5v-2h1.5V9c0-1.1.9-2 2-2h1.5v1.5Z" fill="#fff"/></svg>
                </a>
              </div>
              <a href="#" target="_blank" rel="noopener noreferrer" className="mb-6 text-blue-600 underline font-medium">Join our mission: Contact us</a>
              <button
                onClick={handleKeepSwiping}
                className="mt-2 px-6 py-3 bg-pink-500 hover:bg-pink-600 text-white rounded-full font-bold text-lg shadow-lg transition"
              >
                Keep Swiping
              </button>
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
