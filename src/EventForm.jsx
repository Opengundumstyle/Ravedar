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
      { text: "Ravedar", weight: 'font-bold' },
      { text: "Find Your Rave Match", weight: 'font-light' }
    ];
    let index = 0;
    
    const cycleTitles = () => {
      if (index < sequence.length) {
        setTitle(sequence[index]);
        index++;
        setTimeout(cycleTitles, 1800);
      }
    };
    
    cycleTitles(); // Start the sequence immediately
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
    <div className="h-screen flex items-center justify-center bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 py-8 px-2 overflow-hidden">
      <motion.form 
        onSubmit={handleSubmit} 
        className="w-[480px] h-[650px] bg-black/20 backdrop-blur-lg rounded-2xl shadow-2xl shadow-purple-500/20 p-8 flex flex-col gap-6 border border-white/20"
        variants={formVariants}
        initial="hidden"
        animate="visible"
      >
        <AnimatePresence mode="wait">
          <motion.h2
            key={title.text}
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.5 }}
            className={`text-3xl text-center text-white drop-shadow-[0_2px_4px_rgba(168,85,247,0.5)] mb-2 h-10 flex items-center justify-center ${title.weight === 'font-light' ? 'font-light' : 'font-semibold'}`}
          >
            {title.text}
          </motion.h2>
        </AnimatePresence>
        {error && <motion.div variants={itemVariants} className="text-red-400 bg-red-900/50 rounded-md py-2 text-center mb-2 text-sm font-medium">{error}</motion.div>}
        <motion.div variants={itemVariants} className="flex flex-col gap-1 relative">
          <label className="font-medium text-purple-200 mb-1 flex items-center justify-between text-sm">
            <span>Event or DJ Name</span>
            <span className="text-red-400 text-lg">*</span>
          </label>
          <input
            type="text"
            value={eventName}
            onChange={e => {
              setEventName(e.target.value);
              setSelectedSuggestion(null);
            }}
            onFocus={() => setEventInputFocused(true)}
            onBlur={() => setTimeout(() => setEventInputFocused(false), 200)}
            className="input bg-black/30 text-white border-purple-400/50 placeholder:text-gray-400 w-full h-12 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-500/50 transition px-4"
            placeholder="Search by Artist or Event"
            autoFocus
            autoComplete="off"
          />
          {eventSuggestions.length > 0 && eventInputFocused && (
            <ul className="absolute z-10 bg-gray-900/80 backdrop-blur-md border border-white/10 rounded-lg top-full left-0 w-full max-h-40 overflow-y-auto shadow-lg mt-1">
              {eventSuggestions.map((suggestion, i) => (
                <li
                  key={i}
                  className="px-4 py-2 hover:bg-purple-500/30 cursor-pointer text-gray-200"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setEventName(suggestion.name);
                    setSelectedSuggestion(suggestion);
                    setEventInputFocused(false);
                  }}
                >
                  {suggestion.name} <span className="ml-2 text-xs text-gray-400">({suggestion.type})</span>
                </li>
              ))}
            </ul>
          )}
        </motion.div>
        <motion.div variants={itemVariants} className="flex flex-col gap-1 relative">
          <label className="font-medium text-purple-200 mb-1 flex items-center justify-between text-sm">
            <span>City</span>
            <span className="text-red-400 text-lg">*</span>
          </label>
          <input
            type="text"
            value={city}
            onChange={e => {
              setCity(e.target.value);
              setCityInputFocused(true);
            }}
            onFocus={() => setCityInputFocused(true)}
            onBlur={() => setTimeout(() => setCityInputFocused(false), 200)}
            className="input bg-black/30 text-white border-purple-400/50 placeholder:text-gray-400 w-full rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-500/50 transition h-12 px-4"
            placeholder="Enter city"
            autoComplete="off"
          />
          {citySuggestions.length > 0 && cityInputFocused && (
            <ul className="absolute z-10 bg-gray-900/80 backdrop-blur-md border border-white/10 rounded-lg top-full left-0 w-full max-h-40 overflow-y-auto shadow-lg mt-1">
              {/* Up and coming city at the top if present and matches input */}
              {happeningSoonCity && (!city || happeningSoonCity.toLowerCase().includes(city.trim().toLowerCase())) && (
                <li
                  className="px-4 py-2 hover:bg-purple-500/30 cursor-pointer font-semibold text-purple-300 flex items-center justify-between"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setCity(happeningSoonCity);
                    setCityInputFocused(false);
                  }}
                >
                  <span>{happeningSoonCity}</span>
                  <span className="ml-2 text-xs bg-yellow-300 text-yellow-900 rounded px-2 py-0.5">up and coming</span>
                </li>
              )}
              {citySuggestions.map((suggestion, i) => (
                <li
                  key={i}
                  className="px-4 py-2 hover:bg-purple-500/30 cursor-pointer text-gray-200"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setCity(suggestion);
                    setCityInputFocused(false);
                  }}
                >
                  {suggestion}
                </li>
              ))}
            </ul>
          )}
        </motion.div>
        <motion.div variants={itemVariants} className="flex flex-col gap-1">
          <label className="font-medium text-purple-200 mb-1 text-sm">Date (optional)</label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="input bg-black/30 text-white border-purple-400/50 w-full rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-500/50 transition h-12 px-4"
          />
        </motion.div>
        <motion.button
          variants={itemVariants}
          type="submit"
          className="btn w-full py-3 rounded-lg bg-gradient-to-r from-pink-500 to-purple-600 text-white font-semibold text-lg hover:scale-105 transform transition-transform duration-200 flex items-center justify-center animate-button-glow"
          whileTap={{ scale: 0.98 }}
        >
          <span>Find My Ravebae </span>
          <motion.span 
            className="ml-2 text-xl bg-clip-text text-transparent bg-gradient-to-r from-pink-300 via-sky-400 to-lime-300"
            animate={{ 
              rotateY: [0, 1440, 1440, 1440],
              scale: [1, 1.5, 1, 1.8, 0.6, 1.2, 0.9, 1],
              filter: [
                "brightness(1) blur(0px)",
                "brightness(1.2) blur(0px)", 
                "brightness(1.5) blur(1px)",
                "brightness(2) blur(2px)",
                "brightness(1.8) blur(1px)",
                "brightness(1.3) blur(0.5px)",
                "brightness(1.1) blur(0px)",
                "brightness(1) blur(0px)"
              ]
            }}
            transition={{ 
              duration: 5,
              times: [0, 0.4, 0.6, 0.7, 0.8, 0.9, 0.95, 1],
              ease: "easeOut"
            }}
          >
            ❤️
          </motion.span>
        </motion.button>
      </motion.form>
    </div>
  );
}

export default EventForm; 