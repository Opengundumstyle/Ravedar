import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, StyleSheet } from 'react-native';
import { AuthProvider } from './context/AuthContext';
import MatchesScreen from './screens/MatchesScreen';
import SignInScreen from './screens/SignInScreen';
import { useAuth } from './context/AuthContext';

function AppInner() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) return null;

  return isAuthenticated ? <MatchesScreen /> : <SignInScreen />;
}

export default function App() {
  return (
    <AuthProvider>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <AppInner />
      </SafeAreaView>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#090212',
  },
});
