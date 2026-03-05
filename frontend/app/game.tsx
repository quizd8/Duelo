import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, Dimensions, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';

const { width, height } = Dimensions.get('window');
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
  const [playerScore, setPlayerScore] = useState(0);
  const [opponentScore, setOpponentScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(TIMER_DURATION);
  const [loading, setLoading] = useState(true);
  const [pseudo, setPseudo] = useState('Joueur');

  // Score bar state: tracks cumulated scores for bar rendering
  const [playerBarScore, setPlayerBarScore] = useState(0);
  const [botBarScore, setBotBarScore] = useState(0);
  const [playerPending, setPlayerPending] = useState(MAX_PTS_PER_Q); // gray preview
  const [botPending, setBotPending] = useState(MAX_PTS_PER_Q);
  const [questionAnswered, setQuestionAnswered] = useState(false);

  // Animated values for smooth bar transitions
  const playerBarAnim = useRef(new Animated.Value(0)).current;
  const botBarAnim = useRef(new Animated.Value(0)).current;
  const playerPendingAnim = useRef(new Animated.Value(MAX_PTS_PER_Q / MAX_TOTAL)).current;
  const botPendingAnim = useRef(new Animated.Value(MAX_PTS_PER_Q / MAX_TOTAL)).current;

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressAnim = useRef(new Animated.Value(1)).current;
  const questionFade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    loadPseudo();
    fetchQuestions();
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
    let botPick: number;
    let botPts = 0;
    if (botCorrect) {
      botPick = question.correct_option;
      const botTime = Math.floor(Math.random() * 7) + 2;
      botPts = Math.max(MAX_PTS_PER_Q - botTime, 10);
    } else {
      const wrongOpts = [0, 1, 2, 3].filter(i => i !== question.correct_option);
      botPick = wrongOpts[Math.floor(Math.random() * wrongOpts.length)];
    }
    return { botPick, botPts, botCorrect };
  };

  const updateBars = (pPoints: number, bPoints: number, newPScore: number, newBScore: number) => {
    setQuestionAnswered(true);

    // Animate player bar
    Animated.timing(playerBarAnim, {
      toValue: newPScore / MAX_TOTAL,
      duration: 400, useNativeDriver: false,
    }).start();

    // Fade out player pending (gray portion goes to 0)
    Animated.timing(playerPendingAnim, {
      toValue: 0, duration: 300, useNativeDriver: false,
    }).start();

    // Animate bot bar
    Animated.timing(botBarAnim, {
      toValue: newBScore / MAX_TOTAL,
      duration: 400, useNativeDriver: false,
    }).start();

    // Fade out bot pending
    Animated.timing(botPendingAnim, {
      toValue: 0, duration: 300, useNativeDriver: false,
    }).start();
  };

  const handleTimeout = () => {
    setShowResult(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

    const question = questions[currentIndex];
    const { botPick, botPts } = resolveBotAnswer(question);
    setBotAnswer(botPick);

    const newBScore = opponentScore + botPts;
    setOpponentScore(newBScore);
    setBotBarScore(newBScore);

    // Player gets 0 (timeout)
    updateBars(0, botPts, playerScore, newBScore);

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
    const pPoints = isCorrect ? Math.max(MAX_PTS_PER_Q - timeTaken, 10) : 0;

    if (isCorrect) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }

    const newPScore = playerScore + pPoints;
    setPlayerScore(newPScore);
    setPlayerBarScore(newPScore);

    const { botPick, botPts } = resolveBotAnswer(question);
    setBotAnswer(botPick);
    const newBScore = opponentScore + botPts;
    setOpponentScore(newBScore);
    setBotBarScore(newBScore);

    updateBars(pPoints, botPts, newPScore, newBScore);

    setTimeout(nextQuestion, 2000);
  }, [selectedOption, showResult, currentIndex, questions, timeLeft, playerScore, opponentScore]);

  const nextQuestion = () => {
    if (currentIndex + 1 >= questions.length) {
      endGame();
      return;
    }
    setCurrentIndex(prev => prev + 1);
    setSelectedOption(null);
    setBotAnswer(null);
    setShowResult(false);
    setQuestionAnswered(false);

    // Reset pending previews for next question
    setPlayerPending(MAX_PTS_PER_Q);
    setBotPending(MAX_PTS_PER_Q);
    playerPendingAnim.setValue(MAX_PTS_PER_Q / MAX_TOTAL);
    botPendingAnim.setValue(MAX_PTS_PER_Q / MAX_TOTAL);

    animateQuestion();
    startTimer();
  };

  const endGame = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    const userId = await AsyncStorage.getItem('duelo_user_id');
    router.replace(
      `/results?playerScore=${playerScore}&opponentScore=${opponentScore}&opponentPseudo=${params.opponentPseudo}&category=${params.category}&userId=${userId}&isBot=${params.isBot}`
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
  const progress = currentIndex / questions.length;

  const getOptionStyle = (index: number) => {
    if (!showResult) return {};
    const isCorrect = index === question.correct_option;
    const isPlayerPick = index === selectedOption;
    if (isCorrect) return { borderColor: '#00C853', borderWidth: 2.5 };
    if (isPlayerPick && !isCorrect) return { borderColor: '#FF3B30', borderWidth: 2.5 };
    return {};
  };

  const getOptionTextColor = (index: number) => {
    if (!showResult) return '#1A1A1A';
    if (index === question.correct_option) return '#00C853';
    if (index === selectedOption) return '#FF3B30';
    return '#999';
  };

  // Score bar component
  const ScoreBar = ({ barAnim, pendingAnim, isLeft }: { barAnim: Animated.Value; pendingAnim: Animated.Value; isLeft: boolean }) => (
    <View style={styles.sideBarContainer}>
      <View style={styles.sideBarTrack}>
        {/* Solid earned portion (grows from bottom) */}
        <Animated.View style={[styles.sideBarEarned, {
          height: barAnim.interpolate({
            inputRange: [0, 1],
            outputRange: ['0%', '100%'],
          }),
          backgroundColor: isLeft ? '#00C853' : '#00C853',
        }]} />

        {/* Gray pending portion (potential points, sits on top of earned) */}
        <Animated.View style={[styles.sideBarPending, {
          height: pendingAnim.interpolate({
            inputRange: [0, 1],
            outputRange: ['0%', '100%'],
          }),
          bottom: barAnim.interpolate({
            inputRange: [0, 1],
            outputRange: ['0%', '100%'],
          }),
        }]} />
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* ── Progress Bar (Violet) ── */}
      <View style={styles.progressBarBg}>
        <Animated.View style={[styles.progressBarFill, {
          width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
        }]} />
        <View style={[styles.progressBarDone, { width: `${progress * 100}%` }]} />
      </View>

      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* ── Header: Players + Timer ── */}
        <View style={styles.headerRow}>
          {/* Player (Left) */}
          <View style={styles.playerInfo}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarLetter}>{pseudo[0]?.toUpperCase()}</Text>
            </View>
            <View style={styles.playerMeta}>
              <Text style={styles.playerName} numberOfLines={1}>{pseudo}</Text>
              <Text style={styles.playerTitle}>Challenger</Text>
              <Text style={styles.playerScoreText}>{playerScore}</Text>
            </View>
          </View>

          {/* Timer (Center) */}
          <View style={styles.timerCenter}>
            <Text style={styles.timerLabel}>Temps restant</Text>
            <View style={[styles.timerCircle, timeLeft <= 3 && styles.timerDanger]}>
              <Text style={[styles.timerNumber, timeLeft <= 3 && styles.timerNumberDanger]}>
                {timeLeft}
              </Text>
            </View>
          </View>

          {/* Opponent (Right) */}
          <View style={styles.opponentInfo}>
            <View style={styles.playerMeta}>
              <Text style={[styles.playerName, { textAlign: 'right' }]} numberOfLines={1}>
                {params.opponentPseudo?.slice(0, 10)}
              </Text>
              <Text style={[styles.playerTitle, { textAlign: 'right' }]}>Bot</Text>
              <Text style={styles.opponentScoreText}>{opponentScore}</Text>
            </View>
            <View style={[styles.avatarCircle, styles.avatarOpponent]}>
              <Text style={styles.avatarLetter}>
                {(params.opponentPseudo || 'B')[0]?.toUpperCase()}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Question Counter ── */}
        <Text style={styles.questionCounter}>Question {currentIndex + 1}/{questions.length}</Text>

        {/* ── Main Game Area with Side Bars ── */}
        <View style={styles.gameArea}>
          {/* Left Score Bar (Player) */}
          <ScoreBar barAnim={playerBarAnim} pendingAnim={playerPendingAnim} isLeft={true} />

          {/* Center Content */}
          <View style={styles.centerContent}>
            {/* Question */}
            <Animated.View style={[styles.questionBox, { opacity: questionFade }]}>
              <Text style={styles.questionText}>{question.question_text}</Text>
            </Animated.View>

            {/* Answer Options */}
            <View style={styles.optionsBox}>
              {question.options.map((option, index) => {
                const isPlayerPick = selectedOption === index;
                const isBotPick = botAnswer === index;

                return (
                  <View key={index} style={styles.optionRow}>
                    <TouchableOpacity
                      testID={`option-${index}`}
                      style={[styles.optionCard, getOptionStyle(index)]}
                      onPress={() => selectAnswer(index)}
                      disabled={showResult}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.optionText, { color: getOptionTextColor(index) }]} numberOfLines={2}>
                        {option}
                      </Text>

                      {/* Left triangle (player pick) - centered vertically, bites left edge */}
                      {showResult && isPlayerPick && (
                        <View style={styles.triangleLeftAnchor}>
                          <View style={styles.triangleLeft} />
                        </View>
                      )}

                      {/* Right triangle (bot pick) - centered vertically, bites right edge */}
                      {showResult && isBotPick && (
                        <View style={styles.triangleRightAnchor}>
                          <View style={styles.triangleRight} />
                        </View>
                      )}
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          </View>

          {/* Right Score Bar (Opponent) */}
          <ScoreBar barAnim={botBarAnim} pendingAnim={botPendingAnim} isLeft={false} />
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

  // ── Progress Bar ──
  progressBarBg: { height: 5, backgroundColor: '#333', width: '100%' },
  progressBarFill: {
    position: 'absolute', height: 5, backgroundColor: '#8A2BE2',
    borderTopRightRadius: 3, borderBottomRightRadius: 3,
  },
  progressBarDone: { position: 'absolute', height: 5, backgroundColor: '#6B21A8' },

  // ── Header ──
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  playerInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  opponentInfo: { flexDirection: 'row', alignItems: 'center', flex: 1, justifyContent: 'flex-end' },
  avatarCircle: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#8A2BE2', justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  avatarOpponent: { backgroundColor: '#2196F3' },
  avatarLetter: { color: '#FFF', fontSize: 20, fontWeight: '800' },
  playerMeta: { marginHorizontal: 8 },
  playerName: { color: '#FFF', fontSize: 13, fontWeight: '700', maxWidth: 80 },
  playerTitle: { color: '#888', fontSize: 10, fontWeight: '500' },
  playerScoreText: { color: '#00C853', fontSize: 20, fontWeight: '900' },
  opponentScoreText: { color: '#00C853', fontSize: 20, fontWeight: '900', textAlign: 'right' },

  // ── Timer ──
  timerCenter: { alignItems: 'center', paddingHorizontal: 8 },
  timerLabel: { color: '#888', fontSize: 9, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  timerCircle: {
    width: 48, height: 48, borderRadius: 24,
    borderWidth: 3, borderColor: '#00BFFF',
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(0,191,255,0.1)',
  },
  timerDanger: { borderColor: '#FF3B30', backgroundColor: 'rgba(255,59,48,0.1)' },
  timerNumber: { color: '#00BFFF', fontSize: 22, fontWeight: '900' },
  timerNumberDanger: { color: '#FF3B30' },

  // ── Question Counter ──
  questionCounter: {
    color: '#666', fontSize: 11, fontWeight: '700', textAlign: 'center',
    textTransform: 'uppercase', letterSpacing: 2, paddingVertical: 6,
  },

  // ── Game Area ──
  gameArea: { flex: 1, flexDirection: 'row' },

  // ── Score Bars ──
  sideBarContainer: {
    width: 18, paddingVertical: 16, alignItems: 'center',
  },
  sideBarTrack: {
    width: 14, flex: 1, backgroundColor: '#222',
    borderRadius: 7, overflow: 'hidden',
    position: 'relative',
  },
  sideBarEarned: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    borderRadius: 7,
  },
  sideBarPending: {
    position: 'absolute', left: 0, right: 0,
    backgroundColor: 'rgba(0,200,83,0.35)',
    borderRadius: 7,
  },

  // ── Center Content ──
  centerContent: { flex: 1, paddingHorizontal: 4 },

  // ── Question ──
  questionBox: {
    paddingHorizontal: 16, paddingVertical: 16,
    justifyContent: 'center', alignItems: 'center',
    minHeight: 80,
  },
  questionText: {
    color: '#FFFFFF', fontSize: 20, fontWeight: '800',
    textAlign: 'center', lineHeight: 28,
  },

  // ── Options ──
  optionsBox: { flex: 1, justifyContent: 'center', gap: 10, paddingBottom: 16, paddingHorizontal: 8 },
  optionRow: { flexDirection: 'row', alignItems: 'center' },
  optionCard: {
    flex: 1, backgroundColor: '#FFFFFF', borderRadius: 8,
    paddingVertical: 16, paddingHorizontal: 14,
    justifyContent: 'center', alignItems: 'center',
    minHeight: 56, borderWidth: 1, borderColor: '#E0E0E0',
    position: 'relative', overflow: 'visible',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 },
      android: { elevation: 2 },
    }),
  },
  optionText: {
    fontSize: 17, fontWeight: '800', textAlign: 'center', color: '#1A1A1A',
  },

  // ── Triangles ──
  // Anchored to card edges, using top:0 bottom:0 + justifyContent:center for perfect vertical centering
  triangleLeftAnchor: {
    position: 'absolute', left: -15, top: 0, bottom: 0,
    justifyContent: 'center',
  },
  triangleLeft: {
    width: 0, height: 0,
    borderTopWidth: 13, borderTopColor: 'transparent',
    borderBottomWidth: 13, borderBottomColor: 'transparent',
    borderLeftWidth: 15, borderLeftColor: '#111',
  },
  triangleRightAnchor: {
    position: 'absolute', right: -15, top: 0, bottom: 0,
    justifyContent: 'center',
  },
  triangleRight: {
    width: 0, height: 0,
    borderTopWidth: 13, borderTopColor: 'transparent',
    borderBottomWidth: 13, borderBottomColor: 'transparent',
    borderRightWidth: 15, borderRightColor: '#111',
  },
});
