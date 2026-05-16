'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../lib/supabaseClient';
import { useRouter } from 'next/navigation';
import RadarLoader from '../components/RadarLoader';
import { useAuth } from '../components/AuthContext';

export default function UserPanelPage() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeTab, setActiveTab] = useState('profile');
  const [photos, setPhotos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const router = useRouter();
  const { isAuthenticated, signOut } = useAuth();

  // Available vibe tags
  const availableVibeTags = [
    'House', 'Techno', 'Trance', 'Dubstep', 'Drum & Bass', 'Hardstyle',
    'Progressive', 'Melodic', 'Bass', 'Trap', 'Future Bass', 'Psytrance',
    'Underground', 'Mainstage', 'Chill', 'Energy', 'PLUR', 'Festival',
    'Club', 'Warehouse', 'Outdoor', 'Sunset', 'Sunrise', 'Late Night'
  ];

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
          router.push('/signin');
          return;
        }

        setUser(user);

        // Fetch user profile
        const { data: profileData, error: profileError } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', user.id)
          .single();

        if (profileError && profileError.code !== 'PGRST116') {
          console.error('Profile fetch error:', profileError);
        } else if (profileData) {
          setProfile(profileData);
        }

        // Fetch user photos
        const { data: photosData, error: photosError } = await supabase
          .from('user_photos')
          .select('*')
          .eq('user_id', user.id)
          .order('position');

        if (photosError) {
          console.error('Photos fetch error:', photosError);
        } else {
          setPhotos(photosData || []);
        }

      } catch (error) {
        console.error('User data fetch error:', error);
        setError('Failed to load user data');
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, [router]);

  const handlePhotoUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (photos.length + files.length > 6) {
      setError('Maximum 6 photos allowed');
      return;
    }

    setUploading(true);
    setError('');

    try {
      const uploadedPhotos = [];
      
      for (const file of files) {
        if (!file.type.startsWith('image/')) {
          throw new Error('Please upload only image files');
        }
        if (file.size > 5 * 1024 * 1024) {
          throw new Error('File size must be less than 5MB');
        }

        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
        const filePath = `user-photos/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('user-photos')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('user-photos')
          .getPublicUrl(filePath);

        uploadedPhotos.push({
          image_url: publicUrl,
          position: photos.length + uploadedPhotos.length
        });
      }

      setPhotos(prev => [...prev, ...uploadedPhotos]);
    } catch (error) {
      setError(error.message);
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = async (index) => {
    try {
      const photoToRemove = photos[index];
      
      // Delete from database
      const { error } = await supabase
        .from('user_photos')
        .delete()
        .eq('id', photoToRemove.id);

      if (error) throw error;

      // Update local state
      setPhotos(prev => prev.filter((_, i) => i !== index));
    } catch (error) {
      setError('Failed to remove photo');
    }
  };

  const handleProfileUpdate = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const formData = new FormData(e.target);
      const updateData = {
        name: formData.get('name'),
        instagram: formData.get('instagram'),
        about_me: formData.get('aboutMe'),
        vibe_tags: profile.vibe_tags || []
      };

      const { error } = await supabase
        .from('user_profiles')
        .update(updateData)
        .eq('id', user.id);

      if (error) throw error;

      setProfile(prev => ({ ...prev, ...updateData }));
      setSuccess('Profile updated successfully!');
      
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      setError('Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleVibeTagToggle = (tag) => {
    const newVibeTags = profile.vibe_tags.includes(tag)
      ? profile.vibe_tags.filter(t => t !== tag)
      : [...profile.vibe_tags, tag].slice(0, 5);

    setProfile(prev => ({
      ...prev,
      vibe_tags: newVibeTags
    }));
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      router.push('/');
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  if (loading) {
    return <RadarLoader eventName="Loading your profile..." />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex flex-col p-4 relative overflow-y-auto">
      {/* Background Animation */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/20 via-purple-900/20 to-pink-900/20 animate-pulse"></div>
      
      <div className="relative z-10 w-full max-w-4xl mx-auto px-4 py-8">
        {/* Back Button */}
        <motion.button
          onClick={() => router.push('/matches')}
          className="absolute top-4 left-4 z-50 flex items-center gap-2 px-3 py-2 bg-black/80 backdrop-blur-md border border-white/30 rounded-full text-white hover:text-white hover:bg-black/90 shadow-xl transition-all duration-300 shadow-lg sm:px-4 sm:py-2"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span className="text-sm font-medium hidden sm:inline">Back to Matching</span>
        </motion.button>

        {/* Header */}
        <div className="text-center mb-8 mt-20 sm:mt-16">
          <motion.div
            className="mb-6"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="text-display text-3xl text-white mb-2">
              Your Profile
            </h1>
            <p className="text-body text-white/70">
              Manage your account and preferences
            </p>
          </motion.div>
        </div>

        {/* Tabs */}
        <div className="flex justify-center mb-8">
          <div className="bg-black/40 backdrop-blur-sm border border-white/20 rounded-xl p-1">
            {['profile', 'photos', 'settings'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-6 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  activeTab === tab
                    ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white'
                    : 'text-white/70 hover:text-white'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <motion.div
          className="bg-black/40 backdrop-blur-sm border border-white/20 rounded-2xl p-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <AnimatePresence mode="wait">
            {activeTab === 'profile' && (
              <motion.div
                key="profile"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <h2 className="text-heading text-xl text-white mb-4">Profile Information</h2>
                
                <form onSubmit={handleProfileUpdate} className="space-y-4">
                  <div>
                    <label className="text-caption text-white/70 block mb-2">Name</label>
                    <input
                      type="text"
                      name="name"
                      defaultValue={profile?.name || ''}
                      className="w-full px-4 py-3 bg-black/40 backdrop-blur-sm border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-pink-500/50 focus:border-pink-500 transition-all duration-200"
                      placeholder="Your name"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-caption text-white/70 block mb-2">Instagram (Optional)</label>
                    <input
                      type="text"
                      name="instagram"
                      defaultValue={profile?.instagram || ''}
                      className="w-full px-4 py-3 bg-black/40 backdrop-blur-sm border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-pink-500/50 focus:border-pink-500 transition-all duration-200"
                      placeholder="@yourusername"
                    />
                  </div>

                  <div>
                    <label className="text-caption text-white/70 block mb-2">About Me</label>
                    <textarea
                      name="aboutMe"
                      defaultValue={profile?.about_me || ''}
                      rows="3"
                      className="w-full px-4 py-3 bg-black/40 backdrop-blur-sm border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-pink-500/50 focus:border-pink-500 transition-all duration-200 resize-none"
                      placeholder="Tell us about your rave journey..."
                    />
                  </div>

                  <div>
                    <label className="text-caption text-white/70 block mb-2">Vibe Tags</label>
                    <p className="text-body-small text-white/50 mb-3">Select up to 5 vibe tags that describe your music taste</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {availableVibeTags.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => handleVibeTagToggle(tag)}
                          className={`px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                            profile?.vibe_tags?.includes(tag)
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
                    type="submit"
                    disabled={saving}
                    className="w-full py-3 px-6 bg-gradient-to-r from-pink-500 to-purple-600 text-white font-semibold text-lg rounded-xl hover:scale-105 transform transition-all duration-200 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    whileHover={{ scale: saving ? 1 : 1.02 }}
                    whileTap={{ scale: saving ? 1 : 0.98 }}
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
                  </motion.button>
                </form>
              </motion.div>
            )}

            {activeTab === 'photos' && (
              <motion.div
                key="photos"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <h2 className="text-heading text-xl text-white mb-4">Your Photos</h2>
                
                <div className="space-y-4">
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-white/30 rounded-xl p-6 text-center cursor-pointer hover:border-pink-500/50 transition-colors duration-200"
                  >
                    <div className="text-3xl mb-2">📸</div>
                    <p className="text-white/70 mb-2">Click to upload photos</p>
                    <p className="text-sm text-white/50">JPG, PNG up to 5MB each (Max 6 photos)</p>
                  </div>
                  
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />

                  {/* Photo Grid */}
                  {photos.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                      {photos.map((photo, index) => (
                        <div key={photo.id || index} className="relative group">
                          <img
                            src={photo.image_url}
                            alt={`Photo ${index + 1}`}
                            className="w-full h-32 sm:h-40 object-cover rounded-lg"
                          />
                          <button
                            onClick={() => removePhoto(index)}
                            className="absolute top-2 right-2 w-6 h-6 bg-red-500 text-white rounded-full text-xs opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {uploading && (
                    <div className="text-center text-white/70">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-pink-500 mx-auto mb-2"></div>
                      Uploading...
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {activeTab === 'settings' && (
              <motion.div
                key="settings"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <h2 className="text-heading text-xl text-white mb-4">Account Settings</h2>
                
                <div className="space-y-4">
                  <div className="bg-white/5 rounded-xl p-4">
                    <h3 className="text-heading text-lg text-white mb-2">Account Information</h3>
                    <p className="text-body text-white/70 mb-2">Email: {user?.email}</p>
                    <p className="text-body text-white/70">Member since: {new Date(user?.created_at).toLocaleDateString()}</p>
                  </div>

                  <div className="bg-white/5 rounded-xl p-4">
                    <h3 className="text-heading text-lg text-white mb-2">Danger Zone</h3>
                    <p className="text-body text-white/70 mb-4">These actions cannot be undone.</p>
                    
                    <motion.button
                      onClick={handleSignOut}
                      className="px-6 py-3 bg-red-500/20 border border-red-500/30 text-red-300 rounded-xl hover:bg-red-500/30 transition-colors duration-200"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      Sign Out
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error Message */}
          {error && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mt-4 px-4 py-3 bg-red-500/20 border border-red-500/30 rounded-xl text-red-300 text-body-small"
            >
              {error}
            </motion.div>
          )}

          {/* Success Message */}
          {success && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mt-4 px-4 py-3 bg-green-500/20 border border-green-500/30 rounded-xl text-green-300 text-body-small"
            >
              {success}
            </motion.div>
          )}
        </motion.div>
      </div>
    </div>
  );
} 