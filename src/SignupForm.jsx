import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from './supabaseClient';
import { useNavigate } from 'react-router-dom';
import RadarLoader from './RadarLoader';

const SignupForm = () => {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const navigate = useNavigate();
  
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
      // Simulate loading for better UX
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Show temporary message
      setSuccess('Sorry, something went wrong with signup... We are working hard on this! Come back later! 🚧');
      
      // Reset form after showing message
      setTimeout(() => {
        setLoading(false);
        setSuccess('');
        navigate('/matches');
      }, 3000);

    } catch (error) {
      console.error('Signup error:', error);
      setError('Sorry, something went wrong with signup... We are working hard on this! Come back later!');
    } finally {
      setLoading(false);
    }
  };

  const handleSocialSignup = async (provider) => {
    setLoading(true);
    setError('');

    try {
      // Simulate loading for better UX
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Show temporary message
      setSuccess('Sorry, something went wrong with signup... We are working hard on this! Come back later! 🚧');
      
      // Reset form after showing message
      setTimeout(() => {
        setLoading(false);
        setSuccess('');
        navigate('/matches');
      }, 3000);
      
    } catch (error) {
      setError('Sorry, something went wrong with signup... We are working hard on this! Come back later!');
      setLoading(false);
    }
  };

  const nextStep = () => {
    if (step === 1 && (!formData.email || !formData.password || !formData.confirmPassword)) {
      setError('Please fill in all required fields');
      return;
    }
    if (step === 2 && !formData.name) {
      setError('Please enter your name');
      return;
    }
    setStep(prev => prev + 1);
    setError('');
  };

  const prevStep = () => {
    setStep(prev => prev - 1);
    setError('');
  };

  if (loading && step === 4) {
    return <RadarLoader eventName="Creating your profile..." />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background Animation */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/20 via-purple-900/20 to-pink-900/20 animate-pulse"></div>
      
      <div className="relative z-10 w-full max-w-md mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
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

        {/* Social Login Section */}
        {step === 1 && (
          <motion.div
            className="mt-6 text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
          >
            <div className="flex items-center mb-4">
              <div className="flex-1 h-px bg-gray-600"></div>
              <span className="px-4 text-gray-400 text-sm font-medium">or continue with</span>
              <div className="flex-1 h-px bg-gray-600"></div>
            </div>
            
            <div className="space-y-3">
              <motion.button
                onClick={() => handleSocialSignup('google')}
                className="w-full py-3 px-6 rounded-xl bg-white text-gray-800 font-medium hover:scale-105 transform transition-transform duration-200 shadow-lg border border-gray-200"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <div className="flex items-center justify-center gap-3">
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  <span>Continue with Google</span>
                </div>
              </motion.button>
              
              <motion.button
                onClick={() => handleSocialSignup('facebook')}
                className="w-full py-3 px-6 rounded-xl bg-blue-600 text-white font-medium hover:scale-105 transform transition-transform duration-200 shadow-lg border border-blue-500"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <div className="flex items-center justify-center gap-3">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                  <span>Continue with Facebook</span>
                </div>
              </motion.button>
              
              <motion.button
                onClick={() => handleSocialSignup('apple')}
                className="w-full py-3 px-6 rounded-xl bg-black text-white font-medium hover:scale-105 transform transition-transform duration-200 shadow-lg border border-gray-700"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <div className="flex items-center justify-center gap-3">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                  </svg>
                  <span>Continue with Apple</span>
                </div>
              </motion.button>
            </div>
          </motion.div>
        )}

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
        </motion.div>
      </div>
    </div>
  );
};

export default SignupForm; 