import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';

const TICKETMASTER_API_KEY = import.meta.env.VITE_TICKETMASTER_API_KEY;

function EventForm() {
  const [eventName, setEventName] = useState('');
  const [date, setDate] = useState('');
  const [city, setCity] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    const userId = localStorage.getItem('user_profile_id');
    if (!userId) {
      alert('User ID not found. Please refresh the page.');
      return;
    }
    // Convert empty date to null
    const eventDate = date === '' ? null : date;
    const { data, error } = await supabase.from('user_events').insert({
      user_id: userId,
      name: eventName,
      date: eventDate,
      city
    });
    if (error) {
      console.error('Supabase insert error:', error);
    } else {
      console.log('Insert success:', data);
    }
    navigate('/matches');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-pink-50 py-8 px-2">
      <form onSubmit={handleSubmit} className="w-full max-w-5xl bg-white rounded-2xl shadow-xl p-8 flex flex-col gap-6 border border-gray-100">
        <h2 className="text-2xl font-bold text-center text-blue-600 mb-2">Find Your Rave Match</h2>
        <div className="flex flex-col gap-1">
          <label className="font-semibold text-gray-700 mb-1">Event Name</label>
          <input
            type="text"
            value={eventName}
            onChange={e => setEventName(e.target.value)}
            className="input input-bordered w-full min-h-12 mx-auto rounded-lg border-gray-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition px-4"
            placeholder="Search by Artist,Event or Venue"
            autoFocus
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="font-semibold text-gray-700 mb-1">City</label>
          <input
            type="text"
            value={city}
            onChange={e => setCity(e.target.value)}
            className="input input-bordered w-full rounded-lg border-gray-300 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition h-12 px-4"
            placeholder="Enter city"
          />
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