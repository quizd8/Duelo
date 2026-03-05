import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, Dimensions,
  Platform, LayoutAnimation, UIManager
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
const TIMER_DURATION = 10;
const TOTAL_QUESTIONS = 7;
const MAX_PTS_PER_Q = 20;
const MAX_TOTAL = MAX_PTS_PER_Q * TOTAL_QUESTIONS; // 140

type Question = {
  id: string;
  question_text: string;
  options: string[];
  correct_option: number;
};

const smoothAnim = LayoutAnimation.create(
  400,
  LayoutAnimation.Types.easeInEaseOut,
  LayoutAnimation.Properties.scaleY,
);

export default function GameScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    category: string; opponentPseudo: string; opponentSeed: string; isBot: string;
  }>();

  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [botAnswer, setBotAnswer] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [timeLeft, setTimeLeft] = useState(TIMER_DURATION);
  const [loading, setLoading] = useState(true);
  const [pseudo, setPseudo] = useState('Joueur');

  // Scores tracked with refs to avoid stale closures
  const playerScoreRef = useRef(0);
  const botScoreRef = useRef(0);
  const [playerScoreDisplay, setPlayerScoreDisplay] = useState(0);
  const [botScoreDisplay, setBotScoreDisplay] = useState(0);

  // Bar percentages (0-100) — state-driven with LayoutAnimation
  const [playerBarPct, setPlayerBarPct] = useState(0);
  const [botBarPct, setBotBarPct] = useState(0);
  const [playerPendingPct, setPlayerPendingPct] = useState((MAX_PTS_PER_Q / MAX_TOTAL) * 100);
  const [botPendingPct, setBotPendingPct] = useState((MAX_PTS_PER_Q / MAX_TOTAL) * 100);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressAnim = useRef(new Animated.Value(1)).current;
  const questionFade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    loadPseudo();
    fetchQuestions();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const loadPseudo = async () => {
    const p = await AsyncStorage.getItem('duelo_pseudo');
    if (p) setPseudo(p);
  };

  const fetchQuestions = async () => {
    try {
      const res = await fetch(`${API_URL}/api/game/questions?category=${params.category}`);
      const data = await res.json();
      setQuestions(data.slice(0, TOTAL_QUESTIONS));
      setLoading(false);
      animateQuestion();
      startTimer();
    } catch {
      router.back();
    }
  };

  const animateQuestion = () => {
    questionFade.setValue(0);
    Animated.timing(questionFade, { toValue: 1, duration: 250, useNativeDriver: true }).start();
  };

  const startTimer = () => {
    setTimeLeft(TIMER_DURATION);
    progressAnim.setValue(1);
    Animated.timing(progressAnim, {
      toValue: 0, duration: TIMER_DURATION * 1000, useNativeDriver: false,
    }).start();

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          handleTimeout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const resolveBotAnswer = (question: Question) => {
    const botCorrect = Math.random() > 0.35;
    if (botCorrect) {
      const botTime = Math.floor(Math.random() * 7) + 2;
      return { botPick: question.correct_option, botPts: Math.max(MAX_PTS_PER_Q - botTime, 10) };
    }
    const wrongOpts = [0, 1, 2, 3].filter(i => i !== question.correct_option);
    return { botPick: wrongOpts[Math.floor(Math.random() * wrongOpts.length)], botPts: 0 };
  };

  const updateBars = (pPts: number, bPts: number) => {
    const newP = playerScoreRef.current + pPts;
    const newB = botScoreRef.current + bPts;
    playerScoreRef.current = newP;
    botScoreRef.current = newB;

    setPlayerScoreDisplay(newP);
    setBotScoreDisplay(newB);

    // Animate bars with LayoutAnimation
    LayoutAnimation.configureNext(smoothAnim);
    setPlayerBarPct((newP / MAX_TOTAL) * 100);
    setBotBarPct((newB / MAX_TOTAL) * 100);
    setPlayerPendingPct(0);
    setBotPendingPct(0);
  };

  const handleTimeout = () => {
    setShowResult(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

    const question = questions[currentIndex];
    const { botPick, botPts } = resolveBotAnswer(question);
    setBotAnswer(botPick);
    updateBars(0, botPts);
    setTimeout(nextQuestion, 2000);
  };

  const selectAnswer = useCallback((optionIndex: number) => {
    if (selectedOption !== null || showResult) return;
    if (timerRef.current) clearInterval(timerRef.current);

    setSelectedOption(optionIndex);
    setShowResult(true);

    const question = questions[currentIndex];
    const isCorrect = optionIndex === question.correct_option;
    const timeTaken = TIMER_DURATION - timeLeft;
    const pPts = isCorrect ? Math.max(MAX_PTS_PER_Q - timeTaken, 10) : 0;

    Haptics.notificationAsync(
      isCorrect ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error
    );

    const { botPick, botPts } = resolveBotAnswer(question);
    setBotAnswer(botPick);
    updateBars(pPts, botPts);
    setTimeout(nextQuestion, 2000);
  }, [selectedOption, showResult, currentIndex, questions, timeLeft]);

  const nextQuestion = () => {
    if (currentIndex + 1 >= questions.length) {
      endGame();
      return;
    }
    setCurrentIndex(prev => prev + 1);
    setSelectedOption(null);
    setBotAnswer(null);
    setShowResult(false);

    // Reset pending for next question
    LayoutAnimation.configureNext(smoothAnim);
    setPlayerPendingPct((MAX_PTS_PER_Q / MAX_TOTAL) * 100);
    setBotPendingPct((MAX_PTS_PER_Q / MAX_TOTAL) * 100);

    animateQuestion();
    startTimer();
  };

  const endGame = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    const userId = await AsyncStorage.getItem('duelo_user_id');
    const ps = playerScoreRef.current;
    const bs = botScoreRef.current;
    router.replace(
      `/results?playerScore=${ps}&opponentScore=${bs}&opponentPseudo=${params.opponentPseudo}&category=${params.category}&userId=${userId}&isBot=${params.isBot}`
    );
  };

  if (loading || questions.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingView}>
          <Text style={styles.loadingText}>Chargement...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const question = questions[currentIndex];

  const getOptionBorderStyle = (index: number) => {
    if (!showResult) return {};
    if (index === question.correct_option) return { borderColor: '#00C853', borderWidth: 2.5 };
    if (index === selectedOption) return { borderColor: '#FF3B30', borderWidth: 2.5 };
    return {};
  };

  const getOptionTextColor = (index: number) => {
    if (!showResult) return '#1A1A1A';
    if (index === question.correct_option) return '#00C853';
    if (index === selectedOption) return '#FF3B30';
    return '#999';
  };

  return (
    <View style={styles.container}>
      {/* ── Progress Bar (Violet) ── */}
      <View style={styles.progressBarBg}>
        <Animated.View style={[styles.progressBarFill, {
          width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
        }]} />
        <View style={[styles.progressBarDone, { width: `${(currentIndex / questions.length) * 100}%` }]} />
      </View>

      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* ── Header ── */}
        <View style={styles.headerRow}>
          <View style={styles.playerInfo}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarLetter}>{pseudo[0]?.toUpperCase()}</Text>
            </View>
            <View style={styles.playerMeta}>
              <Text style={styles.playerName} numberOfLines={1}>{pseudo}</Text>
              <Text style={styles.playerTitle}>Challenger</Text>
              <Text style={styles.playerScoreNum}>{playerScoreDisplay}</Text>
            </View>
          </View>

          <View style={styles.timerCenter}>
            <Text style={styles.timerLabel}>Temps restant</Text>
            <View style={[styles.timerCircle, timeLeft <= 3 && styles.timerDanger]}>
              <Text style={[styles.timerNum, timeLeft <= 3 && styles.timerNumDanger]}>{timeLeft}</Text>
            </View>
          </View>

          <View style={styles.opponentInfo}>
            <View style={styles.playerMeta}>
              <Text style={[styles.playerName, { textAlign: 'right' }]} numberOfLines={1}>
                {params.opponentPseudo?.slice(0, 10)}
              </Text>
              <Text style={[styles.playerTitle, { textAlign: 'right' }]}>Bot</Text>
              <Text style={[styles.playerScoreNum, { textAlign: 'right' }]}>{botScoreDisplay}</Text>
            </View>
            <View style={[styles.avatarCircle, styles.avatarBot]}>
              <Text style={styles.avatarLetter}>{(params.opponentPseudo || 'B')[0]?.toUpperCase()}</Text>
            </View>
          </View>
        </View>

        <Text style={styles.questionCounter}>Question {currentIndex + 1}/{questions.length}</Text>

        {/* ── Main Area ── */}
        <View style={styles.gameArea}>

          {/* LEFT BAR (Player) */}
          <View style={styles.barColumn}>
            <View style={styles.barTrack}>
              {/* Empty space at top */}
              <View style={{ flex: 100 - playerBarPct - playerPendingPct }} />
              {/* Pending (lighter green/gray) */}
              <View style={[styles.barPending, { flex: Math.max(playerPendingPct, 0) }]} />
              {/* Earned (solid green) */}
              <View style={[styles.barEarned, { flex: Math.max(playerBarPct, 0), backgroundColor: '#00C853' }]} />
            </View>
          </View>

          {/* CENTER CONTENT */}
          <View style={styles.centerContent}>
            <Animated.View style={[styles.questionBox, { opacity: questionFade }]}>
              <Text style={styles.questionText}>{question.question_text}</Text>
            </Animated.View>

            <View style={styles.optionsBox}>
              {question.options.map((option, index) => {
                const isPlayerPick = selectedOption === index;
                const isBotPick = botAnswer === index;

                return (
                  <TouchableOpacity
                    testID={`option-${index}`}
                    key={index}
                    style={[styles.optionCard, getOptionBorderStyle(index)]}
                    onPress={() => selectAnswer(index)}
                    disabled={showResult}
                    activeOpacity={0.85}
                  >
                    {/* LEFT triangle (player) — base flush right edge of triangle = left edge of card */}
                    {showResult && isPlayerPick && (
                      <View style={styles.triLeftAnchor}>
                        <View style={styles.triLeft} />
                      </View>
                    )}

                    <Text style={[styles.optionText, { color: getOptionTextColor(index) }]} numberOfLines={2}>
                      {option}
                    </Text>

                    {/* RIGHT triangle (bot) — base flush left edge of triangle = right edge of card */}
                    {showResult && isBotPick && (
                      <View style={styles.triRightAnchor}>
                        <View style={styles.triRight} />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* RIGHT BAR (Bot) */}
          <View style={styles.barColumn}>
            <View style={styles.barTrack}>
              <View style={{ flex: 100 - botBarPct - botPendingPct }} />
              <View style={[styles.barPending, { flex: Math.max(botPendingPct, 0) }]} />
              <View style={[styles.barEarned, { flex: Math.max(botBarPct, 0), backgroundColor: '#00C853' }]} />
            </View>
          </View>

        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1A1A1A' },
  safeArea: { flex: 1 },
  loadingView: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#FFF', fontSize: 16 },

  // Progress
  progressBarBg: { height: 5, backgroundColor: '#333', width: '100%' },
  progressBarFill: { position: 'absolute', height: 5, backgroundColor: '#8A2BE2' },
  progressBarDone: { position: 'absolute', height: 5, backgroundColor: '#6B21A8' },

  // Header
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 8, backgroundColor: 'rgba(0,0,0,0.3)',
  },
  playerInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  opponentInfo: { flexDirection: 'row', alignItems: 'center', flex: 1, justifyContent: 'flex-end' },
  avatarCircle: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#8A2BE2',
    justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#fff',
  },
  avatarBot: { backgroundColor: '#2196F3' },
  avatarLetter: { color: '#FFF', fontSize: 20, fontWeight: '800' },
  playerMeta: { marginHorizontal: 8 },
  playerName: { color: '#FFF', fontSize: 13, fontWeight: '700', maxWidth: 80 },
  playerTitle: { color: '#888', fontSize: 10 },
  playerScoreNum: { color: '#00C853', fontSize: 20, fontWeight: '900' },

  // Timer
  timerCenter: { alignItems: 'center', paddingHorizontal: 8 },
  timerLabel: { color: '#888', fontSize: 9, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  timerCircle: {
    width: 48, height: 48, borderRadius: 24, borderWidth: 3, borderColor: '#00BFFF',
    justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,191,255,0.1)',
  },
  timerDanger: { borderColor: '#FF3B30', backgroundColor: 'rgba(255,59,48,0.1)' },
  timerNum: { color: '#00BFFF', fontSize: 22, fontWeight: '900' },
  timerNumDanger: { color: '#FF3B30' },

  questionCounter: {
    color: '#666', fontSize: 11, fontWeight: '700', textAlign: 'center',
    textTransform: 'uppercase', letterSpacing: 2, paddingVertical: 6,
  },

  // Game area
  gameArea: { flex: 1, flexDirection: 'row' },

  // Score Bars — flex-based for reliable height
  barColumn: { width: 18, paddingVertical: 12, alignItems: 'center' },
  barTrack: {
    width: 14, flex: 1, backgroundColor: '#2A2A2A', borderRadius: 7,
    overflow: 'hidden', flexDirection: 'column',
  },
  barPending: { backgroundColor: 'rgba(0,200,83,0.30)', minHeight: 0 },
  barEarned: { minHeight: 0, borderRadius: 0 },

  // Center
  centerContent: { flex: 1, paddingHorizontal: 4 },
  questionBox: {
    paddingHorizontal: 16, paddingVertical: 16,
    justifyContent: 'center', alignItems: 'center', minHeight: 80,
  },
  questionText: { color: '#FFF', fontSize: 20, fontWeight: '800', textAlign: 'center', lineHeight: 28 },

  // Options
  optionsBox: { flex: 1, justifyContent: 'center', gap: 10, paddingBottom: 16, paddingHorizontal: 8 },
  optionCard: {
    backgroundColor: '#FFFFFF', borderRadius: 8,
    paddingVertical: 16, paddingHorizontal: 20,
    justifyContent: 'center', alignItems: 'center',
    minHeight: 56, borderWidth: 1, borderColor: '#E0E0E0',
    position: 'relative', overflow: 'visible',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 },
      android: { elevation: 2 },
    }),
  },
  optionText: { fontSize: 17, fontWeight: '800', textAlign: 'center', color: '#1A1A1A' },

  // Triangles — base flush with card edge, point toward screen center
  // Left anchor: stretches full height of card, centered vertically
  triLeftAnchor: {
    position: 'absolute',
    left: -16,
    top: 0,
    bottom: 0,
    width: 16,
    justifyContent: 'center',
    alignItems: 'flex-end', // push triangle so its right edge (base) touches card left
  },
  triLeft: {
    width: 0, height: 0,
    borderTopWidth: 14, borderTopColor: 'transparent',
    borderBottomWidth: 14, borderBottomColor: 'transparent',
    borderLeftWidth: 16, borderLeftColor: '#111',
  },
  // Right anchor: stretches full height of card, centered vertically
  triRightAnchor: {
    position: 'absolute',
    right: -16,
    top: 0,
    bottom: 0,
    width: 16,
    justifyContent: 'center',
    alignItems: 'flex-start', // push triangle so its left edge (base) touches card right
  },
  triRight: {
    width: 0, height: 0,
    borderTopWidth: 14, borderTopColor: 'transparent',
    borderBottomWidth: 14, borderBottomColor: 'transparent',
    borderRightWidth: 16, borderRightColor: '#111',
  },
});
