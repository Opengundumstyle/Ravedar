import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useEffect, useState } from 'react';
import EventForm from './EventForm';
import Matches from './Matches';
import RadarLoader from './RadarLoader';
import { ensureUserId } from './ensureUserId';

function App() {
  const [userReady, setUserReady] = useState(false);
  const [userError, setUserError] = useState(false);

  useEffect(() => {
    // Always clear the old user ID on load/refresh
    localStorage.removeItem('user_profile_id');
    ensureUserId().then((userId) => {
      if (userId) {
        setUserReady(true);
      } else {
        setUserError(true);
      }
    });
  }, []);

  if (userError) {
    return <div className="flex items-center justify-center h-screen text-xl text-red-600">Failed to create user session. Please refresh the page or contact support.</div>;
  }

  if (!userReady) {
    return <RadarLoader eventName={null} />;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<EventForm />} />
        <Route path="/matches" element={<Matches />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
