import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from './supabaseClient';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

const UserPanel = () => {
  const [activeTab, setActiveTab] = useState('profile');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  // Profile data
  const [profileData, setProfileData] = useState({
    name: '',
    instagram: '',
    about_me: '',
    vibe_tags: []
  });

  // Settings data
  const [settings, setSettings] = useState({
    email_notifications: true,
    push_notifications: true,
    profile_visibility: true
  });

  // Photo data
  const [photos, setPhotos] = useState([]);
  const [uploading, setUploading] = useState(false);

  // Chat progress data
  const [chatProgress, setChatProgress] = useState({
    current_signups: 30,
    threshold: 100,
    remaining: 70,
    percentage: 30,
    is_released: false
  });

  // Available vibe tags
  const availableVibeTags = [
    'House', 'Techno', 'Trance', 'Dubstep', 'Drum & Bass', 'Hardstyle',
    'Progressive', 'Melodic', 'Bass', 'Trap', 'Future Bass', 'Psytrance',
    'Underground', 'Mainstage', 'Chill', 'Energy', 'PLUR', 'Festival',
    'Club', 'Warehouse', 'Outdoor', 'Sunset', 'Sunrise', 'Late Night'
  ];

  useEffect(() => {
    loadUserData();
    loadChatProgress();
    loadPhotos();
  }, []);

  const loadUserData = async () => {
    try {
      const userId = localStorage.getItem('user_profile_id');
      if (!userId) {
        navigate('/');
        return;
      }

      // Load profile data
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (profileError) throw profileError;

      setProfileData({
        name: profile.name || '',
        instagram: profile.instagram || '',
        about_me: profile.about_me || '',
        vibe_tags: profile.vibe_tags || []
      });

      // Load settings
      const { data: userSettings, error: settingsError } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (settingsError && settingsError.code !== 'PGRST116') throw settingsError;

      if (userSettings) {
        setSettings({
          email_notifications: userSettings.email_notifications,
          push_notifications: userSettings.push_notifications,
          profile_visibility: userSettings.profile_visibility
        });
      } else {
        // Create default settings
        const { error: createSettingsError } = await supabase
          .from('user_settings')
          .insert({
            user_id: userId,
            email_notifications: true,
            push_notifications: true,
            profile_visibility: true
          });

        if (createSettingsError) throw createSettingsError;
      }

    } catch (error) {
      console.error('Error loading user data:', error);
      setError('Failed to load user data');
    } finally {
      setLoading(false);
    }
  };

  const loadPhotos = async () => {
    try {
      const userId = localStorage.getItem('user_profile_id');
      if (!userId) return;

      const { data, error } = await supabase
        .from('user_photos')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setPhotos(data || []);
    } catch (error) {
      console.error('Error loading photos:', error);
      setError('Failed to load photos');
    }
  };

  const handlePhotoUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type and size
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) { // 5MB limit
      setError('Image size must be less than 5MB');
      return;
    }

    setUploading(true);
    setError('');

    try {
      const userId = localStorage.getItem('user_profile_id');
      const fileExt = file.name.split('.').pop();
      const fileName = `${userId}/${Date.now()}.${fileExt}`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('user-photos')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('user-photos')
        .getPublicUrl(fileName);

      // Save to database
      const { error: dbError } = await supabase
        .from('user_photos')
        .insert({
          user_id: userId,
          photo_url: publicUrl,
          file_name: fileName
        });

      if (dbError) throw dbError;

      setSuccess('Photo uploaded successfully!');
      setTimeout(() => setSuccess(''), 3000);
      
      // Reload photos
      await loadPhotos();
    } catch (error) {
      console.error('Error uploading photo:', error);
      setError('Failed to upload photo');
    } finally {
      setUploading(false);
    }
  };

  const handlePhotoDelete = async (photoId, fileName) => {
    if (!window.confirm('Are you sure you want to delete this photo?')) {
      return;
    }

    setSaving(true);
    setError('');

    try {
      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('user-photos')
        .remove([fileName]);

      if (storageError) throw storageError;

      // Delete from database
      const { error: dbError } = await supabase
        .from('user_photos')
        .delete()
        .eq('id', photoId);

      if (dbError) throw dbError;

      setSuccess('Photo deleted successfully!');
      setTimeout(() => setSuccess(''), 3000);
      
      // Reload photos
      await loadPhotos();
    } catch (error) {
      console.error('Error deleting photo:', error);
      setError('Failed to delete photo');
    } finally {
      setSaving(false);
    }
  };

  const loadChatProgress = async () => {
    try {
      const { data, error } = await supabase.rpc('get_chat_progress');
      if (error) throw error;
      
      if (data && data.length > 0) {
        setChatProgress(data[0]);
      }
    } catch (error) {
      console.error('Error loading chat progress:', error);
    }
  };

  const handleProfileUpdate = async () => {
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const userId = localStorage.getItem('user_profile_id');
      
      const { error } = await supabase
        .from('user_profiles')
        .update({
          name: profileData.name,
          instagram: profileData.instagram,
          about_me: profileData.about_me,
          vibe_tags: profileData.vibe_tags
        })
        .eq('id', userId);

      if (error) throw error;

      setSuccess('Profile updated successfully!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      console.error('Error updating profile:', error);
      setError('Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleSettingsUpdate = async () => {
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const userId = localStorage.getItem('user_profile_id');
      
      const { error } = await supabase
        .from('user_settings')
        .update({
          email_notifications: settings.email_notifications,
          push_notifications: settings.push_notifications,
          profile_visibility: settings.profile_visibility,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId);

      if (error) throw error;

      setSuccess('Settings updated successfully!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      console.error('Error updating settings:', error);
      setError('Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  const handleVibeTagToggle = (tag) => {
    setProfileData(prev => ({
      ...prev,
      vibe_tags: prev.vibe_tags.includes(tag)
        ? prev.vibe_tags.filter(t => t !== tag)
        : [...prev.vibe_tags, tag].slice(0, 5) // Max 5 tags
    }));
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const handleDeleteAccount = async () => {
    if (!window.confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
      return;
    }

    setSaving(true);
    try {
      const userId = localStorage.getItem('user_profile_id');
      
      // Delete user profile (cascades to other tables)
      const { error } = await supabase
        .from('user_profiles')
        .delete()
        .eq('id', userId);

      if (error) throw error;

      // Clear localStorage
      localStorage.removeItem('user_profile_id');
      localStorage.removeItem('user_section_id');
      localStorage.removeItem('user_event_data');

      navigate('/');
    } catch (error) {
      console.error('Error deleting account:', error);
      setError('Failed to delete account');
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex flex-col p-4 relative overflow-hidden">
      {/* Background Animation */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/20 via-purple-900/20 to-pink-900/20 animate-pulse"></div>
      
      <div className="relative z-10 w-full max-w-4xl mx-auto px-4 py-8 overflow-y-auto h-full">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <motion.button
            onClick={() => navigate('/matches')}
            className="flex items-center gap-2 px-4 py-2 bg-black/80 backdrop-blur-md border border-white/30 rounded-full text-white hover:text-white hover:bg-black/90 shadow-xl transition-all duration-300"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-sm font-medium">Back to Matching</span>
          </motion.button>

          <motion.button
            onClick={handleSignOut}
            className="px-4 py-2 bg-red-600/80 backdrop-blur-md border border-red-500/30 rounded-full text-white hover:bg-red-600/90 transition-all duration-300"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            Sign Out
          </motion.button>
        </div>

        {/* Title */}
        <motion.div
          className="text-center mb-8"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h1 className="text-display text-3xl text-white mb-2">
            User Panel
          </h1>
          <p className="text-body text-white/70">
            Manage your profile and settings
          </p>
        </motion.div>

        {/* Chat Progress Bar */}
        <motion.div
          className="bg-black/40 backdrop-blur-sm border border-white/20 rounded-2xl p-6 mb-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <div className="text-center mb-4">
            <h2 className="text-xl text-white font-semibold mb-2">
              {chatProgress.is_released ? '🎉 Chat Feature Released!' : '🚀 Chat Feature Coming Soon!'}
            </h2>
            <p className="text-white/70 mb-4">
              {chatProgress.is_released 
                ? 'Chat is now available for all users!'
                : `${chatProgress.remaining} more signups needed to unlock chat!`
              }
            </p>
          </div>

          <div className="mb-4">
            <div className="flex justify-between text-sm text-white/70 mb-2">
              <span>{chatProgress.current_signups} / {chatProgress.threshold} users</span>
              <span>{chatProgress.percentage}%</span>
            </div>
            <div className="w-full bg-white/20 rounded-full h-3 overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-pink-500 to-purple-600 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(chatProgress.percentage, 100)}%` }}
                transition={{ duration: 1, delay: 0.5 }}
              />
            </div>
          </div>

          <div className="text-center text-sm text-white/60">
            {chatProgress.is_released 
              ? '✨ Chat feature is now live! Connect with your matches!'
              : 'Help us reach 100 users to unlock the chat feature!'
            }
          </div>
        </motion.div>

        {/* Tab Navigation */}
        <div className="flex justify-center mb-8">
          <div className="bg-black/40 backdrop-blur-sm border border-white/20 rounded-xl p-1">
            {['profile', 'photos', 'settings', 'account'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-6 py-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                  activeTab === tab
                    ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white'
                    : 'text-white/70 hover:text-white hover:bg-white/10'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <AnimatePresence mode="wait">
          {activeTab === 'profile' && (
            <motion.div
              key="profile"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="bg-black/40 backdrop-blur-sm border border-white/20 rounded-2xl p-6"
            >
              <h2 className="text-xl text-white font-semibold mb-6">Edit Profile</h2>
              
              <div className="space-y-6">
                <div>
                  <label className="text-caption text-white/70 block mb-2">Name</label>
                  <input
                    type="text"
                    value={profileData.name}
                    onChange={(e) => setProfileData(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full px-4 py-3 bg-black/40 backdrop-blur-sm border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-pink-500/50 focus:border-pink-500 transition-all duration-200"
                    placeholder="Your name"
                  />
                </div>

                <div>
                  <label className="text-caption text-white/70 block mb-2">Instagram (Optional)</label>
                  <input
                    type="text"
                    value={profileData.instagram}
                    onChange={(e) => setProfileData(prev => ({ ...prev, instagram: e.target.value }))}
                    className="w-full px-4 py-3 bg-black/40 backdrop-blur-sm border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-pink-500/50 focus:border-pink-500 transition-all duration-200"
                    placeholder="@yourusername"
                  />
                </div>

                <div>
                  <label className="text-caption text-white/70 block mb-2">About Me</label>
                  <textarea
                    value={profileData.about_me}
                    onChange={(e) => setProfileData(prev => ({ ...prev, about_me: e.target.value }))}
                    rows="3"
                    className="w-full px-4 py-3 bg-black/40 backdrop-blur-sm border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-pink-500/50 focus:border-pink-500 transition-all duration-200 resize-none"
                    placeholder="Tell us about your rave journey..."
                  />
                </div>

                <div>
                  <label className="text-caption text-white/70 block mb-2">Vibe Tags (Select up to 5)</label>
                  <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                    {availableVibeTags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => handleVibeTagToggle(tag)}
                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                          profileData.vibe_tags.includes(tag)
                            ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white'
                            : 'bg-white/10 text-white/70 hover:bg-white/20'
                        }`}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>

                <motion.button
                  onClick={handleProfileUpdate}
                  disabled={saving}
                  className="w-full py-3 px-6 bg-gradient-to-r from-pink-500 to-purple-600 text-white font-semibold text-lg rounded-xl hover:scale-105 transform transition-all duration-200 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  whileHover={{ scale: saving ? 1 : 1.02 }}
                  whileTap={{ scale: saving ? 1 : 0.98 }}
                >
                  {saving ? 'Saving...' : 'Save Profile'}
                </motion.button>
              </div>
            </motion.div>
          )}

          {activeTab === 'photos' && (
            <motion.div
              key="photos"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="bg-black/40 backdrop-blur-sm border border-white/20 rounded-2xl p-6"
            >
              <h2 className="text-xl text-white font-semibold mb-6">Manage Photos</h2>
              
              <div className="space-y-6">
                {/* Upload Section */}
                <div className="bg-white/10 rounded-xl p-6">
                  <h3 className="text-white font-medium mb-4">Upload New Photo</h3>
                  <div className="flex items-center gap-4">
                    <label className="flex-1">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handlePhotoUpload}
                        disabled={uploading}
                        className="hidden"
                      />
                      <div className="w-full px-4 py-3 bg-black/40 backdrop-blur-sm border border-white/20 rounded-xl text-white/70 hover:text-white hover:bg-black/50 transition-all duration-200 cursor-pointer text-center">
                        {uploading ? 'Uploading...' : 'Choose Image (Max 5MB)'}
                      </div>
                    </label>
                  </div>
                  <p className="text-white/50 text-sm mt-2">
                    Supported formats: JPG, PNG, GIF. Maximum size: 5MB
                  </p>
                </div>

                {/* Photos Grid */}
                <div>
                  <h3 className="text-white font-medium mb-4">Your Photos ({photos.length})</h3>
                  {photos.length === 0 ? (
                    <div className="text-center py-8 text-white/50">
                      <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <p>No photos uploaded yet</p>
                      <p className="text-sm">Upload your first photo to get started!</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {photos.map((photo, index) => (
                        <div key={photo.id} className="relative group">
                          <img
                            src={photo.photo_url}
                            alt={`Photo ${index + 1}`}
                            className="w-full h-32 object-cover rounded-xl"
                          />
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-xl flex items-center justify-center">
                            <motion.button
                              onClick={() => handlePhotoDelete(photo.id, photo.file_name)}
                              disabled={saving}
                              className="px-3 py-1 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                              whileHover={{ scale: saving ? 1 : 1.05 }}
                              whileTap={{ scale: saving ? 1 : 0.95 }}
                            >
                              {saving ? 'Deleting...' : 'Delete'}
                            </motion.button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'settings' && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="bg-black/40 backdrop-blur-sm border border-white/20 rounded-2xl p-6"
            >
              <h2 className="text-xl text-white font-semibold mb-6">Settings</h2>
              
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-white font-medium">Email Notifications</h3>
                    <p className="text-white/60 text-sm">Receive email updates about matches and events</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.email_notifications}
                      onChange={(e) => setSettings(prev => ({ ...prev, email_notifications: e.target.checked }))}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-white/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-pink-500 peer-checked:to-purple-600"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-white font-medium">Push Notifications</h3>
                    <p className="text-white/60 text-sm">Get notified about new matches and messages</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.push_notifications}
                      onChange={(e) => setSettings(prev => ({ ...prev, push_notifications: e.target.checked }))}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-white/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-pink-500 peer-checked:to-purple-600"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-white font-medium">Profile Visibility</h3>
                    <p className="text-white/60 text-sm">Allow other users to see your profile</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.profile_visibility}
                      onChange={(e) => setSettings(prev => ({ ...prev, profile_visibility: e.target.checked }))}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-white/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-pink-500 peer-checked:to-purple-600"></div>
                  </label>
                </div>

                <motion.button
                  onClick={handleSettingsUpdate}
                  disabled={saving}
                  className="w-full py-3 px-6 bg-gradient-to-r from-pink-500 to-purple-600 text-white font-semibold text-lg rounded-xl hover:scale-105 transform transition-all duration-200 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  whileHover={{ scale: saving ? 1 : 1.02 }}
                  whileTap={{ scale: saving ? 1 : 0.98 }}
                >
                  {saving ? 'Saving...' : 'Save Settings'}
                </motion.button>
              </div>
            </motion.div>
          )}

          {activeTab === 'account' && (
            <motion.div
              key="account"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="bg-black/40 backdrop-blur-sm border border-white/20 rounded-2xl p-6"
            >
              <h2 className="text-xl text-white font-semibold mb-6">Account Management</h2>
              
              <div className="space-y-6">
                <div className="bg-white/10 rounded-xl p-4">
                  <h3 className="text-white font-medium mb-2">Account Information</h3>
                  <p className="text-white/70 text-sm mb-1">Email: {user?.email || 'Not available'}</p>
                  <p className="text-white/70 text-sm">Account Type: {profileData.is_real ? 'Real User' : 'Demo User'}</p>
                </div>

                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
                  <h3 className="text-red-300 font-medium mb-2">Danger Zone</h3>
                  <p className="text-red-300/70 text-sm mb-4">
                    These actions cannot be undone. Please be careful.
                  </p>
                  
                  <motion.button
                    onClick={handleDeleteAccount}
                    disabled={saving}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    whileHover={{ scale: saving ? 1 : 1.05 }}
                    whileTap={{ scale: saving ? 1 : 0.95 }}
                  >
                    {saving ? 'Deleting...' : 'Delete Account'}
                  </motion.button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Messages */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="mt-4 px-4 py-3 bg-red-500/20 border border-red-500/30 rounded-xl text-red-300 text-body-small"
            >
              {error}
            </motion.div>
          )}

          {success && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="mt-4 px-4 py-3 bg-green-500/20 border border-green-500/30 rounded-xl text-green-300 text-body-small"
            >
              {success}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default UserPanel; 