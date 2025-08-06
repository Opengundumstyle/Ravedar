'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '../../lib/supabaseClient';
import { useRouter } from 'next/navigation';
import RadarLoader from '../components/RadarLoader';
import { useAuth } from '../components/AuthContext';

export default function SignInPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();

  const handleSignIn = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        throw error;
      }

      if (data.user) {
        // Store user ID in localStorage
        localStorage.setItem('user_profile_id', data.user.id);
        
        // Clear any old anonymous user data
        localStorage.removeItem('user_section_id');
        localStorage.removeItem('user_event_data');

        setSuccess('Signed in successfully! Redirecting...');
        
        setTimeout(() => {
          setLoading(false);
          setSuccess('');
          router.push('/matches');
        }, 1500);
      }
    } catch (error) {
      console.error('Sign in error:', error);
      setError(error.message || 'Failed to sign in. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/oauth/callback`
        }
      });

      if (error) {
        throw error;
      }
    } catch (error) {
      console.error('Google sign in error:', error);
      setError(error.message || 'Failed to sign in with Google. Please try again.');
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setError('Please enter your email address first');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/oauth/callback`
      });

      if (error) {
        throw error;
      }

      setSuccess('Password reset email sent! Check your inbox.');
    } catch (error) {
      console.error('Password reset error:', error);
      setError(error.message || 'Failed to send password reset email. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Redirect if user is already authenticated
  if (isAuthenticated && user) {
    router.push('/matches');
    return null;
  }

  if (loading) {
    return <RadarLoader eventName="Signing you in..." />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex flex-col p-4 relative overflow-y-auto">
      {/* Background Animation */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/20 via-purple-900/20 to-pink-900/20 animate-pulse"></div>
      
      <div className="relative z-10 w-full max-w-md mx-auto px-4 py-8">
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
              Welcome Back
            </h1>
            <p className="text-body text-white/70">
              Sign in to continue your rave journey
            </p>
          </motion.div>
        </div>

        {/* Form */}
        <motion.div
          className="bg-black/40 backdrop-blur-sm border border-white/20 rounded-2xl p-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <form onSubmit={handleSignIn} className="space-y-4">
            <div>
              <label className="text-caption text-white/70 block mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-black/40 backdrop-blur-sm border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-pink-500/50 focus:border-pink-500 transition-all duration-200"
                placeholder="your@email.com"
                required
              />
            </div>

            <div>
              <label className="text-caption text-white/70 block mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-black/40 backdrop-blur-sm border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-pink-500/50 focus:border-pink-500 transition-all duration-200"
                placeholder="Enter your password"
                required
              />
            </div>

            <div className="flex justify-between items-center">
              <button
                type="button"
                onClick={handleForgotPassword}
                className="text-body-small text-pink-400 hover:text-pink-300 underline font-medium transition-colors duration-200"
              >
                Forgot Password?
              </button>
            </div>

            <motion.button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-6 bg-gradient-to-r from-pink-500 to-purple-600 text-white font-semibold text-lg rounded-xl hover:scale-105 transform transition-all duration-200 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              whileHover={{ scale: loading ? 1 : 1.02 }}
              whileTap={{ scale: loading ? 1 : 0.98 }}
            >
              {loading ? 'Signing In...' : 'Sign In'}
            </motion.button>
          </form>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/20"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-black/40 text-white/50">Or continue with</span>
            </div>
          </div>

          {/* Google Sign In */}
          <motion.button
            onClick={handleGoogleSignIn}
            className="w-full py-3 px-6 bg-white/10 backdrop-blur-sm border border-white/20 text-white font-semibold text-lg rounded-xl hover:bg-white/20 transform transition-all duration-200 flex items-center justify-center gap-3"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </motion.button>

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

        {/* Sign Up Link */}
        <motion.div
          className="text-center mt-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          <span className="text-body text-white/50">Don't have an account? </span>
          <button
            onClick={() => router.push('/signup')}
            className="text-body text-pink-400 hover:text-pink-300 underline font-medium transition-colors duration-200"
          >
            Sign up here
          </button>
        </motion.div>

        {/* Back to Home */}
        <motion.div
          className="text-center mt-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
        >
          <button
            onClick={() => router.push('/')}
            className="text-body text-white/60 hover:text-white transition-colors duration-200"
          >
            ← Back to Home
          </button>
        </motion.div>
      </div>
    </div>
  );
} 