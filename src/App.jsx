import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useEffect, useState, useMemo } from 'react';
import EventForm from './EventForm';
import Matches from './Matches';
import { ensureUserId } from './ensureUserId';
import AudioPlayer from './AudioPlayer';

const songList = [
  "GhostDragon & Daye - Blindside (Lyrics).mp3",
  "Seven Lions, SLANDER, & Dabin - First Time feat. Dylan Matthew  Ophelia Records.mp3",
  "ILLENIUM, Midnight Kids - Hold On (Midnight Kids Remix  Official Audio) ft. Georgia Ku.mp3",
  "yetep - Petals from a Rose ft. Kyle Reynolds (Lyric Video) [Proximity Release].mp3"
  // Add more song filenames here, e.g., "another-song.mp3"
];

function App() {
  const [userReady, setUserReady] = useState(false);
  const [userError, setUserError] = useState(false);

  // Randomly select a song and create a clean title
  const { songFile, songTitle } = useMemo(() => {
    const randomIndex = Math.floor(Math.random() * songList.length);
    const selectedSong = songList[randomIndex];
    
    // Create a clean title by removing extension and decoding
    const title = decodeURIComponent(selectedSong.replace(/\.mp3$/, ''));
    
    // Create a safe URL-encoded path for the src prop
    const file = selectedSong.replace(/ /g, '%20');
    
    return { songFile: `/${file}`, songTitle: title };
  }, []);

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
    // You might want to use your RadarLoader here instead of "Loading..."
    return <div className="flex items-center justify-center h-screen text-xl">Loading...</div>;
  }

  return (
    <BrowserRouter>
      <AudioPlayer src={songFile} title={songTitle} />
      <Routes>
        <Route path="/" element={<EventForm />} />
        <Route path="/matches" element={<Matches />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
