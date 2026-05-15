import { useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../lib/supabaseClient';
import * as AuthSession from 'expo-auth-session';

const redirectTo = AuthSession.makeRedirectUri({
  scheme: 'rave-match',
  // Supabase will redirect here after OAuth; Expo will resume the app.
  path: 'oauth-callback',
});

export default function SignInScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const signInWithProvider = async (provider) => {
    try {
      setLoading(true);
      setError('');

      const { error: signInError } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo },
      });

      if (signInError) throw signInError;
    } catch (e) {
      const message = e?.message || 'Failed to start OAuth sign-in.';
      setError(message);
      Alert.alert('Sign-in error', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Rave Match</Text>
      <Text style={styles.subtitle}>Sign in to start matching.</Text>

      <View style={styles.buttonWrap}>
        <TouchableOpacity
          style={[styles.button, styles.googleButton]}
          onPress={() => signInWithProvider('google')}
          disabled={loading}
        >
          <Text style={styles.buttonText}>{loading ? 'Starting...' : 'Continue with Google'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.appleButton]}
          onPress={() => signInWithProvider('apple')}
          disabled={loading}
        >
          <Text style={styles.buttonText}>{loading ? 'Starting...' : 'Continue with Apple'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.facebookButton]}
          onPress={() => signInWithProvider('facebook')}
          disabled={loading}
        >
          <Text style={styles.buttonText}>{loading ? 'Starting...' : 'Continue with Facebook'}</Text>
        </TouchableOpacity>
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#090212',
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: '#fff',
    fontSize: 34,
    fontWeight: '800',
    marginBottom: 8,
  },
  subtitle: {
    color: '#d4cde0',
    fontSize: 15,
    marginBottom: 22,
    textAlign: 'center',
  },
  buttonWrap: {
    width: '100%',
    gap: 12,
  },
  button: {
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  googleButton: {
    backgroundColor: '#2b2bff',
  },
  appleButton: {
    backgroundColor: '#000',
  },
  facebookButton: {
    backgroundColor: '#1877F2',
  },
  errorText: {
    color: '#ff9aa7',
    marginTop: 14,
    textAlign: 'center',
  },
});

