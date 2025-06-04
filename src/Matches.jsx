import { useEffect, useState, useRef } from 'react';
import { supabase } from './supabaseClient';
import UserCard from './UserCard';
import { motion, useAnimation, useMotionValue, useTransform, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

function Matches() {
  const [matches, setMatches] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showMatch, setShowMatch] = useState(false);
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
      const currentUserId = localStorage.getItem('user_profile_id');
      console.log('user_profile_id from localStorage:', currentUserId);
      if (!currentUserId) {
        setMatches([]);
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
        return;
      }
      // 2. Find real users attending the same event (excluding current user)
      console.log('myEvent:', myEvent);
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

      const { data: realUserEvents, error } = await query;
      console.log('realUserEvents:', realUserEvents, 'error:', error);
      
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
// Debug: log the fetched user data
     console.log('Real profiles:', realProfiles);
     console.log('Fake profiles:', fakeProfiles);

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

      // 4. Combine: real users first, then fake users
      setMatches([...mergedRealProfiles, ...mergedFakeProfiles]);
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
      setShowMatch(true);
      setTimeout(() => setShowMatch(false), 1500);
    }
    setCurrentIndex(i => i + 1);
    setToggled(false); // reset toggle on new card
  };

  if (currentIndex >= matches.length) {
    return (
      <div className="text-center mt-8">
        <div>No more users to show.</div>
        <button
          className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition"
          onClick={() => navigate('/')}
        >
          Go Home
        </button>
      </div>
    );
  }

  const match = matches[currentIndex];

  return (
    <div className="max-w-md mx-auto mt-8">
      {showMatch && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
          <div className="bg-white p-8 rounded shadow text-2xl font-bold text-green-600">It's a match!</div>
        </div>
      )}
      <AnimatePresence mode="wait">
        {match && (
          <motion.div
            key={match.id}
            className="touch-none relative"
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            style={{ x, rotate, zIndex: 2 }}
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
            whileHover={{ scale: 1.04, boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}
            whileTap={{ scale: 0.98 }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onClick={() => setToggled(t => !t)}
          >
            <UserCard user={match} />
            {(isHovered || toggled) && (
              <div className="absolute inset-0 border-4 border-blue-400 rounded-lg pointer-events-none flex items-center justify-center" style={{boxShadow:'0 0 0 4px rgba(59,130,246,0.2)', background: toggled ? 'rgba(59,130,246,0.08)' : 'transparent'}}>
                {toggled && <span className="text-blue-500 text-2xl font-bold">Toggled!</span>}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      <div className="flex justify-between mt-4">
        <span className="text-gray-400">Swipe left or right</span>
      </div>
    </div>
  );
}

export default Matches;
