import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Animated,
  KeyboardAvoidingView, Platform, Keyboard, ActivityIndicator, Dimensions,
  Image, ImageBackground,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { GLASS } from '../theme/glassTheme';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
const DUELO_LOGO = require('../assets/header/duelo_logo.webp');
const BG_IMAGE = require('../assets/images/fond_duelo.webp');

// Floating orb component
function FloatingOrb({ size, color, startX, startY, duration, delay }: {
  size: number; color: string; startX: number; startY: number; duration: number; delay: number;
}) {
  const floatY = useRef(new Animated.Value(0)).current;
  const floatX = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 1200, delay, useNativeDriver: true }).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatY, { toValue: -20, duration, useNativeDriver: true }),
        Animated.timing(floatY, { toValue: 10, duration: duration * 0.8, useNativeDriver: true }),
      ])
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatX, { toValue: 8, duration: duration * 1.2, useNativeDriver: true }),
        Animated.timing(floatX, { toValue: -8, duration: duration * 1.2, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: startX,
        top: startY,
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        opacity,
        transform: [{ translateY: floatY }, { translateX: floatX }],
        shadowColor: color,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: size,
      }}
    />
  );
}

export default function WelcomeScreen() {
  const router = useRouter();
  const [pseudo, setPseudo] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState('');
  const [initialLoading, setInitialLoading] = useState(true);

  const scrollY = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(60)).current;
  const logoFloat = useRef(new Animated.Value(0)).current;
  const checkTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    checkExistingUser();

    // Entrance animations
    Animated.stagger(200, [
      Animated.timing(fadeAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 800, useNativeDriver: true }),
    ]).start();

    // Continuous logo floating
    Animated.loop(
      Animated.sequence([
        Animated.timing(logoFloat, { toValue: -8, duration: 2200, useNativeDriver: true }),
        Animated.timing(logoFloat, { toValue: 8, duration: 2200, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  const checkExistingUser = async () => {
    try {
      const userId = await AsyncStorage.getItem('duelo_user_id');
      if (userId) {
        router.replace('/(tabs)/play');
        return;
      }
    } catch {}
    setInitialLoading(false);
  };

  useEffect(() => {
    if (pseudo.length >= 3) {
      if (checkTimeout.current) clearTimeout(checkTimeout.current);
      checkTimeout.current = setTimeout(() => checkPseudo(pseudo), 500);
    } else {
      setAvailable(null);
    }
    return () => { if (checkTimeout.current) clearTimeout(checkTimeout.current); };
  }, [pseudo]);

  const checkPseudo = async (name: string) => {
    setChecking(true);
    try {
      const url = `${API_URL}/api/auth/check-pseudo`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pseudo: name }),
      });
      const data = await res.json();
      setAvailable(data.available);
      setError('');
    } catch (e: any) {
      console.log('Check pseudo error:', e?.message, 'URL:', API_URL);
      setAvailable(null);
      setError('Connexion au serveur impossible');
    }
    setChecking(false);
  };

  const handleGuestLogin = async () => {
    if (pseudo.length < 3) {
      setError('Minimum 3 caractères');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/api/auth/register-guest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pseudo: pseudo.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || 'Erreur serveur');
        setLoading(false);
        return;
      }
      await AsyncStorage.setItem('duelo_user_id', data.id);
      await AsyncStorage.setItem('duelo_pseudo', data.pseudo);
      await AsyncStorage.setItem('duelo_avatar_seed', data.avatar_seed);
      router.replace('/(tabs)/play');
    } catch (e: any) {
      console.log('Register error:', e?.message);
      setError('Erreur réseau. Vérifiez votre connexion.');
    }
    setLoading(false);
  };

  if (initialLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8A2BE2" />
      </View>
    );
  }

  // Parallax interpolations
  const bgTranslateY = scrollY.interpolate({
    inputRange: [-100, 0, 300],
    outputRange: [30, 0, -90],
    extrapolate: 'clamp',
  });

  const logoScale = scrollY.interpolate({
    inputRange: [-100, 0, 200],
    outputRange: [1.15, 1, 0.85],
    extrapolate: 'clamp',
  });

  const logoOpacity = scrollY.interpolate({
    inputRange: [0, 180],
    outputRange: [1, 0.3],
    extrapolate: 'clamp',
  });

  const taglineTranslateY = scrollY.interpolate({
    inputRange: [-100, 0, 200],
    outputRange: [15, 0, -40],
    extrapolate: 'clamp',
  });

  const orbLayerTranslate = scrollY.interpolate({
    inputRange: [-100, 0, 300],
    outputRange: [20, 0, -60],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.root}>
      {/* Parallax background layer */}
      <Animated.View style={[styles.bgLayer, { transform: [{ translateY: bgTranslateY }] }]}>
        <Image source={BG_IMAGE} style={styles.bgImage} resizeMode="cover" />
        <View style={styles.bgOverlay} />
      </Animated.View>

      {/* Floating orbs layer (mid-depth parallax) */}
      <Animated.View style={[styles.orbLayer, { transform: [{ translateY: orbLayerTranslate }] }]}>
        <FloatingOrb size={6} color="rgba(0,255,255,0.6)" startX={SCREEN_W * 0.15} startY={SCREEN_H * 0.12} duration={3000} delay={0} />
        <FloatingOrb size={4} color="rgba(138,43,226,0.7)" startX={SCREEN_W * 0.8} startY={SCREEN_H * 0.08} duration={2600} delay={400} />
        <FloatingOrb size={8} color="rgba(0,255,255,0.4)" startX={SCREEN_W * 0.65} startY={SCREEN_H * 0.25} duration={3500} delay={800} />
        <FloatingOrb size={5} color="rgba(255,255,255,0.3)" startX={SCREEN_W * 0.3} startY={SCREEN_H * 0.35} duration={2800} delay={200} />
        <FloatingOrb size={3} color="rgba(138,43,226,0.5)" startX={SCREEN_W * 0.9} startY={SCREEN_H * 0.55} duration={3200} delay={600} />
        <FloatingOrb size={6} color="rgba(0,255,255,0.3)" startX={SCREEN_W * 0.05} startY={SCREEN_H * 0.7} duration={2900} delay={1000} />
        <FloatingOrb size={4} color="rgba(255,255,255,0.2)" startX={SCREEN_W * 0.5} startY={SCREEN_H * 0.85} duration={3400} delay={300} />
      </Animated.View>

      {/* Foreground scrollable content */}
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <Animated.ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            onScroll={Animated.event(
              [{ nativeEvent: { contentOffset: { y: scrollY } } }],
              { useNativeDriver: true }
            )}
            scrollEventThrottle={16}
          >
            <TouchableOpacity activeOpacity={1} onPress={Keyboard.dismiss} style={styles.inner}>
              {/* Logo with parallax + float */}
              <Animated.View style={[
                styles.header,
                {
                  opacity: fadeAnim,
                  transform: [
                    { scale: logoScale },
                    { translateY: logoFloat },
                  ],
                },
              ]}>
                <Image source={DUELO_LOGO} style={styles.logoImage} resizeMode="contain" />
              </Animated.View>

              {/* Tagline pill with parallax */}
              <Animated.View style={[
                styles.taglinePill,
                {
                  opacity: fadeAnim,
                  transform: [{ translateY: taglineTranslateY }],
                },
              ]}>
                <Text style={styles.taglineText}>
                  Joues à plus de 500 thèmes !{'\n'}Deviens le top 1 autour de chez toi !
                </Text>
              </Animated.View>

              {/* Form */}
              <Animated.View style={[styles.formContainer, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
                <View style={styles.glassCard}>
                  <Text style={styles.formTitle}>Choisis ton pseudo</Text>
                  <Text style={styles.formHint}>Unique et visible par tous les joueurs</Text>

                  <View style={styles.inputWrapper}>
                    <TextInput
                      testID="pseudo-input"
                      style={[
                        styles.input,
                        available === true && styles.inputValid,
                        available === false && styles.inputError,
                      ]}
                      placeholder="Ex: QuizMaster_42"
                      placeholderTextColor="#525252"
                      value={pseudo}
                      onChangeText={setPseudo}
                      autoCapitalize="none"
                      maxLength={20}
                      autoCorrect={false}
                    />
                    {checking && (
                      <ActivityIndicator style={styles.inputIcon} size="small" color="#8A2BE2" />
                    )}
                    {!checking && available === true && (
                      <Text style={[styles.inputIcon, styles.checkMark]}>✓</Text>
                    )}
                    {!checking && available === false && (
                      <Text style={[styles.inputIcon, styles.crossMark]}>✗</Text>
                    )}
                  </View>

                  {available === false && <Text style={styles.errorText}>Ce pseudo est déjà pris</Text>}
                  {error ? <Text style={styles.errorText}>{error}</Text> : null}

                  <TouchableOpacity
                    testID="play-guest-btn"
                    style={[styles.playButton, (!available || loading) && styles.playButtonDisabled]}
                    onPress={handleGuestLogin}
                    disabled={!available || loading}
                    activeOpacity={0.8}
                  >
                    {loading ? (
                      <ActivityIndicator color="#FFF" />
                    ) : (
                      <Text style={styles.playButtonText}>JOUER EN INVITÉ</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </Animated.View>

              {/* Bottom spacer for scroll room */}
              <View style={{ height: 80 }} />
            </TouchableOpacity>
          </Animated.ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#050510',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#050510',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Parallax background
  bgLayer: {
    ...StyleSheet.absoluteFillObject,
    top: -40,
    bottom: -40,
  },
  bgImage: {
    width: '100%' as any,
    height: '100%' as any,
  },
  bgOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 10, 0.15)',
  },

  // Floating orbs
  orbLayer: {
    ...StyleSheet.absoluteFillObject,
    pointerEvents: 'none',
  },

  // Content
  container: { flex: 1, backgroundColor: 'transparent' },
  keyboardView: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  inner: {
    paddingHorizontal: 24,
  },

  // Logo
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  logoImage: {
    width: 220,
    height: 56,
  },

  // Tagline
  taglinePill: {
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,255,255,0.35)',
    marginBottom: 32,
    ...Platform.select({
      web: { backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' } as any,
      default: {},
    }),
  },
  taglineText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 20,
    letterSpacing: 0.3,
    textShadowColor: 'rgba(255,255,255,0.4)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },

  // Form
  formContainer: { marginBottom: 32 },
  glassCard: {
    backgroundColor: GLASS.bg,
    borderRadius: GLASS.radius,
    padding: 24,
    borderWidth: 1,
    borderColor: GLASS.borderCyan,
    ...Platform.select({
      web: { backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' } as any,
      default: {},
    }),
  },
  formTitle: { fontSize: 20, fontWeight: '700', color: '#FFF', marginBottom: 4 },
  formHint: { fontSize: 13, color: 'rgba(255,255,255,0.45)', marginBottom: 20 },
  inputWrapper: { position: 'relative', marginBottom: 8 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: GLASS.radiusSm,
    padding: 16,
    fontSize: 18,
    color: '#FFF',
    borderWidth: 1,
    borderColor: GLASS.borderSubtle,
  },
  inputValid: { borderColor: '#00FF9D' },
  inputError: { borderColor: '#FF3B30' },
  inputIcon: { position: 'absolute', right: 16, top: 16 },
  checkMark: { color: '#00FF9D', fontSize: 20, fontWeight: '700' },
  crossMark: { color: '#FF3B30', fontSize: 20, fontWeight: '700' },
  errorText: { color: '#FF3B30', fontSize: 12, marginBottom: 8, marginLeft: 4 },
  playButton: {
    backgroundColor: '#8A2BE2',
    borderRadius: GLASS.radiusSm,
    padding: 18,
    alignItems: 'center',
    marginTop: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,255,255,0.3)',
    shadowColor: '#00FFFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  playButtonDisabled: { opacity: 0.4 },
  playButtonText: { color: '#FFF', fontSize: 16, fontWeight: '800', letterSpacing: 2 },
});
