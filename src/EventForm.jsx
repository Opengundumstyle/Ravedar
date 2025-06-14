import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';

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

    // Check if user already has an event
    const { data: existingEvent, error: fetchError } = await supabase
      .from('user_events')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (fetchError) {
      setError('Error checking for existing event. Please try again.');
      return;
    }
    if (existingEvent) {
      setError('You already have an event assigned. Please refresh the page to start over.');
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-pink-50 py-8 px-2">
      <form onSubmit={handleSubmit} className="w-full max-w-5xl bg-white rounded-2xl shadow-xl p-8 flex flex-col gap-6 border border-gray-100">
        <h2 className="text-2xl font-bold text-center text-blue-600 mb-2">Find Your Rave Match</h2>
        {error && <div className="text-red-600 text-center mb-2">{error}</div>}
        <div className="flex flex-col gap-1 relative">
          <label className="font-semibold text-gray-700 mb-1">Event or DJ Name</label>
          <input
            type="text"
            value={eventName}
            onChange={e => {
              setEventName(e.target.value);
              setSelectedSuggestion(null);
            }}
            onFocus={() => setEventInputFocused(true)}
            onBlur={() => setTimeout(() => setEventInputFocused(false), 200)}
            className="input input-bordered w-full min-h-12 mx-auto rounded-lg border-gray-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition px-4"
            placeholder="Search by Artist or Event"
            autoFocus
            autoComplete="off"
          />
          {eventSuggestions.length > 0 && eventInputFocused && (
            <ul className="absolute z-10 bg-white border border-gray-200 rounded-lg top-full left-0 w-full max-h-40 overflow-y-auto shadow-lg mt-1">
              {eventSuggestions.map((suggestion, i) => (
                <li
                  key={i}
                  className="px-4 py-2 hover:bg-blue-100 cursor-pointer"
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
        </div>
        <div className="flex flex-col gap-1 relative">
          <label className="font-semibold text-gray-700 mb-1">City</label>
          <input
            type="text"
            value={city}
            onChange={e => {
              setCity(e.target.value);
              setCityInputFocused(true);
            }}
            onFocus={() => setCityInputFocused(true)}
            onBlur={() => setTimeout(() => setCityInputFocused(false), 200)}
            className="input input-bordered w-full rounded-lg border-gray-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition h-12 px-4"
            placeholder="Enter city"
            autoComplete="off"
          />
          {citySuggestions.length > 0 && cityInputFocused && (
            <ul className="absolute z-10 bg-white border border-gray-200 rounded-lg top-full left-0 w-full max-h-40 overflow-y-auto shadow-lg mt-1">
              {/* Up and coming city at the top if present and matches input */}
              {happeningSoonCity && (!city || happeningSoonCity.toLowerCase().includes(city.trim().toLowerCase())) && (
                <li
                  className="px-4 py-2 hover:bg-blue-100 cursor-pointer font-semibold text-blue-700 flex items-center justify-between"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setCity(happeningSoonCity);
                    setCityInputFocused(false);
                  }}
                >
                  <span>{happeningSoonCity}</span>
                  <span className="ml-2 text-xs bg-yellow-100 text-yellow-700 rounded px-2 py-0.5">up and coming</span>
                </li>
              )}
              {citySuggestions.map((suggestion, i) => (
                <li
                  key={i}
                  className="px-4 py-2 hover:bg-blue-100 cursor-pointer"
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
        </div>
        <div className="flex flex-col gap-1">
          <label className="font-semibold text-gray-700 mb-1">Date</label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="input input-bordered w-full rounded-lg border-gray-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition"
          />
        </div>
        <button
          type="submit"
          className="btn btn-primary w-full py-3 rounded-lg bg-blue-500 hover:bg-blue-600 text-white font-semibold text-lg shadow-md transition"
        >
          Submit Event
        </button>
      </form>
    </div>
  );
}

export default EventForm; 