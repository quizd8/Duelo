import React, { useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, Share, Dimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';

const { width } = Dimensions.get('window');
const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

const CATEGORY_NAMES: Record<string, string> = {
  series_tv: 'Séries TV Cultes',
  geographie: 'Géographie Mondiale',
  histoire: 'Histoire de France',
};

export default function ResultsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    playerScore: string; opponentScore: string; opponentPseudo: string;
    category: string; userId: string; isBot: string;
  }>();

  const pScore = parseInt(params.playerScore || '0');
  const oScore = parseInt(params.opponentScore || '0');
  const won = pScore > oScore;
  const draw = pScore === oScore;

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.5)).current;
  const cardSlide = useRef(new Animated.Value(60)).current;

  useEffect(() => {
    submitMatch();

    Haptics.notificationAsync(
      won ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error
    );

    Animated.sequence([
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.spring(scaleAnim, { toValue: 1, tension: 60, friction: 8, useNativeDriver: true }),
      ]),
      Animated.timing(cardSlide, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
  }, []);

  const submitMatch = async () => {
    try {
      const userId = params.userId || await AsyncStorage.getItem('duelo_user_id');
      await fetch(`${API_URL}/api/game/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          player_id: userId,
          category: params.category,
          player_score: pScore,
          opponent_score: oScore,
          opponent_pseudo: params.opponentPseudo,
          opponent_is_bot: params.isBot === 'true',
        }),
      });
    } catch {}
  };

  const shareResult = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const pseudo = await AsyncStorage.getItem('duelo_pseudo');
    const categoryName = CATEGORY_NAMES[params.category || ''] || params.category;
    const text = won
      ? `🏆 J'ai gagné un duel sur Duelo ! ${pScore}-${oScore} en ${categoryName}. Peux-tu faire mieux ? 🎮⚡`
      : `⚡ Duel intense sur Duelo ! ${pScore}-${oScore} en ${categoryName}. Viens me défier ! 🎮`;

    try {
      await Share.share({ message: text });
    } catch {}
  };

  const playAgain = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    router.replace(`/matchmaking?category=${params.category}`);
  };

  const goHome = () => {
    router.replace('/(tabs)/home');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Result Header */}
        <Animated.View style={[styles.resultHeader, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
          <Text style={styles.resultEmoji}>
            {won ? '🏆' : draw ? '🤝' : '💪'}
          </Text>
          <Text style={[styles.resultTitle, won ? styles.winText : draw ? styles.drawText : styles.lossText]}>
            {won ? 'VICTOIRE !' : draw ? 'ÉGALITÉ !' : 'DÉFAITE'}
          </Text>
          <Text style={styles.xpEarned}>
            +{pScore * 2 + (won ? 50 : 0)} XP
          </Text>
        </Animated.View>

        {/* Score Card */}
        <Animated.View style={[styles.scoreCard, { opacity: fadeAnim, transform: [{ translateY: cardSlide }] }]}>
          <View style={styles.scoreCardInner}>
            <View style={styles.playerColumn}>
              <View style={[styles.avatarCircle, styles.avatarPlayer]}>
                <Text style={styles.avatarText}>T</Text>
              </View>
              <Text style={styles.playerName}>Toi</Text>
              <Text style={[styles.playerScore, won && styles.winScore]}>{pScore}</Text>
            </View>

            <View style={styles.vsContainer}>
              <Text style={styles.vsText}>VS</Text>
              <Text style={styles.categoryBadge}>
                {CATEGORY_NAMES[params.category || ''] || params.category}
              </Text>
            </View>

            <View style={styles.playerColumn}>
              <View style={[styles.avatarCircle, styles.avatarOpponent]}>
                <Text style={styles.avatarText}>
                  {(params.opponentPseudo || 'B')[0].toUpperCase()}
                </Text>
              </View>
              <Text style={styles.playerName}>{params.opponentPseudo?.slice(0, 12)}</Text>
              <Text style={[styles.playerScore, !won && !draw && styles.winScore]}>{oScore}</Text>
            </View>
          </View>
        </Animated.View>

        {/* Actions */}
        <Animated.View style={[styles.actions, { opacity: fadeAnim }]}>
          <TouchableOpacity
            testID="share-result-btn"
            style={styles.shareButton}
            onPress={shareResult}
            activeOpacity={0.8}
          >
            <Text style={styles.shareIcon}>📤</Text>
            <Text style={styles.shareText}>DÉFIER UN AMI</Text>
          </TouchableOpacity>

          <TouchableOpacity
            testID="play-again-btn"
            style={styles.playAgainButton}
            onPress={playAgain}
            activeOpacity={0.8}
          >
            <Text style={styles.playAgainIcon}>⚡</Text>
            <Text style={styles.playAgainText}>REVANCHE</Text>
          </TouchableOpacity>

          <TouchableOpacity
            testID="go-home-btn"
            style={styles.homeButton}
            onPress={goHome}
            activeOpacity={0.7}
          >
            <Text style={styles.homeText}>Retour à l'accueil</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  resultHeader: { alignItems: 'center', marginBottom: 32 },
  resultEmoji: { fontSize: 64, marginBottom: 12 },
  resultTitle: { fontSize: 36, fontWeight: '900', letterSpacing: 4 },
  winText: { color: '#00FF9D' },
  drawText: { color: '#FFD700' },
  lossText: { color: '#FF3B30' },
  xpEarned: {
    fontSize: 18, fontWeight: '700', color: '#00FFFF', marginTop: 8,
    backgroundColor: 'rgba(0,255,255,0.1)', paddingHorizontal: 16, paddingVertical: 6,
    borderRadius: 20, overflow: 'hidden',
  },
  scoreCard: {
    backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 20, padding: 24,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', marginBottom: 32,
  },
  scoreCardInner: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  playerColumn: { alignItems: 'center', flex: 1 },
  avatarCircle: {
    width: 56, height: 56, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginBottom: 8,
  },
  avatarPlayer: { backgroundColor: '#8A2BE2' },
  avatarOpponent: { backgroundColor: '#FF3B30' },
  avatarText: { color: '#FFF', fontSize: 24, fontWeight: '900' },
  playerName: { color: '#A3A3A3', fontSize: 12, fontWeight: '600', marginBottom: 4 },
  playerScore: { fontSize: 32, fontWeight: '900', color: '#FFF' },
  winScore: { color: '#00FF9D' },
  vsContainer: { alignItems: 'center', paddingHorizontal: 12 },
  vsText: { fontSize: 16, fontWeight: '900', color: '#525252', marginBottom: 4 },
  categoryBadge: { fontSize: 10, color: '#525252', fontWeight: '600', textAlign: 'center' },
  actions: { gap: 12 },
  shareButton: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: '#00FFFF', borderRadius: 14, padding: 16,
    backgroundColor: 'rgba(0,255,255,0.05)',
  },
  shareIcon: { fontSize: 18, marginRight: 10 },
  shareText: { color: '#00FFFF', fontSize: 15, fontWeight: '800', letterSpacing: 2 },
  playAgainButton: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#8A2BE2', borderRadius: 14, padding: 18,
    shadowColor: '#8A2BE2', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 12,
  },
  playAgainIcon: { fontSize: 18, marginRight: 10 },
  playAgainText: { color: '#FFF', fontSize: 16, fontWeight: '800', letterSpacing: 2 },
  homeButton: { padding: 14, alignItems: 'center' },
  homeText: { color: '#525252', fontSize: 14, fontWeight: '600' },
});
