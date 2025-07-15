import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from './supabaseClient';
import { useNavigate } from 'react-router-dom';
import RadarLoader from './RadarLoader';
import { useAuth } from './AuthContext';

const SignupForm = () => {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  
  // Form data
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    name: '',
    instagram: '',
    aboutMe: '',
    vibeTags: []
  });
  
  // Photo upload
  const [photos, setPhotos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  
  // Available vibe tags
  const availableVibeTags = [
    'House', 'Techno', 'Trance', 'Dubstep', 'Drum & Bass', 'Hardstyle',
    'Progressive', 'Melodic', 'Bass', 'Trap', 'Future Bass', 'Psytrance',
    'Underground', 'Mainstage', 'Chill', 'Energy', 'PLUR', 'Festival',
    'Club', 'Warehouse', 'Outdoor', 'Sunset', 'Sunrise', 'Late Night'
  ];

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleVibeTagToggle = (tag) => {
    setFormData(prev => ({
      ...prev,
      vibeTags: prev.vibeTags.includes(tag)
        ? prev.vibeTags.filter(t => t !== tag)
        : [...prev.vibeTags, tag].slice(0, 5) // Max 5 tags
    }));
  };

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
        // Validate file type and size
        if (!file.type.startsWith('image/')) {
          throw new Error('Please upload only image files');
        }
        if (file.size > 5 * 1024 * 1024) { // 5MB limit
          throw new Error('File size must be less than 5MB');
        }

        // Create unique filename
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
        const filePath = `user-photos/${fileName}`;

        // Upload to Supabase Storage
        const { error: uploadError } = await supabase.storage
          .from('user-photos')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        // Get public URL
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

  const removePhoto = (index) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      console.log('Starting signup process...');
      
      // Validate passwords match
      if (formData.password !== formData.confirmPassword) {
        throw new Error('Passwords do not match');
      }

      // Validate password strength
      if (formData.password.length < 6) {
        throw new Error('Password must be at least 6 characters long');
      }

      console.log('Creating Supabase Auth user...');
      
      // Step 1: Create Supabase Auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            name: formData.name,
            instagram: formData.instagram,
            about_me: formData.aboutMe,
            vibe_tags: formData.vibeTags
          },
          emailRedirectTo: `${window.location.origin}/oauth/callback`
        }
      });

      if (authError) {
        console.error('Auth error:', authError);
        throw authError;
      }

      if (!authData.user) {
        throw new Error('Failed to create user account');
      }

      console.log('Auth user created:', authData.user.id);

      // Check if email confirmation is required
      if (authData.user.email_confirmed_at === null) {
        console.log('Email confirmation required');
        setSuccess('Account created! Please check your email and click the confirmation link to activate your account. You can then sign in.');
        
        setTimeout(() => {
          setLoading(false);
          setSuccess('');
          navigate('/signin');
        }, 5000);
        return;
      }

      // Step 2: Create user session entry (required for foreign key constraint)
      console.log('Creating user session...');
      const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(); // 1 year expiry for authenticated users
      
      // First check if session already exists
      const { data: existingSession, error: sessionCheckError } = await supabase
        .from('user_sessions')
        .select('id')
        .eq('id', authData.user.id)
        .single();

      if (sessionCheckError && sessionCheckError.code !== 'PGRST116') {
        // PGRST116 is "not found" error, which is expected for new users
        console.error('Session check error:', sessionCheckError);
        throw new Error('Failed to check user session. Please try again.');
      }

      if (!existingSession) {
        // Create new session
        const { error: sessionError } = await supabase
          .from('user_sessions')
          .insert({
            id: authData.user.id,
            expires_at: expiresAt
          });

        if (sessionError) {
          console.error('Session creation error:', sessionError);
          throw new Error(`Failed to create user session: ${sessionError.message}`);
        } else {
          console.log('User session created successfully');
        }
      } else {
        console.log('User session already exists, updating expiry...');
        // Update existing session expiry
        const { error: sessionUpdateError } = await supabase
          .from('user_sessions')
          .update({ expires_at: expiresAt })
          .eq('id', authData.user.id);

        if (sessionUpdateError) {
          console.error('Session update error:', sessionUpdateError);
          // Don't throw error here, just log it
        } else {
          console.log('User session updated successfully');
        }
      }

      // Step 3: Create user profile
      console.log('Creating user profile...');
      
      // First check if profile already exists
      const { data: existingProfile, error: checkError } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('id', authData.user.id)
        .single();

      if (checkError && checkError.code !== 'PGRST116') {
        // PGRST116 is "not found" error, which is expected for new users
        console.error('Profile check error:', checkError);
        throw new Error('Failed to check user profile. Please try again.');
      }

      let profileData;
      if (existingProfile) {
        console.log('Profile already exists, updating...');
        // Update existing profile
        const { data: updateData, error: updateError } = await supabase
          .from('user_profiles')
          .update({
            name: formData.name,
            instagram: formData.instagram,
            about_me: formData.aboutMe,
            vibe_tags: formData.vibeTags,
            is_real: true,
            expires_at: expiresAt
          })
          .eq('id', authData.user.id)
          .select()
          .single();

        if (updateError) {
          console.error('Profile update error details:', {
            code: updateError.code,
            message: updateError.message,
            details: updateError.details,
            hint: updateError.hint
          });
          throw new Error(`Failed to update user profile: ${updateError.message}`);
        }
        profileData = updateData;
      } else {
        // Create new profile
        console.log('Creating new profile with data:', {
          id: authData.user.id,
          name: formData.name,
          instagram: formData.instagram,
          about_me: formData.aboutMe,
          vibe_tags: formData.vibeTags,
          is_real: true,
          expires_at: expiresAt
        });
        
        const { data: createData, error: createError } = await supabase
          .from('user_profiles')
          .insert({
            id: authData.user.id,
            name: formData.name,
            instagram: formData.instagram,
            about_me: formData.aboutMe,
            vibe_tags: formData.vibeTags,
            is_real: true,
            expires_at: expiresAt
          })
          .select()
          .single();

        if (createError) {
          console.error('Profile creation error details:', {
            code: createError.code,
            message: createError.message,
            details: createError.details,
            hint: createError.hint
          });
          throw new Error(`Failed to create user profile: ${createError.message}`);
        }
        profileData = createData;
      }

      console.log('User profile created/updated successfully:', profileData);

      // Step 4: Upload photos if any
      if (photos.length > 0) {
        console.log('Uploading photos...');
        for (let i = 0; i < photos.length; i++) {
          const photo = photos[i];
          console.log(`Uploading photo ${i + 1}/${photos.length}:`, photo);
          
          const { error: photoError } = await supabase
            .from('user_photos')
            .insert({
              user_id: authData.user.id,
              image_url: photo.image_url,
              position: i
            });

          if (photoError) {
            console.error(`Photo ${i + 1} upload error details:`, {
              code: photoError.code,
              message: photoError.message,
              details: photoError.details,
              hint: photoError.hint
            });
            // Don't throw error for photo upload failures, just log them
            // The account is still created successfully
          } else {
            console.log(`Photo ${i + 1} uploaded successfully`);
          }
        }
        console.log('All photos processed');
      }

      // Step 5: Update localStorage with new user ID
      console.log('Updating localStorage...');
      localStorage.setItem('user_profile_id', authData.user.id);
      
      // Clear any old anonymous user data
      localStorage.removeItem('user_section_id');
      localStorage.removeItem('user_event_data');

      // Step 6: Show success message and redirect
      console.log('Signup completed successfully');
      setSuccess('Account created successfully! Welcome to Ravedar! 🎉');
      
      setTimeout(() => {
        setLoading(false);
        setSuccess('');
        // Redirect to event selection (home page) so user can set up their event
        console.log('Redirecting to home page...');
        navigate('/');
      }, 2000);

    } catch (error) {
      console.error('Signup error:', error);
      setError(error.message || 'Failed to create account. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const nextStep = () => {
    if (step === 1) {
      if (!formData.email || !formData.password || !formData.confirmPassword) {
        setError('Please fill in all required fields');
        return;
      }
      if (formData.password !== formData.confirmPassword) {
        setError('Passwords do not match');
        return;
      }
      if (formData.password.length < 6) {
        setError('Password must be at least 6 characters long');
        return;
      }
      if (!formData.email.includes('@')) {
        setError('Please enter a valid email address');
        return;
      }
    }
    if (step === 2 && !formData.name) {
      setError('Please enter your name');
      return;
    }
    if (step === 3 && formData.vibeTags.length === 0) {
      setError('Please select at least one vibe tag');
      return;
    }
    setStep(prev => prev + 1);
    setError('');
  };

  const prevStep = () => {
    setStep(prev => prev - 1);
    setError('');
  };

  // Redirect if user is already authenticated
  if (isAuthenticated && user) {
    navigate('/matches');
    return null;
  }

  if (loading && step === 4) {
    return <RadarLoader eventName="Creating your profile..." />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex flex-col p-4 relative overflow-y-auto">
      {/* Background Animation */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/20 via-purple-900/20 to-pink-900/20 animate-pulse"></div>
      
      <div className="relative z-10 w-full max-w-md mx-auto px-4 py-8">
        {/* Back Button */}
        <motion.button
          onClick={() => navigate('/matches')}
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
              Join Ravedar
            </h1>
            <p className="text-body text-white/70">
              Connect with fellow ravers and find your perfect match
            </p>
          </motion.div>

          {/* Progress Steps */}
          <div className="flex justify-center mb-8">
            {[1, 2, 3, 4].map((stepNumber) => (
              <div key={stepNumber} className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                  stepNumber <= step 
                    ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white' 
                    : 'bg-white/20 text-white/60'
                }`}>
                  {stepNumber}
                </div>
                {stepNumber < 4 && (
                  <div className={`w-12 h-1 mx-2 ${
                    stepNumber < step ? 'bg-gradient-to-r from-pink-500 to-purple-600' : 'bg-white/20'
                  }`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Form */}
        <motion.div
          className="bg-black/40 backdrop-blur-sm border border-white/20 rounded-2xl p-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <h2 className="text-heading text-xl text-white mb-4">Create Your Account</h2>
                
                <div>
                  <label className="text-caption text-white/70 block mb-2">Email</label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 bg-black/40 backdrop-blur-sm border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-pink-500/50 focus:border-pink-500 transition-all duration-200"
                    placeholder="your@email.com"
                    required
                  />
                </div>

                <div>
                  <label className="text-caption text-white/70 block mb-2">Password</label>
                  <input
                    type="password"
                    name="password"
                    value={formData.password}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 bg-black/40 backdrop-blur-sm border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-pink-500/50 focus:border-pink-500 transition-all duration-200"
                    placeholder="Create a password"
                    required
                  />
                </div>

                <div>
                  <label className="text-caption text-white/70 block mb-2">Confirm Password</label>
                  <input
                    type="password"
                    name="confirmPassword"
                    value={formData.confirmPassword}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 bg-black/40 backdrop-blur-sm border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-pink-500/50 focus:border-pink-500 transition-all duration-200"
                    placeholder="Confirm your password"
                    required
                  />
                </div>

                <motion.button
                  onClick={nextStep}
                  className="w-full py-3 px-6 bg-gradient-to-r from-pink-500 to-purple-600 text-white font-semibold text-lg rounded-xl hover:scale-105 transform transition-all duration-200 shadow-lg"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  Continue
                </motion.button>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <h2 className="text-heading text-xl text-white mb-4">Tell Us About Yourself</h2>
                
                <div>
                  <label className="text-caption text-white/70 block mb-2">Name</label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
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
                    value={formData.instagram}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 bg-black/40 backdrop-blur-sm border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-pink-500/50 focus:border-pink-500 transition-all duration-200"
                    placeholder="@yourusername"
                  />
                </div>

                <div>
                  <label className="text-caption text-white/70 block mb-2">About Me</label>
                  <textarea
                    name="aboutMe"
                    value={formData.aboutMe}
                    onChange={handleInputChange}
                    rows="3"
                    className="w-full px-4 py-3 bg-black/40 backdrop-blur-sm border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-pink-500/50 focus:border-pink-500 transition-all duration-200 resize-none"
                    placeholder="Tell us about your rave journey..."
                  />
                </div>

                <div className="flex gap-3">
                  <motion.button
                    onClick={prevStep}
                    className="flex-1 py-3 px-6 bg-white/20 backdrop-blur-sm border border-white/30 text-white font-semibold text-lg rounded-xl hover:bg-white/30 transform transition-colors duration-200"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    Back
                  </motion.button>
                  <motion.button
                    onClick={nextStep}
                    className="flex-1 py-3 px-6 bg-gradient-to-r from-pink-500 to-purple-600 text-white font-semibold text-lg rounded-xl hover:scale-105 transform transition-all duration-200 shadow-lg"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    Continue
                  </motion.button>
                </div>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <h2 className="text-heading text-xl text-white mb-4">Choose Your Vibe</h2>
                <p className="text-body text-white/70 mb-4">Select up to 5 vibe tags that describe your music taste</p>
                
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                  {availableVibeTags.map((tag) => (
                    <motion.button
                      key={tag}
                      type="button"
                      onClick={() => handleVibeTagToggle(tag)}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                        formData.vibeTags.includes(tag)
                          ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white'
                          : 'bg-white/10 text-white/70 hover:bg-white/20'
                      }`}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      {tag}
                    </motion.button>
                  ))}
                </div>

                <div className="flex gap-3">
                  <motion.button
                    onClick={prevStep}
                    className="flex-1 py-3 px-6 bg-white/20 backdrop-blur-sm border border-white/30 text-white font-semibold text-lg rounded-xl hover:bg-white/30 transform transition-colors duration-200"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    Back
                  </motion.button>
                  <motion.button
                    onClick={nextStep}
                    className="flex-1 py-3 px-6 bg-gradient-to-r from-pink-500 to-purple-600 text-white font-semibold text-lg rounded-xl hover:scale-105 transform transition-all duration-200 shadow-lg"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    Continue
                  </motion.button>
                </div>
              </motion.div>
            )}

            {step === 4 && (
              <motion.div
                key="step4"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4"
              >
                <h2 className="text-heading text-xl text-white mb-4">Add Your Photos</h2>
                <p className="text-body text-white/70 mb-4">Upload up to 6 photos to show off your rave style</p>
                
                {/* Photo Upload Area */}
                <div className="space-y-4">
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-white/30 rounded-xl p-6 text-center cursor-pointer hover:border-pink-500/50 transition-colors duration-200"
                  >
                    <div className="text-3xl mb-2">📸</div>
                    <p className="text-white/70 mb-2">Click to upload photos</p>
                    <p className="text-sm text-white/50">JPG, PNG up to 5MB each</p>
                  </div>
                  
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />

                  {/* Photo Preview */}
                  {photos.length > 0 && (
                    <div className="grid grid-cols-3 gap-2">
                      {photos.map((photo, index) => (
                        <div key={index} className="relative group">
                          <img
                            src={photo.image_url}
                            alt={`Photo ${index + 1}`}
                            className="w-full h-24 object-cover rounded-lg"
                          />
                          <button
                            onClick={() => removePhoto(index)}
                            className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full text-xs opacity-0 group-hover:opacity-100 transition-opacity duration-200"
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

                <div className="flex gap-3">
                  <motion.button
                    onClick={prevStep}
                    className="flex-1 py-3 px-6 bg-white/20 backdrop-blur-sm border border-white/30 text-white font-semibold text-lg rounded-xl hover:bg-white/30 transform transition-colors duration-200"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    Back
                  </motion.button>
                  <motion.button
                    onClick={handleSignup}
                    disabled={loading}
                    className="flex-1 py-3 px-6 bg-gradient-to-r from-pink-500 to-purple-600 text-white font-semibold text-lg rounded-xl hover:scale-105 transform transition-all duration-200 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                    whileHover={{ scale: loading ? 1 : 1.02 }}
                    whileTap={{ scale: loading ? 1 : 0.98 }}
                  >
                    {loading ? 'Creating Account...' : 'Create Account'}
                  </motion.button>
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

        {/* Back to Home */}
        <motion.div
          className="text-center mt-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          <button
            onClick={() => navigate('/')}
            className="text-body text-white/60 hover:text-white transition-colors duration-200"
          >
            ← Back to Home
          </button>
          <div className="mt-2">
            <span className="text-body-small text-white/50">Already have an account? </span>
            <button
              onClick={() => navigate('/signin')}
              className="text-body-small text-pink-400 hover:text-pink-300 underline font-medium transition-colors duration-200"
            >
              Sign in here
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default SignupForm; 