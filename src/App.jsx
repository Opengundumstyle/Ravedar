import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import EventForm from './EventForm';
import Matches from './Matches';
import SignupForm from './SignupForm';
import SignInForm from './SignInForm';
import UserPanel from './UserPanel';
import OAuthCallback from './OAuthCallback';
import RadarLoader from './RadarLoader';
import { AuthProvider } from './AuthContext';
import { ensureUserId, ensureSectionId, clearSessionData } from './ensureUserId';

// Site reverted to pre-photo-upload state - triggering new deployment
// Immediate redirect check - runs before React loads
(function() {
  const currentPath = window.location.pathname;
  const isNotHome = currentPath !== '/';
  
  // Check if we have proper session data for non-home routes
  const hasSessionData = localStorage.getItem('user_profile_id') && localStorage.getItem('user_section_id');
  
  // Check for refresh on non-home routes
  const currentTime = Date.now();
  const lastLoadTime = sessionStorage.getItem('lastLoadTime');
  const isRefresh = lastLoadTime && (currentTime - parseInt(lastLoadTime)) < 5000;
  
  // If this is a refresh on a non-home route, clear data and redirect
  if (isRefresh && isNotHome) {
    // Clear session data
    localStorage.removeItem('user_profile_id');
    localStorage.removeItem('user_section_id');
    localStorage.removeItem('user_event_data');
    // Redirect to home
    window.location.href = '/';
    return;
  }
  
  // If we're on a non-home route without session data, redirect to home
  if (isNotHome && !hasSessionData) {
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
    // Generate user ID and section ID for new sessions
    ensureUserId().then((userId) => {
      if (userId) {
        // Always ensure section ID is generated for workflow
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
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<EventForm />} />
          <Route path="/matches" element={<Matches />} />
          <Route path="/signup" element={<SignupForm />} />
          <Route path="/signin" element={<SignInForm />} />
          <Route path="/user-panel" element={<UserPanel />} />
          <Route path="/oauth/callback" element={<OAuthCallback />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
