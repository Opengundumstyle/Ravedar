import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import RadarLoader from './RadarLoader';
import { motion } from 'framer-motion';

const OAuthCallback = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const handleOAuthCallback = async () => {
      try {
        // Get the current session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          console.error('Session error:', sessionError);
          throw sessionError;
        }

        if (session?.user) {
          console.log('OAuth user authenticated:', session.user.id);
          
          // Wait a moment to ensure the user is fully created in auth.users
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Check if user profile already exists
          const { data: existingProfile, error: profileCheckError } = await supabase
            .from('user_profiles')
            .select('id')
            .eq('id', session.user.id)
            .single();

          if (profileCheckError && profileCheckError.code !== 'PGRST116') {
            // PGRST116 is "not found" error, which is expected for new users
            console.error('Profile check error:', profileCheckError);
          }

          if (!existingProfile) {
            console.log('Creating new profile for OAuth user');
            
            // Create user profile for new social login user
            const { error: profileError } = await supabase
              .from('user_profiles')
              .insert({
                id: session.user.id,
                name: session.user.user_metadata?.full_name || 
                      session.user.user_metadata?.name || 
                      session.user.email?.split('@')[0] || 
                      'Raver',
                instagram: session.user.user_metadata?.instagram || null,
                about_me: session.user.user_metadata?.about_me || null,
                vibe_tags: session.user.user_metadata?.vibe_tags || [],
                is_real: true
              });

            if (profileError) {
              console.error('Profile creation error:', profileError);
              // Don't throw error here, just log it and continue
              // The user can still use the app, they just won't have a profile
            } else {
              console.log('Profile created successfully for OAuth user');
            }
          } else {
            console.log('Profile already exists for OAuth user');
          }

          // Store the user ID in localStorage
          localStorage.setItem('user_profile_id', session.user.id);
          
          // Redirect to matches
          navigate('/matches');
        } else {
          console.log('No session found, redirecting to home');
          // No session found, redirect to home
          navigate('/');
        }
      } catch (error) {
        console.error('OAuth callback error:', error);
        setError('Authentication failed. Please try again.');
        setTimeout(() => {
          navigate('/');
        }, 3000);
      } finally {
        setLoading(false);
      }
    };

    handleOAuthCallback();
  }, [navigate]);

  if (loading) {
    return <RadarLoader eventName="Setting up your profile..." />;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex flex-col items-center justify-center p-4">
        <motion.div
          className="text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="text-4xl mb-4">❌</div>
          <h2 className="text-heading text-2xl text-white mb-4">Authentication Failed</h2>
          <p className="text-body text-white/70 mb-6">{error}</p>
          <motion.button
            onClick={() => navigate('/')}
            className="px-6 py-3 bg-gradient-to-r from-pink-500 to-purple-600 text-white font-semibold rounded-xl hover:scale-105 transform transition-all duration-200"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            Back to Home
          </motion.button>
        </motion.div>
      </div>
    );
  }

  return null;
};

export default OAuthCallback; 