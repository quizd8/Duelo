import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Animated, Dimensions, ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';

const { width } = Dimensions.get('window');
const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

const CATEGORY_ICONS: Record<string, string> = {
  series_tv: '📺',
  geographie: '🌍',
  histoire: '🏛️',
};

const CATEGORY_COLORS: Record<string, string> = {
  series_tv: '#E040FB',
  geographie: '#00FFFF',
  histoire: '#FFD700',
};

type Category = {
  id: string;
  name: string;
  question_count: number;
};

export default function HomeScreen() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pseudo, setPseudo] = useState('');
  const fadeAnims = useRef([new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]).current;
  const playBtnAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const storedPseudo = await AsyncStorage.getItem('duelo_pseudo');
    if (storedPseudo) setPseudo(storedPseudo);

    try {
      const res = await fetch(`${API_URL}/api/categories`);
      const data = await res.json();
      setCategories(data);
      if (data.length > 0) setSelectedCategory(data[0].id);
    } catch {}
    setLoading(false);

    // Stagger animations
    fadeAnims.forEach((anim, i) => {
      Animated.timing(anim, {
        toValue: 1, duration: 400, delay: i * 150, useNativeDriver: true,
      }).start();
    });
  };

  const selectCategory = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedCategory(id);
    Animated.sequence([
      Animated.timing(playBtnAnim, { toValue: 1.08, duration: 150, useNativeDriver: true }),
      Animated.timing(playBtnAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
    ]).start();
  };

  const startGame = () => {
    if (!selectedCategory) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    router.push(`/matchmaking?category=${selectedCategory}`);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8A2BE2" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Salut,</Text>
            <Text style={styles.playerName}>{pseudo || 'Joueur'}</Text>
          </View>
          <View style={styles.streakBadge}>
            <Text style={styles.streakIcon}>🔥</Text>
            <Text style={styles.streakText}>Prêt</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>CHOISIS TA CATÉGORIE</Text>

        <View style={styles.categoriesContainer}>
          {categories.map((cat, index) => {
            const isSelected = selectedCategory === cat.id;
            const color = CATEGORY_COLORS[cat.id] || '#8A2BE2';
            return (
              <Animated.View
                key={cat.id}
                style={{ opacity: fadeAnims[index] || new Animated.Value(1) }}
              >
                <TouchableOpacity
                  testID={`category-${cat.id}`}
                  style={[
                    styles.categoryCard,
                    isSelected && { borderColor: color, shadowColor: color, shadowOpacity: 0.3, shadowRadius: 12 },
                  ]}
                  onPress={() => selectCategory(cat.id)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.categoryIconBox, { backgroundColor: color + '20' }]}>
                    <Text style={styles.categoryIcon}>{CATEGORY_ICONS[cat.id] || '❓'}</Text>
                  </View>
                  <View style={styles.categoryInfo}>
                    <Text style={styles.categoryName}>{cat.name}</Text>
                    <Text style={styles.categoryCount}>{cat.question_count} questions</Text>
                  </View>
                  {isSelected && (
                    <View style={[styles.selectedDot, { backgroundColor: color }]} />
                  )}
                </TouchableOpacity>
              </Animated.View>
            );
          })}
        </View>

        <Animated.View style={{ transform: [{ scale: playBtnAnim.interpolate({ inputRange: [0, 1, 1.08], outputRange: [1, 1, 1.08] }) }] }}>
          <TouchableOpacity
            testID="start-game-btn"
            style={[styles.playButton, !selectedCategory && styles.playButtonDisabled]}
            onPress={startGame}
            disabled={!selectedCategory}
            activeOpacity={0.8}
          >
            <Text style={styles.playButtonIcon}>⚡</Text>
            <Text style={styles.playButtonText}>LANCER UN DUEL</Text>
          </TouchableOpacity>
        </Animated.View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statIcon}>🎯</Text>
            <Text style={styles.statValue}>7</Text>
            <Text style={styles.statLabel}>Questions</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statIcon}>⏱️</Text>
            <Text style={styles.statValue}>10s</Text>
            <Text style={styles.statLabel}>Par question</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statIcon}>⭐</Text>
            <Text style={styles.statValue}>20</Text>
            <Text style={styles.statLabel}>Max pts</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  loadingContainer: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  scroll: { paddingHorizontal: 20, paddingBottom: 30 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 20 },
  greeting: { fontSize: 14, color: '#525252', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 2 },
  playerName: { fontSize: 28, fontWeight: '800', color: '#FFF', marginTop: 2 },
  streakBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  streakIcon: { fontSize: 16, marginRight: 6 },
  streakText: { color: '#A3A3A3', fontSize: 13, fontWeight: '600' },
  sectionTitle: { fontSize: 12, fontWeight: '800', color: '#525252', letterSpacing: 3, marginBottom: 16, marginTop: 8 },
  categoriesContainer: { gap: 12, marginBottom: 24 },
  categoryCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 16,
    padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  categoryIconBox: { width: 52, height: 52, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  categoryIcon: { fontSize: 26 },
  categoryInfo: { flex: 1 },
  categoryName: { fontSize: 17, fontWeight: '700', color: '#FFF' },
  categoryCount: { fontSize: 12, color: '#525252', marginTop: 2, fontWeight: '500' },
  selectedDot: { width: 10, height: 10, borderRadius: 5 },
  playButton: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#8A2BE2', borderRadius: 16, padding: 20,
    shadowColor: '#8A2BE2', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5, shadowRadius: 16, elevation: 10, marginBottom: 24,
  },
  playButtonDisabled: { opacity: 0.3 },
  playButtonIcon: { fontSize: 20, marginRight: 10 },
  playButtonText: { color: '#FFF', fontSize: 18, fontWeight: '900', letterSpacing: 3 },
  statsRow: { flexDirection: 'row', gap: 12 },
  statCard: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14,
    padding: 14, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  statIcon: { fontSize: 20, marginBottom: 6 },
  statValue: { fontSize: 22, fontWeight: '800', color: '#FFF' },
  statLabel: { fontSize: 10, color: '#525252', marginTop: 2, fontWeight: '600', textTransform: 'uppercase' },
});
