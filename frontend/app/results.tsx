import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, Share, Modal, ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { GLASS } from '../theme/glassTheme';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

const CATEGORY_NAMES: Record<string, string> = {};

const CATEGORY_ICONS: Record<string, string> = {};

type XpBreakdown = {
  base: number;
  victory: number;
  perfection: number;
  giant_slayer: number;
  streak: number;
  total: number;
};

type NewTitle = {
  level: number;
  title: string;
  category: string;
};

export default function ResultsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    playerScore: string; opponentScore: string; opponentPseudo: string;
    category: string; userId: string; isBot: string;
    correctCount: string; opponentLevel: string;
  }>();

  const pScore = parseInt(params.playerScore || '0');
  const oScore = parseInt(params.opponentScore || '0');
  const correctCount = parseInt(params.correctCount || '0');
  const won = pScore > oScore;
  const draw = pScore === oScore;

  const [xpBreakdown, setXpBreakdown] = useState<XpBreakdown | null>(null);
  const [newTitle, setNewTitle] = useState<NewTitle | null>(null);
  const [newLevel, setNewLevel] = useState<number | null>(null);
  const [showTitleModal, setShowTitleModal] = useState(false);
  const [submitting, setSubmitting] = useState(true);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.5)).current;
  const cardSlide = useRef(new Animated.Value(60)).current;
  const xpSlide = useRef(new Animated.Value(40)).current;

  // Title celebration anims
  const titleScale = useRef(new Animated.Value(0)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleGlow = useRef(new Animated.Value(0)).current;

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
      Animated.parallel([
        Animated.timing(cardSlide, { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.timing(xpSlide, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]),
    ]).start();
  }, []);

  const submitMatch = async () => {
    try {
      const userId = params.userId || await AsyncStorage.getItem('duelo_user_id');
      const res = await fetch(`${API_URL}/api/game/submit-v2`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          player_id: userId,
          theme_id: params.category,
          player_score: pScore,
          opponent_score: oScore,
          opponent_pseudo: params.opponentPseudo,
          opponent_is_bot: params.isBot === 'true',
          correct_count: correctCount,
          opponent_level: parseInt(params.opponentLevel || '1'),
        }),
      });
      const data = await res.json();
      if (data.xp_breakdown) {
        setXpBreakdown(data.xp_breakdown);
      }
      if (data.new_title) {
        setNewTitle(data.new_title);
        // Show title celebration after a short delay
        setTimeout(() => {
          setShowTitleModal(true);
          animateTitleCelebration();
        }, 1200);
      }
      if (data.new_level) {
        setNewLevel(data.new_level);
      }
    } catch {}
    setSubmitting(false);
  };

  const animateTitleCelebration = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Animated.parallel([
      Animated.spring(titleScale, { toValue: 1, tension: 60, friction: 6, useNativeDriver: true }),
      Animated.timing(titleOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();

    // Glow loop
    Animated.loop(
      Animated.sequence([
        Animated.timing(titleGlow, { toValue: 1, duration: 1000, useNativeDriver: true }),
        Animated.timing(titleGlow, { toValue: 0.4, duration: 1000, useNativeDriver: true }),
      ])
    ).start();
  };

  const shareResult = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const categoryName = CATEGORY_NAMES[params.category || ''] || params.category;
    const text = won
      ? `🏆 Victoire sur Duelo ! ${pScore}-${oScore} en ${categoryName} (${correctCount}/7). Viens me défier ! ⚡`
      : `⚡ Duel intense sur Duelo ! ${pScore}-${oScore} en ${categoryName}. Viens me battre ! 🎮`;
    try { await Share.share({ message: text }); } catch {}
  };

  const playAgain = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    router.replace(`/matchmaking?category=${params.category}`);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Result Header */}
        <Animated.View style={[styles.resultHeader, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
          <Text style={styles.resultEmoji}>{won ? '🏆' : draw ? '🤝' : '💪'}</Text>
          <Text style={[styles.resultTitle, won ? styles.winText : draw ? styles.drawText : styles.lossText]}>
            {won ? 'VICTOIRE !' : draw ? 'ÉGALITÉ !' : 'DÉFAITE'}
          </Text>
          <Text style={styles.correctBadge}>{correctCount}/7 bonnes réponses</Text>
          {newLevel && (
            <View style={styles.levelUpBadge}>
              <Text style={styles.levelUpText}>⬆️ Niveau {newLevel} !</Text>
            </View>
          )}
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
              <Text style={styles.categoryBadge}>{CATEGORY_NAMES[params.category || '']}</Text>
            </View>
            <View style={styles.playerColumn}>
              <View style={[styles.avatarCircle, styles.avatarOpponent]}>
                <Text style={styles.avatarText}>{(params.opponentPseudo || 'B')[0].toUpperCase()}</Text>
              </View>
              <Text style={styles.playerName}>{params.opponentPseudo?.slice(0, 12)}</Text>
              <Text style={[styles.playerScore, !won && !draw && styles.winScore]}>{oScore}</Text>
            </View>
          </View>
        </Animated.View>

        {/* XP Breakdown */}
        <Animated.View style={[styles.xpCard, { opacity: fadeAnim, transform: [{ translateY: xpSlide }] }]}>
          {submitting ? (
            <ActivityIndicator color="#8A2BE2" />
          ) : xpBreakdown ? (
            <>
              <Text style={styles.xpTitle}>XP GAGNÉ</Text>
              <View style={styles.xpRow}>
                <Text style={styles.xpLabel}>Base (score × 2)</Text>
                <Text style={styles.xpValue}>+{xpBreakdown.base}</Text>
              </View>
              {xpBreakdown.victory > 0 && (
                <View style={styles.xpRow}>
                  <Text style={styles.xpLabel}>🏆 Bonus Victoire</Text>
                  <Text style={[styles.xpValue, styles.xpGold]}>+{xpBreakdown.victory}</Text>
                </View>
              )}
              {xpBreakdown.perfection > 0 && (
                <View style={styles.xpRow}>
                  <Text style={styles.xpLabel}>⭐ Perfection (7/7)</Text>
                  <Text style={[styles.xpValue, styles.xpCyan]}>+{xpBreakdown.perfection}</Text>
                </View>
              )}
              {xpBreakdown.giant_slayer > 0 && (
                <View style={styles.xpRow}>
                  <Text style={styles.xpLabel}>⚔️ Giant Slayer</Text>
                  <Text style={[styles.xpValue, styles.xpPurple]}>+{xpBreakdown.giant_slayer}</Text>
                </View>
              )}
              {xpBreakdown.streak > 0 && (
                <View style={styles.xpRow}>
                  <Text style={styles.xpLabel}>🔥 Bonus Streak</Text>
                  <Text style={[styles.xpValue, styles.xpOrange]}>+{xpBreakdown.streak}</Text>
                </View>
              )}
              <View style={styles.xpDivider} />
              <View style={styles.xpRow}>
                <Text style={styles.xpTotalLabel}>TOTAL</Text>
                <Text style={styles.xpTotalValue}>+{xpBreakdown.total} XP</Text>
              </View>
            </>
          ) : null}
        </Animated.View>

        {/* Actions */}
        <Animated.View style={[styles.actions, { opacity: fadeAnim }]}>
          <TouchableOpacity testID="share-result-btn" style={styles.shareButton} onPress={shareResult} activeOpacity={0.8}>
            <Text style={styles.shareText}>📤 DÉFIER UN AMI</Text>
          </TouchableOpacity>
          <TouchableOpacity testID="play-again-btn" style={styles.playAgainButton} onPress={playAgain} activeOpacity={0.8}>
            <Text style={styles.playAgainText}>⚡ REVANCHE</Text>
          </TouchableOpacity>
          <TouchableOpacity testID="go-home-btn" style={styles.homeButton} onPress={() => router.replace('/(tabs)/play')}>
            <Text style={styles.homeText}>Retour à l'accueil</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>

      {/* Title Celebration Modal */}
      {newTitle && (
        <Modal visible={showTitleModal} transparent animationType="none" onRequestClose={() => setShowTitleModal(false)}>
          <View style={styles.celebrationOverlay}>
            <Animated.View style={[styles.celebrationContent, {
              opacity: titleOpacity,
              transform: [{ scale: titleScale }],
            }]}>
              <Text style={styles.celebrationStar}>🌟</Text>
              <Text style={styles.celebrationHeader}>NOUVEAU TITRE DÉBLOQUÉ</Text>
              <Animated.Text style={[styles.celebrationTitle, { opacity: titleGlow }]}>
                {newTitle.title}
              </Animated.Text>
              <View style={styles.celebrationCategory}>
                <Text style={styles.celebrationCatIcon}>{CATEGORY_ICONS[newTitle.category] || '❓'}</Text>
                <Text style={styles.celebrationCatText}>
                  {CATEGORY_NAMES[newTitle.category]} • Niveau {newTitle.level}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.celebrationBtn}
                onPress={() => setShowTitleModal(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.celebrationBtnText}>CONTINUER</Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  resultHeader: { alignItems: 'center', marginBottom: 20 },
  resultEmoji: { fontSize: 56, marginBottom: 8 },
  resultTitle: { fontSize: 32, fontWeight: '900', letterSpacing: 4 },
  winText: { color: '#00FF9D' },
  drawText: { color: '#FFD700' },
  lossText: { color: '#FF3B30' },
  correctBadge: { color: '#A3A3A3', fontSize: 14, fontWeight: '600', marginTop: 6 },
  levelUpBadge: {
    marginTop: 8, backgroundColor: 'rgba(138,43,226,0.2)', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 4, borderWidth: 1, borderColor: 'rgba(138,43,226,0.3)',
  },
  levelUpText: { color: '#8A2BE2', fontSize: 14, fontWeight: '800' },
  scoreCard: {
    backgroundColor: GLASS.bgLight, borderRadius: GLASS.radiusLg, padding: 20,
    borderWidth: 1, borderColor: GLASS.borderCyan, marginBottom: 16,
  },
  scoreCardInner: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  playerColumn: { alignItems: 'center', flex: 1 },
  avatarCircle: { width: 48, height: 48, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
  avatarPlayer: { backgroundColor: '#8A2BE2' },
  avatarOpponent: { backgroundColor: '#FF3B30' },
  avatarText: { color: '#FFF', fontSize: 22, fontWeight: '900' },
  playerName: { color: '#A3A3A3', fontSize: 11, fontWeight: '600', marginBottom: 2 },
  playerScore: { fontSize: 28, fontWeight: '900', color: '#FFF' },
  winScore: { color: '#00FF9D' },
  vsContainer: { alignItems: 'center', paddingHorizontal: 10 },
  vsText: { fontSize: 14, fontWeight: '900', color: '#525252' },
  categoryBadge: { fontSize: 9, color: '#525252', fontWeight: '600', textAlign: 'center', marginTop: 2 },
  // XP Card
  xpCard: {
    backgroundColor: GLASS.bg, borderRadius: 16, padding: 18,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginBottom: 16,
  },
  xpTitle: { fontSize: 11, fontWeight: '800', color: '#525252', letterSpacing: 3, marginBottom: 12 },
  xpRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  xpLabel: { color: '#A3A3A3', fontSize: 14, fontWeight: '500' },
  xpValue: { color: '#00FF9D', fontSize: 14, fontWeight: '700' },
  xpGold: { color: '#FFD700' },
  xpCyan: { color: '#00FFFF' },
  xpPurple: { color: '#8A2BE2' },
  xpOrange: { color: '#FF6B35' },
  xpDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginVertical: 8 },
  xpTotalLabel: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  xpTotalValue: { color: '#00FFFF', fontSize: 18, fontWeight: '900' },
  // Actions
  actions: { gap: 10 },
  shareButton: {
    borderWidth: 1, borderColor: '#00FFFF', borderRadius: 14, padding: 14,
    backgroundColor: 'rgba(0,255,255,0.05)', alignItems: 'center',
  },
  shareText: { color: '#00FFFF', fontSize: 14, fontWeight: '800', letterSpacing: 2 },
  playAgainButton: {
    backgroundColor: '#8A2BE2', borderRadius: 14, padding: 16, alignItems: 'center',
    shadowColor: '#8A2BE2', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 12,
  },
  playAgainText: { color: '#FFF', fontSize: 15, fontWeight: '800', letterSpacing: 2 },
  homeButton: { padding: 12, alignItems: 'center' },
  homeText: { color: '#525252', fontSize: 14, fontWeight: '600' },
  // Celebration Modal
  celebrationOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32,
  },
  celebrationContent: { alignItems: 'center', width: '100%' },
  celebrationStar: { fontSize: 72, marginBottom: 16 },
  celebrationHeader: {
    fontSize: 14, fontWeight: '800', color: '#FFD700', letterSpacing: 4, marginBottom: 12,
  },
  celebrationTitle: {
    fontSize: 32, fontWeight: '900', color: '#FFF', textAlign: 'center', marginBottom: 16,
    textShadowColor: '#8A2BE2', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 20,
  },
  celebrationCategory: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 32,
    backgroundColor: GLASS.bgLight, borderRadius: GLASS.radiusLg, paddingHorizontal: 16, paddingVertical: 8,
  },
  celebrationCatIcon: { fontSize: 18 },
  celebrationCatText: { color: '#A3A3A3', fontSize: 14, fontWeight: '600' },
  celebrationBtn: {
    backgroundColor: '#8A2BE2', borderRadius: 16, paddingHorizontal: 48, paddingVertical: 16,
    shadowColor: '#8A2BE2', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.6, shadowRadius: 16,
  },
  celebrationBtnText: { color: '#FFF', fontSize: 16, fontWeight: '900', letterSpacing: 3 },
});
