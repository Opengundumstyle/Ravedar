import { Image, StyleSheet, Text, View } from 'react-native';

const FALLBACK_IMAGE =
  'https://images.unsplash.com/photo-1516280440614-37939bbacd81?w=800&q=80';

export default function UserCard({ user }) {
  if (!user) return null;

  const firstPhoto = user.photos?.[0]?.image_url || FALLBACK_IMAGE;
  const vibeTags = user.vibe_tags || [];

  return (
    <View style={styles.card}>
      <Image source={{ uri: firstPhoto }} style={styles.image} resizeMode="cover" />
      <View style={styles.overlay}>
        <Text style={styles.name}>{user.name}</Text>
        {user.about_me ? (
          <Text numberOfLines={3} style={styles.bio}>
            {user.about_me}
          </Text>
        ) : null}
        <View style={styles.tagsWrap}>
          {vibeTags.slice(0, 4).map((tag) => (
            <View key={tag} style={styles.tagPill}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    height: '100%',
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: '#1d0f2c',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingBottom: 20,
    paddingTop: 40,
    backgroundColor: 'rgba(9, 2, 18, 0.58)',
  },
  name: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
  },
  bio: {
    marginTop: 8,
    color: '#ece8f2',
    fontSize: 14,
    lineHeight: 20,
  },
  tagsWrap: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tagPill: {
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  tagText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
});
