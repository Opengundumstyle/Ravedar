import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  PanResponder,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import UserCard from '../components/UserCard';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';

const SWIPE_THRESHOLD = 120;

function shuffle(list) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export default function MatchesScreen() {
  const [loading, setLoading] = useState(true);
  const [eventName, setEventName] = useState('');
  const [matches, setMatches] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const pan = useRef(new Animated.ValueXY()).current;
  const { user, loading: authLoading } = useAuth();
  const currentUserId = user?.id ?? null;

  useEffect(() => {
    const load = async () => {
      try {
        if (!currentUserId) return;

        const { data: myEvent } = await supabase.from('user_events').select('name').eq('user_id', currentUserId).single();

        setEventName(myEvent?.name || 'your event');

        const { data: rawProfiles } = await supabase
          .from('user_profiles')
          .select('id, name, instagram, vibe_tags, about_me, is_real, role')
          .or('is_real.eq.false,role.eq.founder,role.eq.co-founder');

        const shuffledProfiles = shuffle(rawProfiles || []);
        const ids = shuffledProfiles.map((u) => u.id);

        const { data: photos } = await supabase
          .from('user_photos')
          .select('user_id, image_url, position')
          .in('user_id', ids);

        const merged = shuffledProfiles.map((profile) => ({
          ...profile,
          photos: (photos || [])
            .filter((p) => p.user_id === profile.id)
            .sort((a, b) => a.position - b.position),
        }));

        setMatches(merged);
      } catch (error) {
        Alert.alert('Error', 'Failed to load matches from Supabase.');
      } finally {
        setLoading(false);
      }
    };

    if (!authLoading) load();
  }, [authLoading, currentUserId]);

  const currentCard = matches[currentIndex];
  const nextCard = matches[currentIndex + 1];

  const resetCardPosition = () => {
    Animated.spring(pan, {
      toValue: { x: 0, y: 0 },
      useNativeDriver: false,
      friction: 5,
    }).start();
  };

  const persistSwipe = async (direction, card) => {
    if (!card || !currentUserId) return;

    await supabase.from('likes').insert({
      from_user_id: currentUserId,
      to_user_id: card.id,
      liked: direction === 'right',
    });
  };

  const handleSwipe = (direction) => {
    const xTarget = direction === 'right' ? 500 : -500;
    Animated.timing(pan, {
      toValue: { x: xTarget, y: 0 },
      duration: 180,
      useNativeDriver: false,
    }).start(async () => {
      await persistSwipe(direction, currentCard);
      pan.setValue({ x: 0, y: 0 });
      setCurrentIndex((prev) => prev + 1);
    });
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dx) > 8 || Math.abs(gestureState.dy) > 8,
        onPanResponderMove: (_, gestureState) => {
          pan.setValue({ x: gestureState.dx, y: gestureState.dy * 0.08 });
        },
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dx > SWIPE_THRESHOLD) {
            handleSwipe('right');
            return;
          }
          if (gestureState.dx < -SWIPE_THRESHOLD) {
            handleSwipe('left');
            return;
          }
          resetCardPosition();
        },
      }),
    [currentCard, currentUserId]
  );

  if (authLoading || loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#ef4da2" />
        <Text style={styles.loadingText}>Loading rave matches...</Text>
      </View>
    );
  }

  if (!currentUserId) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Sign in required</Text>
        <Text style={styles.subtitle}>Please sign in to load matches.</Text>
      </View>
    );
  }

  if (!currentCard) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>That&apos;s Everyone For Now</Text>
        <Text style={styles.subtitle}>
          You have seen all available profiles for {eventName || 'this event'}.
        </Text>
      </View>
    );
  }

  const rotation = pan.x.interpolate({
    inputRange: [-250, 0, 250],
    outputRange: ['-14deg', '0deg', '14deg'],
  });

  return (
    <View style={styles.screen}>
      <Text style={styles.eventText}>You both are going to {eventName || 'your event'}</Text>
      <View style={styles.cardContainer}>
        {nextCard ? (
          <View style={styles.bottomCard}>
            <UserCard user={nextCard} />
          </View>
        ) : null}

        <Animated.View
          style={[
            styles.topCard,
            {
              transform: [{ translateX: pan.x }, { translateY: pan.y }, { rotate: rotation }],
            },
          ]}
          {...panResponder.panHandlers}
        >
          <UserCard user={currentCard} />
        </Animated.View>
      </View>
      <Text style={styles.instructions}>Swipe left or right</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#090212',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  centered: {
    flex: 1,
    backgroundColor: '#090212',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  loadingText: {
    color: '#f4edf9',
    marginTop: 12,
    fontSize: 15,
  },
  title: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    color: '#d4cde0',
    marginTop: 12,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  eventText: {
    color: '#e5d8f3',
    fontSize: 14,
    marginBottom: 16,
    textAlign: 'center',
  },
  cardContainer: {
    width: '100%',
    maxWidth: 420,
    height: '76%',
    minHeight: 560,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomCard: {
    width: '100%',
    height: '100%',
    opacity: 0.8,
    transform: [{ scale: 0.96 }],
  },
  topCard: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  instructions: {
    color: '#f9e4ff',
    marginTop: 16,
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    fontWeight: '700',
  },
});
