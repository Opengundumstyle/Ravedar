import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import { ensureSectionId } from './ensureUserId';

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

  // Ensure section ID is generated for workflow
  useEffect(() => {
    ensureSectionId();
  }, []);

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

    // Clear any existing event for this user before inserting a new one
    const { error: deleteError } = await supabase
      .from('user_events')
      .delete()
      .eq('user_id', userId);

    if (deleteError) {
      setError('Error clearing previous search. Please try again.');
      return;
    }

    // Insert new event
    const { error: insertError } = await supabase
      .from('user_events')
      .insert({
        user_id: userId,
        name: eventName,
        date: eventDate,
        city
      });

    if (insertError) {
      setError('Error saving event. Please try again.');
      return;
    }

    navigate('/matches');
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
      
      <div className="relative z-10 w-full max-w-md mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <motion.div
            className="mb-6 h-24 flex flex-col items-center justify-center"
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
                  ease: [0.4, 0.0, 0.2, 1] // Custom easing for smoother motion
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
                      delay: 0.2, // Small delay to appear after "Ravedar"
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
          
          {/* <motion.p 
            className="text-body-large text-white/80 leading-relaxed"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            Find your perfect rave match at your next event
          </motion.p> */}
        </div>

        {/* Form */}
        <motion.form
          onSubmit={handleSubmit}
          className="space-y-6"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
        >
          {/* Event/DJ Input */}
          <div className="space-y-2">
            <label className="text-caption text-white/70 block">
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
                className="w-full px-4 py-3 bg-black/40 backdrop-blur-sm border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-pink-500/50 focus:border-pink-500 transition-all duration-200"
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
          <div className="space-y-2">
            <label className="text-caption text-white/70 block">
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
                className="w-full px-4 py-3 bg-black/40 backdrop-blur-sm border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-pink-500/50 focus:border-pink-500 transition-all duration-200"
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
          <div className="space-y-2">
            <label className="text-caption text-white/70 block">
              Date (Optional)
            </label>
            <div className="relative">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-4 py-3 bg-black/40 backdrop-blur-sm border border-white/20 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-pink-500/50 focus:border-pink-500 transition-all duration-200"
              />
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="px-4 py-3 bg-red-500/20 border border-red-500/30 rounded-xl text-red-300 text-body-small"
            >
              {error}
            </motion.div>
          )}

          {/* Submit Button */}
          <motion.button
            type="submit"
            className="w-full py-4 px-6 bg-gradient-to-r from-pink-500 to-purple-600 text-white font-semibold text-lg rounded-xl hover:scale-105 transform transition-all duration-200 shadow-lg hover:shadow-xl"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            style={{
              boxShadow: '0 0 20px rgba(236, 72, 153, 0.3), 0 0 40px rgba(168, 85, 247, 0.2)'
            }}
          >
            Find My Rave Match
          </motion.button>
        </motion.form>

        {/* Footer */}
        <motion.div
          className="text-center mt-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.8 }}
        >
          <p className="text-body-small text-white/60">
            Connect with fellow ravers who share your vibe
          </p>
        </motion.div>
      </div>
    </div>
  );
}

export default EventForm; 