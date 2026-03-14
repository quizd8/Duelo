import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, Dimensions,
  Platform, UIManager
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { GLASS } from '../theme/glassTheme';
import SwipeBackPage from '../components/SwipeBackPage';

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

// ── Animated Score Bar component ──
function AnimatedBar({ score, showPending }: { score: number; showPending: boolean }) {
  const [trackHeight, setTrackHeight] = useState(0);
  const barHeightAnim = useRef(new Animated.Value(0)).current;
  const pendingOpacity = useRef(new Animated.Value(1)).current;
  const prevScore = useRef(0);

  useEffect(() => {
    if (trackHeight <= 0) return;

    const targetH = (score / MAX_TOTAL) * trackHeight;

    // Animate the bar growing smoothly
    Animated.timing(barHeightAnim, {
      toValue: targetH,
      duration: 500,
      useNativeDriver: false,
    }).start();

    prevScore.current = score;
  }, [score, trackHeight]);

  useEffect(() => {
    // Fade pending in/out
    Animated.timing(pendingOpacity, {
      toValue: showPending ? 1 : 0,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [showPending]);

  const pendingHeight = trackHeight > 0 ? (MAX_PTS_PER_Q / MAX_TOTAL) * trackHeight : 0;

  return (
    <View style={styles.barColumn}>
      <View
        style={styles.barTrack}
        onLayout={(e) => setTrackHeight(e.nativeEvent.layout.height)}
      >
        {/* Pending area — sits on top of earned */}
        <Animated.View style={{
          position: 'absolute',
          left: 0, right: 0,
          bottom: barHeightAnim,
          height: pendingHeight,
          backgroundColor: 'rgba(0,200,83,0.30)',
          borderRadius: 7,
          opacity: pendingOpacity,
        }} />

        {/* Earned (solid green, grows from bottom) */}
        <Animated.View style={{
          position: 'absolute',
          left: 0, right: 0, bottom: 0,
          height: barHeightAnim,
          backgroundColor: '#00C853',
          borderRadius: 7,
        }} />
      </View>
    </View>
  );
}

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
  const [showPending, setShowPending] = useState(true);

  // Score refs to avoid stale closures
  const playerScoreRef = useRef(0);
  const botScoreRef = useRef(0);
  const correctCountRef = useRef(0);
  const opponentLevelRef = useRef(1);
  const [playerScore, setPlayerScore] = useState(0);
  const [botScore, setBotScore] = useState(0);

  // Progress bar state (questions)
  const [completedQuestions, setCompletedQuestions] = useState(0);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerAnim = useRef(new Animated.Value(1)).current;
  const questionFade = useRef(new Animated.Value(0)).current;

  // Progress bar animation
  const progressAnim = useRef(new Animated.Value(0)).current;
  const progressPendingOpacity = useRef(new Animated.Value(1)).current;

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
      const res = await fetch(`${API_URL}/api/game/questions-v2?theme=${params.category}`);
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
    timerAnim.setValue(1);
    Animated.timing(timerAnim, {
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

  const handleAnswer = (pPts: number, bPts: number, botPick: number) => {
    const newP = playerScoreRef.current + pPts;
    const newB = botScoreRef.current + bPts;
    playerScoreRef.current = newP;
    botScoreRef.current = newB;
    setPlayerScore(newP);
    setBotScore(newB);
    setBotAnswer(botPick);

    // Hide pending on bars (answered)
    setShowPending(false);

    // Animate progress bar: question completed
    const done = completedQuestions + 1;
    setCompletedQuestions(done);
    Animated.timing(progressAnim, {
      toValue: done / TOTAL_QUESTIONS,
      duration: 400,
      useNativeDriver: false,
    }).start();

    // Fade out progress pending
    Animated.timing(progressPendingOpacity, {
      toValue: 0, duration: 300, useNativeDriver: false,
    }).start();

    setTimeout(nextQuestion, 2000);
  };

  const handleTimeout = () => {
    setShowResult(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    const question = questions[currentIndex];
    const { botPick, botPts } = resolveBotAnswer(question);
    handleAnswer(0, botPts, botPick);
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

    if (isCorrect) correctCountRef.current += 1;

    const { botPick, botPts } = resolveBotAnswer(question);
    handleAnswer(pPts, botPts, botPick);
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
    setShowPending(true);

    // Show progress pending for new question
    Animated.timing(progressPendingOpacity, {
      toValue: 1, duration: 200, useNativeDriver: false,
    }).start();

    animateQuestion();
    startTimer();
  };

  const endGame = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    const userId = await AsyncStorage.getItem('duelo_user_id');
    const ps = playerScoreRef.current;
    const bs = botScoreRef.current;
    const cc = correctCountRef.current;
    const ol = parseInt(params.opponentLevel || '1') || 1;
    // Save questions for the report feature on results screen
    try {
      await AsyncStorage.setItem('duelo_last_quiz_questions', JSON.stringify(questions));
    } catch {}
    router.replace(
      `/results?playerScore=${ps}&opponentScore=${bs}&opponentPseudo=${params.opponentPseudo}&category=${params.category}&userId=${userId}&isBot=${params.isBot}&correctCount=${cc}&opponentLevel=${ol}`
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

  const oneQPct = (1 / TOTAL_QUESTIONS) * 100; // ~14.3%

  return (
    <SwipeBackPage>
    <View style={styles.container}>
      {/* ── Progress Bar (Question advancement, not timer) ── */}
      <View style={styles.progressBarBg}>
        {/* Solid completed portion */}
        <Animated.View style={[styles.progressBarSolid, {
          width: progressAnim.interpolate({
            inputRange: [0, 1],
            outputRange: ['0%', '100%'],
          }),
        }]} />
        {/* Pending portion for current question */}
        <Animated.View style={[styles.progressBarPending, {
          width: `${oneQPct}%`,
          left: progressAnim.interpolate({
            inputRange: [0, 1],
            outputRange: ['0%', '100%'],
          }),
          opacity: progressPendingOpacity,
        }]} />
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
              <Text style={styles.playerScoreNum}>{playerScore}</Text>
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
              <Text style={[styles.playerScoreNum, { textAlign: 'right' }]}>{botScore}</Text>
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
          <AnimatedBar score={playerScore} showPending={showPending} />

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
                    {showResult && isPlayerPick && (
                      <View style={styles.triLeftAnchor}>
                        <View style={styles.triLeft} />
                      </View>
                    )}

                    <Text style={[styles.optionText, { color: getOptionTextColor(index) }]} numberOfLines={2}>
                      {option}
                    </Text>

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
          <AnimatedBar score={botScore} showPending={showPending} />
        </View>
      </SafeAreaView>
    </View>
    </SwipeBackPage>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  safeArea: { flex: 1 },
  loadingView: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#FFF', fontSize: 16 },

  // Progress bar (question advancement)
  progressBarBg: { height: 6, backgroundColor: '#333', width: '100%', borderRadius: 3, overflow: 'hidden' },
  progressBarSolid: {
    position: 'absolute', height: 6, backgroundColor: '#8A2BE2',
    borderRadius: 3,
  },
  progressBarPending: {
    position: 'absolute', height: 6,
    backgroundColor: 'rgba(138,43,226,0.35)',
    borderRadius: 3,
  },

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

  // Score bars
  barColumn: { width: 18, paddingVertical: 12, alignItems: 'center' },
  barTrack: {
    width: 14, flex: 1, backgroundColor: '#2A2A2A',
    borderRadius: 7, overflow: 'hidden', position: 'relative',
  },

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

  // Triangles
  triLeftAnchor: {
    position: 'absolute', left: -16, top: 0, bottom: 0,
    width: 16, justifyContent: 'center', alignItems: 'flex-end',
  },
  triLeft: {
    width: 0, height: 0,
    borderTopWidth: 14, borderTopColor: 'transparent',
    borderBottomWidth: 14, borderBottomColor: 'transparent',
    borderLeftWidth: 16, borderLeftColor: '#111',
  },
  triRightAnchor: {
    position: 'absolute', right: -16, top: 0, bottom: 0,
    width: 16, justifyContent: 'center', alignItems: 'flex-start',
  },
  triRight: {
    width: 0, height: 0,
    borderTopWidth: 14, borderTopColor: 'transparent',
    borderBottomWidth: 14, borderBottomColor: 'transparent',
    borderRightWidth: 16, borderRightColor: '#111',
  },
});
