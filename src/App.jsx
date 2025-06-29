import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import EventForm from './EventForm';
import Matches from './Matches';
import RadarLoader from './RadarLoader';
import { ensureUserId, ensureSectionId, clearSessionData } from './ensureUserId';

// Immediate redirect check - runs before React loads
(function() {
  const currentPath = window.location.pathname;
  const isNotHome = currentPath !== '/';
  
  // Check if we have proper session data for non-home routes
  const hasSessionData = localStorage.getItem('user_profile_id') && localStorage.getItem('user_section_id');
  
  // If we're on a non-home route without session data, redirect immediately
  if (isNotHome && !hasSessionData) {
    window.location.href = '/';
    return;
  }
  
  // Check for refresh on non-home routes
  const currentTime = Date.now();
  const lastLoadTime = sessionStorage.getItem('lastLoadTime');
  const isRefresh = lastLoadTime && (currentTime - parseInt(lastLoadTime)) < 5000;
  
  if (isRefresh && isNotHome) {
    // Clear session data and redirect
    localStorage.removeItem('user_profile_id');
    localStorage.removeItem('user_section_id');
    localStorage.removeItem('user_event_data');
    window.location.href = '/';
    return;
  }
  
  // Store current load time
  sessionStorage.setItem('lastLoadTime', currentTime.toString());
})();

function App() {
  const [userReady, setUserReady] = useState(false);
  const [userError, setUserError] = useState(false);

  useEffect(() => {
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
