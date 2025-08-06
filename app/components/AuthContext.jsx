import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

const AuthContext = createContext({});

export const useAuth = () => {
  return useContext(AuthContext);
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    const getInitialSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
      setLoading(false);
    };

    getInitialSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
      // Clear localStorage
      localStorage.removeItem('user_profile_id');
      localStorage.removeItem('user_section_id');
      localStorage.removeItem('user_event_data');
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  const value = {
    user,
    isAuthenticated: !!user,
    loading,
    signOut
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}; 