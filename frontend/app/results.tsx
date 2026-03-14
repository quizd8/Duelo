import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, Share, Modal, ActivityIndicator,
  ScrollView, TextInput, KeyboardAvoidingView, Platform, Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { GLASS } from '../theme/glassTheme';
import SwipeBackPage from '../components/SwipeBackPage';

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

type QuizQuestion = {
  id: string;
  question_text: string;
  options: string[];
  correct_option: number;
};

const REPORT_REASONS = [
  { id: 'wrong_answer', label: 'Mauvaise réponse', icon: '❌' },
  { id: 'unclear_question', label: 'Question pas claire', icon: '❓' },
  { id: 'typo', label: 'Faute / erreur de texte', icon: '✏️' },
  { id: 'outdated', label: 'Information obsolète', icon: '📅' },
  { id: 'other', label: 'Autre', icon: '💬' },
];

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

  // Report question states
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportStep, setReportStep] = useState<'select' | 'reason'>('select');
  const [selectedQuestion, setSelectedQuestion] = useState<QuizQuestion | null>(null);
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [reportDescription, setReportDescription] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportSuccess, setReportSuccess] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

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
    loadQuizQuestions();
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

  const loadQuizQuestions = async () => {
    try {
      const raw = await AsyncStorage.getItem('duelo_last_quiz_questions');
      if (raw) {
        const parsed = JSON.parse(raw);
        setQuizQuestions(parsed);
      }
    } catch {}
  };

  const openReportModal = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setReportStep('select');
    setSelectedQuestion(null);
    setSelectedReason(null);
    setReportDescription('');
    setReportSuccess(false);
    setReportError(null);
    setReportModalVisible(true);
  };

  const selectQuestionForReport = (q: QuizQuestion) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedQuestion(q);
    setReportStep('reason');
    setReportError(null);
  };

  const submitReport = async () => {
    if (!selectedQuestion || !selectedReason) return;
    Keyboard.dismiss();
    setReportSubmitting(true);
    setReportError(null);
    try {
      const userId = params.userId || await AsyncStorage.getItem('duelo_user_id');
      const res = await fetch(`${API_URL}/api/questions/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          question_id: selectedQuestion.id,
          question_text: selectedQuestion.question_text,
          category: params.category,
          reason_type: selectedReason,
          description: reportDescription.trim() || undefined,
        }),
      });
      if (res.status === 409) {
        setReportError('Vous avez déjà signalé cette question');
      } else if (!res.ok) {
        setReportError('Erreur lors de l\'envoi. Réessayez.');
      } else {
        setReportSuccess(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch {
      setReportError('Erreur réseau. Vérifiez votre connexion.');
    }
    setReportSubmitting(false);
  };

  const playAgain = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    router.replace(`/matchmaking?category=${params.category}`);
  };

  return (
    <SwipeBackPage>
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

          {quizQuestions.length > 0 && (
            <TouchableOpacity testID="report-error-btn" style={styles.reportButton} onPress={openReportModal} activeOpacity={0.7}>
              <Text style={styles.reportButtonText}>⚠️ Signaler une erreur dans une question</Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      </View>

      {/* Report Question Modal */}
      <Modal visible={reportModalVisible} transparent animationType="slide" onRequestClose={() => setReportModalVisible(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.reportOverlay}>
            <View style={styles.reportModal}>
              {/* Header */}
              <View style={styles.reportHeader}>
                <Text style={styles.reportHeaderText}>
                  {reportSuccess ? '✅ Merci !' : reportStep === 'select' ? '⚠️ Signaler une erreur' : '📝 Détails du signalement'}
                </Text>
                <TouchableOpacity onPress={() => setReportModalVisible(false)} style={styles.reportClose}>
                  <Text style={styles.reportCloseText}>✕</Text>
                </TouchableOpacity>
              </View>

              {reportSuccess ? (
                /* Success State */
                <View style={styles.reportSuccessContainer}>
                  <Text style={styles.reportSuccessEmoji}>🎉</Text>
                  <Text style={styles.reportSuccessTitle}>Signalement envoyé !</Text>
                  <Text style={styles.reportSuccessDesc}>
                    Merci de nous aider à améliorer Duelo. Nous examinerons cette question rapidement.
                  </Text>
                  <TouchableOpacity style={styles.reportSuccessBtn} onPress={() => setReportModalVisible(false)} activeOpacity={0.8}>
                    <Text style={styles.reportSuccessBtnText}>FERMER</Text>
                  </TouchableOpacity>
                </View>
              ) : reportStep === 'select' ? (
                /* Step 1: Select Question */
                <ScrollView style={styles.reportScroll} showsVerticalScrollIndicator={false}>
                  <Text style={styles.reportSubtitle}>Quelle question contenait une erreur ?</Text>
                  {quizQuestions.map((q, idx) => (
                    <TouchableOpacity
                      key={q.id || idx.toString()}
                      style={styles.reportQuestionItem}
                      onPress={() => selectQuestionForReport(q)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.reportQuestionNumber}>
                        <Text style={styles.reportQuestionNumberText}>{idx + 1}</Text>
                      </View>
                      <Text style={styles.reportQuestionText} numberOfLines={2}>
                        {q.question_text}
                      </Text>
                      <Text style={styles.reportQuestionArrow}>›</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              ) : (
                /* Step 2: Reason + Description */
                <ScrollView style={styles.reportScroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  {/* Selected question preview */}
                  <View style={styles.reportSelectedPreview}>
                    <Text style={styles.reportSelectedLabel}>Question sélectionnée :</Text>
                    <Text style={styles.reportSelectedText} numberOfLines={2}>{selectedQuestion?.question_text}</Text>
                  </View>

                  <Text style={styles.reportSubtitle}>Type d'erreur</Text>
                  {REPORT_REASONS.map((r) => (
                    <TouchableOpacity
                      key={r.id}
                      style={[styles.reportReasonItem, selectedReason === r.id && styles.reportReasonSelected]}
                      onPress={() => { setSelectedReason(r.id); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.reportReasonIcon}>{r.icon}</Text>
                      <Text style={[styles.reportReasonLabel, selectedReason === r.id && styles.reportReasonLabelSelected]}>
                        {r.label}
                      </Text>
                      {selectedReason === r.id && <Text style={styles.reportReasonCheck}>✓</Text>}
                    </TouchableOpacity>
                  ))}

                  <Text style={[styles.reportSubtitle, { marginTop: 16 }]}>Description (optionnel)</Text>
                  <TextInput
                    style={styles.reportInput}
                    placeholder="Décrivez l'erreur..."
                    placeholderTextColor="#525252"
                    value={reportDescription}
                    onChangeText={setReportDescription}
                    multiline
                    maxLength={500}
                    textAlignVertical="top"
                  />
                  <Text style={styles.reportCharCount}>{reportDescription.length}/500</Text>

                  {reportError && (
                    <View style={styles.reportErrorBanner}>
                      <Text style={styles.reportErrorText}>{reportError}</Text>
                    </View>
                  )}

                  <View style={styles.reportActions}>
                    <TouchableOpacity style={styles.reportBackBtn} onPress={() => setReportStep('select')} activeOpacity={0.7}>
                      <Text style={styles.reportBackText}>← Retour</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.reportSubmitBtn, (!selectedReason || reportSubmitting) && styles.reportSubmitDisabled]}
                      onPress={submitReport}
                      disabled={!selectedReason || reportSubmitting}
                      activeOpacity={0.8}
                    >
                      {reportSubmitting ? (
                        <ActivityIndicator color="#FFF" size="small" />
                      ) : (
                        <Text style={styles.reportSubmitText}>ENVOYER</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

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
    </SwipeBackPage>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: 24, paddingBottom: 16 },
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
  // Report Button
  reportButton: {
    marginTop: 6, padding: 12, alignItems: 'center', borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(255,165,0,0.2)', backgroundColor: 'rgba(255,165,0,0.05)',
  },
  reportButtonText: { color: '#FFA500', fontSize: 12, fontWeight: '600' },
  // Report Modal
  reportOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end',
  },
  reportModal: {
    backgroundColor: '#0D0D1A', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: '85%', minHeight: 300,
    borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1,
    borderColor: 'rgba(0,255,255,0.15)',
  },
  reportHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  reportHeaderText: { color: '#FFF', fontSize: 16, fontWeight: '800', letterSpacing: 1 },
  reportClose: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.08)', justifyContent: 'center', alignItems: 'center' },
  reportCloseText: { color: '#A3A3A3', fontSize: 16, fontWeight: '600' },
  reportScroll: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24 },
  reportSubtitle: { color: '#A3A3A3', fontSize: 13, fontWeight: '600', marginBottom: 12 },
  // Question list item
  reportQuestionItem: {
    flexDirection: 'row', alignItems: 'center', padding: 14, marginBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  reportQuestionNumber: {
    width: 28, height: 28, borderRadius: 10, backgroundColor: 'rgba(138,43,226,0.2)',
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  reportQuestionNumberText: { color: '#8A2BE2', fontSize: 13, fontWeight: '800' },
  reportQuestionText: { flex: 1, color: '#E5E5E5', fontSize: 13, fontWeight: '500', lineHeight: 18 },
  reportQuestionArrow: { color: '#525252', fontSize: 20, fontWeight: '300', marginLeft: 8 },
  // Selected question preview
  reportSelectedPreview: {
    backgroundColor: 'rgba(138,43,226,0.08)', borderRadius: 12, padding: 14, marginBottom: 16,
    borderWidth: 1, borderColor: 'rgba(138,43,226,0.2)',
  },
  reportSelectedLabel: { color: '#8A2BE2', fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 6 },
  reportSelectedText: { color: '#E5E5E5', fontSize: 13, fontWeight: '500', lineHeight: 18 },
  // Reason items
  reportReasonItem: {
    flexDirection: 'row', alignItems: 'center', padding: 14, marginBottom: 6,
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  reportReasonSelected: {
    backgroundColor: 'rgba(0,255,255,0.06)', borderColor: 'rgba(0,255,255,0.25)',
  },
  reportReasonIcon: { fontSize: 18, marginRight: 12 },
  reportReasonLabel: { flex: 1, color: '#A3A3A3', fontSize: 14, fontWeight: '600' },
  reportReasonLabelSelected: { color: '#FFF' },
  reportReasonCheck: { color: '#00FFFF', fontSize: 16, fontWeight: '800' },
  // Description input
  reportInput: {
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', color: '#FFF',
    fontSize: 14, fontWeight: '500', height: 90, textAlignVertical: 'top',
  },
  reportCharCount: { color: '#525252', fontSize: 11, fontWeight: '500', textAlign: 'right', marginTop: 4 },
  // Error banner
  reportErrorBanner: {
    backgroundColor: 'rgba(255,59,48,0.1)', borderRadius: 10, padding: 12, marginTop: 12,
    borderWidth: 1, borderColor: 'rgba(255,59,48,0.2)',
  },
  reportErrorText: { color: '#FF3B30', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  // Action buttons
  reportActions: {
    flexDirection: 'row', gap: 10, marginTop: 20, paddingBottom: 20,
  },
  reportBackBtn: {
    flex: 1, padding: 14, borderRadius: 14, alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  reportBackText: { color: '#A3A3A3', fontSize: 14, fontWeight: '700' },
  reportSubmitBtn: {
    flex: 2, padding: 14, borderRadius: 14, alignItems: 'center',
    backgroundColor: '#FFA500',
  },
  reportSubmitDisabled: { backgroundColor: 'rgba(255,165,0,0.3)' },
  reportSubmitText: { color: '#FFF', fontSize: 14, fontWeight: '800', letterSpacing: 1 },
  // Success state
  reportSuccessContainer: {
    alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20,
  },
  reportSuccessEmoji: { fontSize: 56, marginBottom: 16 },
  reportSuccessTitle: { color: '#00FF9D', fontSize: 20, fontWeight: '800', marginBottom: 8 },
  reportSuccessDesc: { color: '#A3A3A3', fontSize: 14, fontWeight: '500', textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  reportSuccessBtn: {
    backgroundColor: '#8A2BE2', borderRadius: 14, paddingHorizontal: 40, paddingVertical: 14,
  },
  reportSuccessBtnText: { color: '#FFF', fontSize: 14, fontWeight: '800', letterSpacing: 2 },
});
