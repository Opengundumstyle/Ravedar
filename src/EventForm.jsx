import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import { ensureSectionId } from './ensureUserId';
import { useAuth } from './AuthContext';

const TICKETMASTER_API_KEY = import.meta.env.VITE_TICKETMASTER_API_KEY;

function EventForm() {
  const [eventName, setEventName] = useState('');
  const [eventSuggestions, setEventSuggestions] = useState([]);
  const [city, setCity] = useState('');
  const [citySuggestions, setCitySuggestions] = useState([]);
  const [date, setDate] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const [eventInputFocused, setEventInputFocused] = useState(false);
  const [cityInputFocused, setCityInputFocused] = useState(false);
  const [happeningSoonCity, setHappeningSoonCity] = useState("");
  const [selectedSuggestion, setSelectedSuggestion] = useState(null);
  const [title, setTitle] = useState({ text: <>&nbsp;</>, weight: 'font-light' });
  const [userProfile, setUserProfile] = useState(null);
  const { user, isAuthenticated, loading: authLoading } = useAuth();

  // Ensure section ID is generated for workflow
  useEffect(() => {
    ensureSectionId();
  }, []);

  // Load user profile if authenticated
  useEffect(() => {
    const loadUserProfile = async () => {
      console.log('loadUserProfile called:', { 
        isAuthenticated, 
        user: user?.id, 
        authLoading,
        userProfile 
      });
      
      // Wait for authentication to be fully loaded
      if (authLoading) {
        console.log('Auth still loading, skipping profile load');
        return;
      }
      
      if (isAuthenticated && user) {
        try {
          const { data: profile, error } = await supabase
            .from('user_profiles')
            .select('name, is_real')
            .eq('id', user.id)
            .single();

          if (!error && profile) {
            console.log('Setting userProfile for authenticated user:', profile);
            setUserProfile(profile);
          }
        } catch (error) {
          console.error('Error loading user profile:', error);
        }
      } else {
        // Clear userProfile state when user is not authenticated
        console.log('Clearing userProfile for unauthenticated user');
        setUserProfile(null);
      }
    };

    loadUserProfile();
  }, [isAuthenticated, user, authLoading]);

  // Effect to cycle through titles
  useEffect(() => {
    const sequence = [
      { text: "Connect through experience with", weight: 'font-light' },
      { text: "Ravedar", weight: 'font-bold' }, // font-bold will show star
      { text: "Find Your Rave Match", weight: 'font-light' }
    ];
    let index = 0;
    
    const cycleTitles = () => {
      if (index < sequence.length) {
        setTitle(sequence[index]);
        index++;
        if (index < sequence.length) {
          setTimeout(cycleTitles, 3000); // Back to 3 seconds
        }
        // Stop at "Find Your Rave Match" - don't loop
      }
    };
    
    // Start with the first text
    setTitle(sequence[0]);
    setTimeout(() => {
      cycleTitles();
    }, 1000); // Start cycling after 1 second
  }, []);

  // Autocomplete for event/dj name
  useEffect(() => {
    const fetchSuggestions = async () => {
      if (!eventName.trim()) {
        setEventSuggestions([]);
        return;
      }
      const searchName = eventName.trim().toLowerCase();
      const { data: eventData } = await supabase
        .from('events')
        .select('id, name')
        .ilike('name', `%${searchName}%`)
        .not('name', 'ilike', '%unnamed event%')
        .limit(5);
      const { data: artistData } = await supabase
        .from('artists')
        .select('id, name')
        .ilike('name', `%${searchName}%`)
        .limit(5);
      // Deduplicate event suggestions by name
      const eventNames = new Set();
      const uniqueEventSuggestions = [];
      (eventData || []).forEach(e => {
        if (!eventNames.has(e.name)) {
          eventNames.add(e.name);
          uniqueEventSuggestions.push({ type: 'event', id: e.id, name: e.name });
        }
      });
      const allSuggestions = [
        ...uniqueEventSuggestions,
        ...(artistData || []).map(a => ({ type: 'artist', id: a.id, name: a.name })),
      ];
      setEventSuggestions(allSuggestions);
    };
    fetchSuggestions();
  }, [eventName]);

  // City suggestions based on event/dj and city input
  useEffect(() => {
    const fetchCitySuggestions = async () => {
      if (!eventName.trim()) {
        setCitySuggestions([]);
        setHappeningSoonCity("");
        return;
      }
      let soonestCity = "";
      let soonestDate = null;
      let allCities = [];
      // Use selectedSuggestion for precise lookup
      if (selectedSuggestion) {
        if (selectedSuggestion.type === 'event') {
          // Lookup by event name (not just ID) to get all cities and soonest date
          console.log('Looking up cities for event name:', selectedSuggestion.name);
          const { data: eventRows } = await supabase
            .from('events')
            .select('city, date')
            .ilike('name', `%${selectedSuggestion.name}%`)
            .order('date', { ascending: true });
          console.log('eventRows:', eventRows);
          if (eventRows && eventRows.length > 0) {
            soonestCity = eventRows[0].city;
            soonestDate = eventRows[0].date;
            allCities = eventRows.map(e => e.city);
          }
        } else if (selectedSuggestion.type === 'artist') {
          // Lookup by artist ID
          const { data: artistEventCities } = await supabase
            .from('event_artists')
            .select('event_id')
            .eq('artist_id', selectedSuggestion.id)
            .limit(100);
          const eventIds = (artistEventCities || []).map(ea => ea.event_id);
          if (eventIds.length > 0) {
            const { data: eventsByArtist } = await supabase
              .from('events')
              .select('city, date')
              .in('id', eventIds)
              .order('date', { ascending: true })
              .limit(1);
            if (eventsByArtist && eventsByArtist.length > 0) {
              soonestCity = eventsByArtist[0].city;
              soonestDate = eventsByArtist[0].date;
            }
            // Get all cities for this artist
            const { data: allArtistCities } = await supabase
              .from('events')
              .select('city')
              .in('id', eventIds);
            if (allArtistCities) {
              allCities = allArtistCities.map(e => e.city);
            }
          }
        }
      } else {
        // Fallback: try by name as before
        const searchName = eventName.trim().toLowerCase();
        const { data: eventCities } = await supabase
          .from('events')
          .select('city, date')
          .ilike('name', `%${searchName}%`)
          .order('date', { ascending: true })
          .limit(1);
        if (eventCities && eventCities.length > 0) {
          soonestCity = eventCities[0].city;
          soonestDate = eventCities[0].date;
        }
        const { data: allEventCities } = await supabase
          .from('events')
          .select('city')
          .ilike('name', `%${searchName}%`);
        if (allEventCities) {
          allCities = allEventCities.map(e => e.city);
        }
      }
      // Dedupe
      allCities = [...new Set(allCities)];
      // Fuzzy match
      let filteredCities = allCities;
      if (city.trim()) {
        filteredCities = allCities.filter(c => c.toLowerCase().includes(city.trim().toLowerCase()));
      }
      // Remove soonest city from filtered list if present, but only if there are other cities
      if (allCities.length > 1) {
        filteredCities = filteredCities.filter(c => c !== soonestCity);
      }
      setCitySuggestions(filteredCities);
      setHappeningSoonCity(soonestCity);
    };
    fetchCitySuggestions();
  }, [eventName, city, selectedSuggestion]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!eventName.trim() || !city.trim()) {
      setError('Both event/DJ and city are required.');
      return;
    }
    const userId = localStorage.getItem('user_profile_id');
    if (!userId) {
      alert('User ID not found. Please refresh the page.');
      return;
    }
    const eventDate = date === '' ? null : date;

    try {
      console.log('Starting event submission...');
      console.log('User ID:', userId);
      console.log('Event data:', { name: eventName, date: eventDate, city });

      // First, check if user profile exists
      const { data: userProfile, error: profileError } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('id', userId)
        .single();

      if (profileError) {
        console.error('Profile check error:', profileError);
        if (profileError.code === 'PGRST116') {
          // User doesn't have a profile, create one for demo purposes
          console.log('Creating demo profile for user:', userId);
          
          // First create a user session
          const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours expiry
          
          const { error: sessionError } = await supabase
            .from('user_sessions')
            .insert({
              id: userId,
              expires_at: expiresAt
            });

          if (sessionError && sessionError.code !== '23505') { // 23505 is unique constraint violation
            console.error('Session creation error:', sessionError);
            setError('Failed to create user session. Please try again.');
            return;
          }

          // Create a demo profile
          const { error: createProfileError } = await supabase
            .from('user_profiles')
            .insert({
              id: userId,
              name: 'Demo User',
              instagram: null,
              about_me: 'Demo user exploring Ravedar',
              vibe_tags: ['House', 'Techno'],
              is_real: false,
              expires_at: expiresAt
            });

          if (createProfileError) {
            console.error('Profile creation error:', createProfileError);
            setError('Failed to create demo profile. Please try again.');
            return;
          }

          console.log('Demo profile created successfully');
          
          // Update the userProfile state to reflect the newly created demo profile
          setUserProfile({
            id: userId,
            name: 'Demo User',
            is_real: false
          });
          
          // Continue with the event creation
        } else {
          throw new Error(`Failed to check user profile: ${profileError.message}`);
        }
      }

      if (!userProfile && !profileError) {
        // This shouldn't happen, but just in case
        setError('Please sign up first to search for events. You can continue as a guest or create an account.');
        return;
      }

      console.log('User profile found:', userProfile);

      // Check if user already has an event
      const { data: existingEvent, error: checkError } = await supabase
        .from('user_events')
        .select('user_id')
        .eq('user_id', userId)
        .single();

      if (checkError && checkError.code !== 'PGRST116') {
        console.error('Event check error:', checkError);
        throw new Error(`Failed to check existing event: ${checkError.message}`);
      }

      console.log('Existing event check result:', existingEvent);

      // Clear any existing event for this user before inserting a new one
      if (existingEvent) {
        console.log('Deleting existing event...');
        const { error: deleteError } = await supabase
          .from('user_events')
          .delete()
          .eq('user_id', userId);

        if (deleteError) {
          console.error('Delete error details:', {
            code: deleteError.code,
            message: deleteError.message,
            details: deleteError.details,
            hint: deleteError.hint
          });
          setError(`Error clearing previous search: ${deleteError.message}`);
          return;
        }
        console.log('Existing event deleted successfully');
      }

      // Insert new event
      console.log('Inserting new event...');
      const { data: insertData, error: insertError } = await supabase
        .from('user_events')
        .insert({
          user_id: userId,
          name: eventName,
          date: eventDate,
          city
        })
        .select()
        .single();

      if (insertError) {
        console.error('Insert error details:', {
          code: insertError.code,
          message: insertError.message,
          details: insertError.details,
          hint: insertError.hint
        });
        setError(`Error saving event: ${insertError.message}`);
        return;
      }

      console.log('Event inserted successfully:', insertData);
      navigate('/matches');

    } catch (error) {
      console.error('Unexpected error:', error);
      setError(`Unexpected error: ${error.message}`);
    }
  };

  const formVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        type: 'spring',
        stiffness: 100,
      },
    },
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background Animation */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/20 via-purple-900/20 to-pink-900/20 animate-pulse"></div>
      
      <div className="relative z-10 w-full max-w-md mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-12">
          <motion.div
            className="mb-8 h-20 flex flex-col items-center justify-center"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={title.text}
                className="flex items-center justify-center gap-2"
                initial={{ opacity: 0, y: 20, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 0, scale: 0.9 }}
                transition={{ 
                  duration: 0.8,
                  ease: [0.4, 0.0, 0.2, 1]
                }}
              >
                <h1 className={`text-display text-center ${
                  title.text === "✨" ? "text-yellow-400" : "text-gradient-primary"
                }`}>
                  {title.text}
                </h1>
                {title.weight === 'font-bold' && (
                  <motion.div
                    key="star"
                    className="text-4xl text-yellow-400"
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{ 
                      delay: 0.2,
                      duration: 0.6,
                      ease: [0.4, 0.0, 0.2, 1]
                    }}
                  >
                    ✨
                  </motion.div>
                )}
              </motion.div>
            </AnimatePresence>
          </motion.div>
        </div>

        {/* Form */}
        <motion.form
          onSubmit={handleSubmit}
          className="space-y-8 w-full max-w-full"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
        >
          {/* Event/DJ Input */}
          <div className="space-y-3">
            <label className="text-sm text-white/80 block font-medium">
              Event or DJ Name
            </label>
            <div className="relative">
              <input
                type="text"
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
                onFocus={() => setEventInputFocused(true)}
                onBlur={() => setTimeout(() => setEventInputFocused(false), 200)}
                placeholder="e.g., EDC, Tomorrowland, Skrillex..."
                className="w-full px-4 py-4 bg-black/30 backdrop-blur-sm border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-pink-500/50 focus:border-pink-500 transition-all duration-200"
                required
              />
              <AnimatePresence>
                {eventInputFocused && eventSuggestions.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute top-full left-0 right-0 mt-2 bg-black/90 backdrop-blur-md border border-white/20 rounded-xl overflow-hidden z-20 max-h-48 overflow-y-auto"
                  >
                    {eventSuggestions.map((suggestion, index) => (
                      <motion.button
                        key={`${suggestion.type}-${suggestion.id}`}
                        type="button"
                        onClick={() => {
                          setEventName(suggestion.name);
                          setSelectedSuggestion(suggestion);
                          setEventSuggestions([]);
                        }}
                        className="w-full px-4 py-3 text-left text-body hover:bg-white/10 transition-colors duration-150 flex items-center gap-3"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05 }}
                      >
                        <span className="text-xs bg-pink-500/20 text-pink-300 px-2 py-1 rounded-full">
                          {suggestion.type}
                        </span>
                        <span className="text-white">{suggestion.name}</span>
                      </motion.button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* City Input */}
          <div className="space-y-3">
            <label className="text-sm text-white/80 block font-medium">
              City
            </label>
            <div className="relative">
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                onFocus={() => setCityInputFocused(true)}
                onBlur={() => setTimeout(() => setCityInputFocused(false), 200)}
                placeholder="e.g., Las Vegas, Miami, Amsterdam..."
                className="w-full px-4 py-4 bg-black/30 backdrop-blur-sm border border-white/20 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-pink-500/50 focus:border-pink-500 transition-all duration-200"
                required
              />
              <AnimatePresence>
                {cityInputFocused && citySuggestions.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute top-full left-0 right-0 mt-2 bg-black/90 backdrop-blur-md border border-white/20 rounded-xl overflow-hidden z-20 max-h-48 overflow-y-auto"
                  >
                    {happeningSoonCity && (
                      <div className="px-4 py-2 bg-pink-500/20 border-b border-white/10">
                        <span className="text-xs text-pink-300 font-medium">
                          Happening soon in: {happeningSoonCity}
                        </span>
                      </div>
                    )}
                    {citySuggestions.map((suggestion, index) => (
                      <motion.button
                        key={suggestion}
                        type="button"
                        onClick={() => {
                          setCity(suggestion);
                          setCitySuggestions([]);
                        }}
                        className="w-full px-4 py-3 text-left text-body hover:bg-white/10 transition-colors duration-150"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05 }}
                      >
                        {suggestion}
                      </motion.button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Date Input */}
          <div className="space-y-3">
            <label className="text-sm text-white/80 block font-medium">
              Date (Optional)
            </label>
            <div className="relative">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-4 py-4 bg-black/30 backdrop-blur-sm border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-pink-500/50 focus:border-pink-500 transition-all duration-200"
              />
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="px-4 py-3 bg-red-500/20 border border-red-500/30 rounded-xl text-red-300 text-sm"
            >
              {error}
            </motion.div>
          )}

          {/* Submit Button */}
          <motion.button
            type="submit"
            className="w-full py-4 px-6 bg-gradient-to-r from-pink-500 to-purple-600 text-white font-semibold text-lg rounded-xl hover:scale-105 transform transition-all duration-200 shadow-lg hover:shadow-xl mt-6"
            whileTap={{ scale: 0.98 }}
            animate={{
              boxShadow: [
                '0 0 25px rgba(236, 72, 153, 0.6), 0 0 50px rgba(168, 85, 247, 0.4)',
                '0 0 40px rgba(236, 72, 153, 0.8), 0 0 80px rgba(168, 85, 247, 0.6)',
                '0 0 25px rgba(236, 72, 153, 0.6), 0 0 50px rgba(168, 85, 247, 0.4)'
              ]
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          >
            Find My Rave Match
          </motion.button>

          {/* Sign In Link or Welcome Message */}
          <motion.div
            className="text-center mt-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.6 }}
          >
            {isAuthenticated && userProfile && userProfile.is_real !== false ? (
              <div>
                <p className="text-sm text-white/70 mb-2">
                  Welcome back, <span className="text-pink-400 font-medium">{userProfile.name}</span>! ✨
                </p>
                <motion.button
                  type="button"
                  onClick={() => navigate('/user-panel')}
                  className="text-sm text-pink-400 hover:text-pink-300 underline font-medium transition-colors duration-200"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  Manage your profile
                </motion.button>
              </div>
            ) : (
              <div>
                <motion.button
                  type="button"
                  onClick={() => navigate('/signin')}
                  className="text-xs text-white/50 hover:text-pink-400 underline font-medium transition-colors duration-200"
                  whileTap={{ scale: 0.98 }}
                >
                  Got an account with us?
                </motion.button>
              </div>
            )}
          </motion.div>
        </motion.form>

        {/* Footer */}
        <motion.div
          className="text-center mt-12"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.8 }}
        >
          <p className="text-sm text-white/60 mb-6">
            Connect with fellow ravers who share your vibe
          </p>
          
          {/* Social Media Links */}
          <div className="flex justify-center gap-4 mb-6">
            <motion.a
              href="https://instagram.com/ravedar.app"
              target="_blank"
              rel="noopener noreferrer"
              className="w-10 h-10 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 flex items-center justify-center text-white hover:scale-110 transform transition-transform duration-200 shadow-lg"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
              </svg>
            </motion.a>
            
            <motion.a
              href="https://discord.gg/R3VYAUzWwd"
              target="_blank"
              rel="noopener noreferrer"
              className="w-10 h-10 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 flex items-center justify-center text-white hover:scale-110 transform transition-transform duration-200 shadow-lg"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419-.019 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1568 2.4189Z"/>
              </svg>
            </motion.a>
            
            <motion.div
              className="w-10 h-10 rounded-full bg-gray-600 flex items-center justify-center text-white/40 cursor-not-allowed"
              title="Coming soon"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
              </svg>
            </motion.div>
            
            <motion.div
              className="w-10 h-10 rounded-full bg-gray-600 flex items-center justify-center text-white/40 cursor-not-allowed"
              title="Coming soon"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
            </motion.div>
          </div>
          
          <p className="text-xs text-white/40">
            © Ravedar
          </p>
        </motion.div>
      </div>
    </div>
  );
}

export default EventForm; 