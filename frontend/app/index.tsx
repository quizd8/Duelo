import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Animated,
  KeyboardAvoidingView, Platform, Keyboard, ActivityIndicator, Dimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';

const { width } = Dimensions.get('window');
const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function WelcomeScreen() {
  const router = useRouter();
  const [pseudo, setPseudo] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState('');
  const [initialLoading, setInitialLoading] = useState(true);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const checkTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    checkExistingUser();
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]).start();

    // Pulse animation for logo
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.05, duration: 1500, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  const checkExistingUser = async () => {
    try {
      const userId = await AsyncStorage.getItem('duelo_user_id');
      if (userId) {
        router.replace('/(tabs)/home');
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
      const res = await fetch(`${API_URL}/api/auth/check-pseudo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pseudo: name }),
      });
      const data = await res.json();
      setAvailable(data.available);
    } catch { setAvailable(null); }
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
        setError(data.detail || 'Erreur');
        setLoading(false);
        return;
      }
      await AsyncStorage.setItem('duelo_user_id', data.id);
      await AsyncStorage.setItem('duelo_pseudo', data.pseudo);
      await AsyncStorage.setItem('duelo_avatar_seed', data.avatar_seed);
      router.replace('/(tabs)/home');
    } catch {
      setError('Erreur de connexion');
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

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <TouchableOpacity activeOpacity={1} onPress={Keyboard.dismiss} style={styles.inner}>
          <Animated.View style={[styles.header, { opacity: fadeAnim, transform: [{ scale: pulseAnim }] }]}>
            <View style={styles.logoContainer}>
              <Text style={styles.logoIcon}>⚡</Text>
              <View style={styles.logoBadge}>
                <Text style={styles.logoBadgeText}>VS</Text>
              </View>
            </View>
            <Text style={styles.title}>DUELO</Text>
            <Text style={styles.subtitle}>Quiz Compétitif en Temps Réel</Text>
          </Animated.View>

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

              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>ou</Text>
                <View style={styles.dividerLine} />
              </View>

              <TouchableOpacity
                testID="admin-btn"
                style={styles.adminButton}
                onPress={() => router.push('/admin-dashboard')}
                activeOpacity={0.7}
              >
                <Text style={styles.adminButtonText}>Admin Dashboard</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>

          <Animated.View style={[styles.footer, { opacity: fadeAnim }]}>
            <Text style={styles.footerText}>30 questions • 3 catégories • ∞ fun</Text>
          </Animated.View>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  loadingContainer: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  keyboardView: { flex: 1 },
  inner: { flex: 1, paddingHorizontal: 24, justifyContent: 'center' },
  header: { alignItems: 'center', marginBottom: 40 },
  logoContainer: { width: 80, height: 80, borderRadius: 20, backgroundColor: '#8A2BE2', justifyContent: 'center', alignItems: 'center', marginBottom: 16, shadowColor: '#8A2BE2', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 20, elevation: 10 },
  logoIcon: { fontSize: 36 },
  logoBadge: { position: 'absolute', bottom: -6, right: -6, backgroundColor: '#00FFFF', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
  logoBadgeText: { color: '#000', fontSize: 10, fontWeight: '900' },
  title: { fontSize: 48, fontWeight: '900', color: '#FFF', letterSpacing: 8 },
  subtitle: { fontSize: 14, color: '#A3A3A3', marginTop: 4, letterSpacing: 2, textTransform: 'uppercase' },
  formContainer: { marginBottom: 32 },
  glassCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  formTitle: { fontSize: 20, fontWeight: '700', color: '#FFF', marginBottom: 4 },
  formHint: { fontSize: 13, color: '#525252', marginBottom: 20 },
  inputWrapper: { position: 'relative', marginBottom: 8 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14,
    padding: 16,
    fontSize: 18,
    color: '#FFF',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  inputValid: { borderColor: '#00FF9D' },
  inputError: { borderColor: '#FF3B30' },
  inputIcon: { position: 'absolute', right: 16, top: 16 },
  checkMark: { color: '#00FF9D', fontSize: 20, fontWeight: '700' },
  crossMark: { color: '#FF3B30', fontSize: 20, fontWeight: '700' },
  errorText: { color: '#FF3B30', fontSize: 12, marginBottom: 8, marginLeft: 4 },
  playButton: {
    backgroundColor: '#8A2BE2',
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
    marginTop: 12,
    shadowColor: '#8A2BE2',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
  playButtonDisabled: { opacity: 0.4 },
  playButtonText: { color: '#FFF', fontSize: 16, fontWeight: '800', letterSpacing: 2 },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 20 },
  dividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.1)' },
  dividerText: { color: '#525252', marginHorizontal: 12, fontSize: 12 },
  adminButton: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', borderRadius: 14, padding: 14, alignItems: 'center' },
  adminButtonText: { color: '#A3A3A3', fontSize: 14, fontWeight: '600' },
  footer: { alignItems: 'center', paddingBottom: 20 },
  footerText: { color: '#525252', fontSize: 12, letterSpacing: 1 },
});
