import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import EventForm from './EventForm';
import Matches from './Matches';
import RadarLoader from './RadarLoader';
import { ensureUserId, ensureSectionId, clearSessionData } from './ensureUserId';

function App() {
  const [userReady, setUserReady] = useState(false);
  const [userError, setUserError] = useState(false);

  useEffect(() => {
    // Check if this is a page refresh
    const isRefresh = !window.performance.navigation || window.performance.navigation.type === 1;
    
    if (isRefresh) {
      // Clear all session data on refresh
      clearSessionData();
      
      // Redirect to home page if not already there
      if (window.location.pathname !== 'https://www.rave-dar.com/') {
        window.location.href = 'https://www.rave-dar.com/';
        return;
      }
    }

    // Always clear the old user ID on load/refresh
    localStorage.removeItem('user_profile_id');
    ensureUserId().then((userId) => {
      if (userId) {
        // Ensure section ID is generated for workflow
        ensureSectionId();
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
