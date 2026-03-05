import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Animated, Dimensions, Easing
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';

const { width } = Dimensions.get('window');
const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

const SEARCH_MESSAGES = [
  'Recherche d\'un adversaire...',
  'Scan du réseau...',
  'Analyse des joueurs en ligne...',
  'Connexion au serveur de combat...',
];

export default function MatchmakingScreen() {
  const router = useRouter();
  const { category } = useLocalSearchParams<{ category: string }>();
  const [message, setMessage] = useState(SEARCH_MESSAGES[0]);
  const [dots, setDots] = useState('');

  const radarAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(0.3)).current;
  const ringAnim1 = useRef(new Animated.Value(0)).current;
  const ringAnim2 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Radar rotation
    const radar = Animated.loop(
      Animated.timing(radarAnim, {
        toValue: 1, duration: 2000, easing: Easing.linear, useNativeDriver: true,
      })
    );
    radar.start();

    // Pulse
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.3, duration: 1000, useNativeDriver: true }),
      ])
    );
    pulse.start();

    // Rings
    const ring1 = Animated.loop(
      Animated.timing(ringAnim1, { toValue: 1, duration: 2500, useNativeDriver: true })
    );
    const ring2 = Animated.loop(
      Animated.timing(ringAnim2, { toValue: 1, duration: 3000, useNativeDriver: true })
    );
    ring1.start();
    ring2.start();

    // Dots animation
    const dotsInterval = setInterval(() => {
      setDots(prev => prev.length >= 3 ? '' : prev + '.');
    }, 500);

    // Message rotation
    let msgIndex = 0;
    const msgInterval = setInterval(() => {
      msgIndex = (msgIndex + 1) % SEARCH_MESSAGES.length;
      setMessage(SEARCH_MESSAGES[msgIndex]);
    }, 2000);

    // Bot fallback after 5 seconds
    const botTimer = setTimeout(() => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      startGameWithBot();
    }, 5000);

    return () => {
      radar.stop();
      pulse.stop();
      ring1.stop();
      ring2.stop();
      clearInterval(dotsInterval);
      clearInterval(msgInterval);
      clearTimeout(botTimer);
    };
  }, []);

  const startGameWithBot = async () => {
    try {
      const res = await fetch(`${API_URL}/api/game/matchmaking`, { method: 'POST' });
      const data = await res.json();
      router.replace(
        `/game?category=${category}&opponentPseudo=${data.opponent.pseudo}&opponentSeed=${data.opponent.avatar_seed}&isBot=true`
      );
    } catch {
      router.back();
    }
  };

  const spin = radarAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>RECHERCHE</Text>
        <Text style={styles.categoryLabel}>
          {category === 'series_tv' ? '📺 Séries TV' : category === 'geographie' ? '🌍 Géographie' : '🏛️ Histoire'}
        </Text>

        <View style={styles.radarContainer}>
          {/* Expanding rings */}
          <Animated.View style={[styles.ring, {
            opacity: ringAnim1.interpolate({ inputRange: [0, 1], outputRange: [0.6, 0] }),
            transform: [{ scale: ringAnim1.interpolate({ inputRange: [0, 1], outputRange: [0.5, 2] }) }],
          }]} />
          <Animated.View style={[styles.ring, {
            opacity: ringAnim2.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0] }),
            transform: [{ scale: ringAnim2.interpolate({ inputRange: [0, 1], outputRange: [0.5, 2.5] }) }],
          }]} />

          {/* Center radar */}
          <Animated.View style={[styles.radarSweep, { transform: [{ rotate: spin }] }]}>
            <View style={styles.sweepLine} />
          </Animated.View>

          <Animated.View style={[styles.radarCenter, { opacity: pulseAnim }]}>
            <Text style={styles.radarIcon}>⚡</Text>
          </Animated.View>
        </View>

        <Text style={styles.searchMessage}>{message}{dots}</Text>
        <Text style={styles.hint}>Un adversaire sera trouvé sous peu...</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  title: { fontSize: 14, fontWeight: '800', color: '#525252', letterSpacing: 4, marginBottom: 8 },
  categoryLabel: { fontSize: 18, fontWeight: '700', color: '#FFF', marginBottom: 48 },
  radarContainer: { width: 200, height: 200, justifyContent: 'center', alignItems: 'center', marginBottom: 48 },
  ring: {
    position: 'absolute', width: 200, height: 200, borderRadius: 100,
    borderWidth: 1, borderColor: '#8A2BE2',
  },
  radarSweep: { position: 'absolute', width: 200, height: 200, justifyContent: 'center', alignItems: 'flex-start' },
  sweepLine: {
    width: 100, height: 2, backgroundColor: '#00FFFF',
    marginLeft: 100, shadowColor: '#00FFFF', shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8, shadowRadius: 8,
  },
  radarCenter: {
    width: 60, height: 60, borderRadius: 30, backgroundColor: '#8A2BE2',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#8A2BE2', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 16,
  },
  radarIcon: { fontSize: 28 },
  searchMessage: { fontSize: 16, fontWeight: '600', color: '#FFF', marginBottom: 8 },
  hint: { fontSize: 13, color: '#525252' },
});
