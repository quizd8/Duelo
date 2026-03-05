import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, Dimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';

const { width } = Dimensions.get('window');
const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const TIMER_DURATION = 10;
const TOTAL_QUESTIONS = 7;

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
  const [showResult, setShowResult] = useState(false);
  const [playerScore, setPlayerScore] = useState(0);
  const [opponentScore, setOpponentScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(TIMER_DURATION);
  const [gameOver, setGameOver] = useState(false);
  const [loading, setLoading] = useState(true);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const progressAnim = useRef(new Animated.Value(1)).current;
  const optionAnims = useRef([
    new Animated.Value(0), new Animated.Value(0),
    new Animated.Value(0), new Animated.Value(0),
  ]).current;

  useEffect(() => {
    fetchQuestions();
  }, []);

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
    fadeAnim.setValue(0);
    slideAnim.setValue(30);
    optionAnims.forEach(a => a.setValue(0));

    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();

    optionAnims.forEach((anim, i) => {
      Animated.timing(anim, {
        toValue: 1, duration: 250, delay: 100 + i * 80, useNativeDriver: true,
      }).start();
    });
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

  const handleTimeout = () => {
    setShowResult(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    // Bot might answer correctly
    const botCorrect = Math.random() > 0.4;
    if (botCorrect) {
      setOpponentScore(prev => prev + Math.floor(Math.random() * 11) + 10);
    }
    setTimeout(nextQuestion, 1500);
  };

  const selectAnswer = useCallback((optionIndex: number) => {
    if (selectedOption !== null || showResult) return;

    if (timerRef.current) clearInterval(timerRef.current);
    setSelectedOption(optionIndex);
    setShowResult(true);

    const question = questions[currentIndex];
    const isCorrect = optionIndex === question.correct_option;
    const timeTaken = TIMER_DURATION - timeLeft;
    const points = isCorrect ? Math.max(20 - timeTaken, 10) : 0;

    if (isCorrect) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPlayerScore(prev => prev + points);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }

    // Bot score
    const botCorrect = Math.random() > 0.35;
    if (botCorrect) {
      const botTime = Math.floor(Math.random() * 7) + 2;
      setOpponentScore(prev => prev + Math.max(20 - botTime, 10));
    }

    setTimeout(nextQuestion, 1500);
  }, [selectedOption, showResult, currentIndex, questions, timeLeft]);

  const nextQuestion = () => {
    if (currentIndex + 1 >= questions.length) {
      endGame();
      return;
    }
    setCurrentIndex(prev => prev + 1);
    setSelectedOption(null);
    setShowResult(false);
    animateQuestion();
    startTimer();
  };

  const endGame = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setGameOver(true);
    const userId = await AsyncStorage.getItem('duelo_user_id');

    router.replace(
      `/results?playerScore=${playerScore}&opponentScore=${opponentScore}&opponentPseudo=${params.opponentPseudo}&category=${params.category}&userId=${userId}&isBot=${params.isBot}`
    );
  };

  if (loading || questions.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingView}>
          <Text style={styles.loadingText}>Chargement des questions...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const question = questions[currentIndex];
  const progress = (currentIndex + 1) / questions.length;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        {/* Progress */}
        <View style={styles.progressRow}>
          <Text style={styles.questionNumber}>{currentIndex + 1}/{questions.length}</Text>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
          </View>
        </View>

        {/* Scores */}
        <View style={styles.scoreRow}>
          <View style={styles.scoreBox}>
            <Text style={styles.scoreLabel}>Toi</Text>
            <Text style={styles.scoreValue}>{playerScore}</Text>
          </View>

          {/* Timer */}
          <View style={styles.timerContainer}>
            <Animated.View style={[styles.timerRing, {
              borderColor: timeLeft <= 3 ? '#FF3B30' : '#8A2BE2',
            }]}>
              <Text style={[styles.timerText, timeLeft <= 3 && styles.timerDanger]}>
                {timeLeft}
              </Text>
            </Animated.View>
          </View>

          <View style={styles.scoreBox}>
            <Text style={styles.scoreLabel}>{params.opponentPseudo?.slice(0, 10)}</Text>
            <Text style={[styles.scoreValue, { color: '#FF3B30' }]}>{opponentScore}</Text>
          </View>
        </View>
      </View>

      {/* Question */}
      <Animated.View style={[styles.questionContainer, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        <View style={styles.questionCard}>
          <Text style={styles.questionText}>{question.question_text}</Text>
        </View>
      </Animated.View>

      {/* Options */}
      <View style={styles.optionsContainer}>
        {question.options.map((option, index) => {
          const isSelected = selectedOption === index;
          const isCorrect = index === question.correct_option;
          let optionStyle = styles.option;
          let textStyle = styles.optionText;

          if (showResult) {
            if (isCorrect) {
              optionStyle = { ...styles.option, ...styles.optionCorrect };
              textStyle = { ...styles.optionText, ...styles.optionTextCorrect };
            } else if (isSelected && !isCorrect) {
              optionStyle = { ...styles.option, ...styles.optionWrong };
              textStyle = { ...styles.optionText, ...styles.optionTextWrong };
            }
          }

          return (
            <Animated.View
              key={index}
              style={{
                opacity: optionAnims[index],
                transform: [{ translateX: optionAnims[index].interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }],
              }}
            >
              <TouchableOpacity
                testID={`option-${index}`}
                style={[optionStyle, isSelected && !showResult && styles.optionSelected]}
                onPress={() => selectAnswer(index)}
                disabled={showResult}
                activeOpacity={0.7}
              >
                <View style={styles.optionLetter}>
                  <Text style={styles.optionLetterText}>
                    {String.fromCharCode(65 + index)}
                  </Text>
                </View>
                <Text style={textStyle} numberOfLines={2}>{option}</Text>
              </TouchableOpacity>
            </Animated.View>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  loadingView: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#A3A3A3', fontSize: 16 },
  topBar: { paddingHorizontal: 20, paddingTop: 8 },
  progressRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  questionNumber: { color: '#525252', fontSize: 13, fontWeight: '700', marginRight: 10 },
  progressBar: { flex: 1, height: 4, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 2 },
  progressFill: { height: 4, backgroundColor: '#8A2BE2', borderRadius: 2 },
  scoreRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  scoreBox: { alignItems: 'center', flex: 1 },
  scoreLabel: { fontSize: 11, color: '#525252', fontWeight: '600', marginBottom: 4, textTransform: 'uppercase' },
  scoreValue: { fontSize: 28, fontWeight: '900', color: '#00FFFF' },
  timerContainer: { alignItems: 'center' },
  timerRing: {
    width: 60, height: 60, borderRadius: 30, borderWidth: 3,
    justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(138,43,226,0.1)',
  },
  timerText: { fontSize: 24, fontWeight: '900', color: '#FFF' },
  timerDanger: { color: '#FF3B30' },
  questionContainer: { paddingHorizontal: 20, marginBottom: 20, flex: 0 },
  questionCard: {
    backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 18, padding: 24,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  questionText: { fontSize: 18, fontWeight: '700', color: '#FFF', lineHeight: 26, textAlign: 'center' },
  optionsContainer: { flex: 1, paddingHorizontal: 20, gap: 10, justifyContent: 'flex-end', paddingBottom: 24 },
  option: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  optionSelected: { borderColor: '#8A2BE2', backgroundColor: 'rgba(138,43,226,0.15)' },
  optionCorrect: { backgroundColor: 'rgba(0,255,157,0.12)', borderColor: '#00FF9D' },
  optionWrong: { backgroundColor: 'rgba(255,59,48,0.12)', borderColor: '#FF3B30' },
  optionLetter: {
    width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center', alignItems: 'center', marginRight: 14,
  },
  optionLetterText: { color: '#A3A3A3', fontSize: 14, fontWeight: '800' },
  optionText: { color: '#FFF', fontSize: 15, fontWeight: '600', flex: 1 },
  optionTextCorrect: { color: '#00FF9D' },
  optionTextWrong: { color: '#FF3B30' },
});
