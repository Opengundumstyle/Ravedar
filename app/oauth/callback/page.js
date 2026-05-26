'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabaseClient';
import RadarLoader from '../../components/RadarLoader';

export default function OAuthCallbackPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const router = useRouter();

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        
        if (error) {
          throw error;
        }

        if (data.session) {
          // User is authenticated
          const user = data.session.user;
          
          // Store user ID in localStorage
          localStorage.setItem('user_profile_id', user.id);
          
          // Clear any old anonymous user data
          localStorage.removeItem('user_section_id');
          localStorage.removeItem('user_event_data');
          localStorage.removeItem('current_room_id');

          // Check if user has a profile
          const { data: profile } = await supabase
            .from('user_profiles')
            .select('id')
            .eq('id', user.id)
            .single();

          if (profile) {
            // User has a profile, redirect to matches
            router.push('/matches');
          } else {
            // User doesn't have a profile, redirect to signup to complete profile
            router.push('/signup');
          }
        } else {
          // No session, redirect to signin
          router.push('/signin');
        }
      } catch (error) {
        console.error('Auth callback error:', error);
        setError('Authentication failed. Please try again.');
        setTimeout(() => {
          router.push('/signin');
        }, 3000);
      } finally {
        setLoading(false);
      }
    };

    handleAuthCallback();
  }, [router]);

  if (loading) {
    return <RadarLoader eventName="Completing authentication..." />;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex items-center justify-center p-4">
        <div className="bg-black/40 backdrop-blur-sm border border-white/20 rounded-2xl p-8 text-center">
          <div className="text-red-400 text-4xl mb-4">⚠️</div>
          <h1 className="text-display text-2xl text-white mb-4">Authentication Error</h1>
          <p className="text-body text-white/70 mb-6">{error}</p>
          <p className="text-body-small text-white/50">Redirecting to sign in...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex items-center justify-center p-4">
      <div className="bg-black/40 backdrop-blur-sm border border-white/20 rounded-2xl p-8 text-center">
        <div className="text-green-400 text-4xl mb-4">✅</div>
        <h1 className="text-display text-2xl text-white mb-4">Authentication Successful</h1>
        <p className="text-body text-white/70 mb-6">Redirecting you to the app...</p>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500 mx-auto"></div>
      </div>
    </div>
  );
} 