import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import DueloHeader from '../../components/DueloHeader';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const GRID_PAD = 16;

const CATEGORY_ICONS: Record<string, string> = {
  series_tv: '📺',
  geographie: '🌍',
  histoire: '🏛️',
  cinema: '🎬',
  sport: '⚽',
  musique: '🎵',
  sciences: '🔬',
  gastronomie: '🍽️',
};

const CATEGORY_COLORS: Record<string, string> = {
  series_tv: '#E040FB',
  geographie: '#00FFFF',
  histoire: '#FFD700',
  cinema: '#FF6B6B',
  sport: '#00FF9D',
  musique: '#FF8C00',
  sciences: '#7B68EE',
  gastronomie: '#FF69B4',
};

type Category = {
  id: string;
  name: string;
  question_count: number;
};

export default function HomeScreen() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [pseudo, setPseudo] = useState('');

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
    } catch {}
    setLoading(false);
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
      {/* Header */}
      <DueloHeader />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.greeting}>Salut, {pseudo || 'Joueur'} 👋</Text>
        <Text style={styles.sectionTitle}>CHOISIS TA CATÉGORIE</Text>

        <View style={styles.categoriesGrid}>
          {categories.map((cat) => {
            const color = CATEGORY_COLORS[cat.id] || '#8A2BE2';
            return (
              <TouchableOpacity
                key={cat.id}
                testID={`category-${cat.id}`}
                style={styles.categoryCard}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push(`/category-detail?id=${cat.id}`);
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.categoryCardInner, { borderColor: color + '30' }]}>
                  <View style={[styles.categoryIconBox, { backgroundColor: color + '20' }]}>
                    <Text style={styles.categoryIcon}>{CATEGORY_ICONS[cat.id] || '❓'}</Text>
                  </View>
                  <Text style={[styles.categoryName, { color }]} numberOfLines={1}>{cat.name}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  loadingContainer: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  scroll: { paddingHorizontal: GRID_PAD, paddingBottom: 30 },

  greeting: { fontSize: 22, fontWeight: '800', color: '#FFF', marginTop: 20, marginBottom: 24 },

  sectionTitle: {
    fontSize: 12, fontWeight: '800', color: '#525252', letterSpacing: 3,
    marginBottom: 16,
  },

  // Grid
  categoriesGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
  },
  categoryCard: {
    width: '25%', padding: 5,
    alignItems: 'center',
  },
  categoryCardInner: {
    width: '100%', borderRadius: 16, padding: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
  },
  categoryIconBox: {
    width: 48, height: 48, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center', marginBottom: 8,
  },
  categoryIcon: { fontSize: 26 },
  categoryName: { fontSize: 11, fontWeight: '800', textAlign: 'center', marginBottom: 4 },
  categoryCount: { fontSize: 10, color: '#525252', fontWeight: '600' },
});
