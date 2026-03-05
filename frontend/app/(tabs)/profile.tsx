import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

const CATEGORY_ICONS: Record<string, string> = {
  series_tv: '📺', geographie: '🌍', histoire: '🏛️',
};

type ProfileData = {
  user: {
    id: string; pseudo: string; avatar_seed: string; is_guest: boolean;
    total_xp: number; xp_series_tv: number; xp_geographie: number; xp_histoire: number;
    level: number; title: string; matches_played: number; matches_won: number;
    best_streak: number; current_streak: number; win_rate: number;
  };
  match_history: Array<{
    id: string; category: string; player_score: number; opponent_score: number;
    opponent: string; won: boolean; created_at: string;
  }>;
};

export default function ProfileScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    const userId = await AsyncStorage.getItem('duelo_user_id');
    if (!userId) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`${API_URL}/api/profile/${userId}`);
      const data = await res.json();
      setProfile(data);
    } catch {}
    setLoading(false);
  };

  const handleLogout = async () => {
    await AsyncStorage.multiRemove(['duelo_user_id', 'duelo_pseudo', 'duelo_avatar_seed']);
    router.replace('/');
  };

  if (loading) {
    return <View style={styles.loadingContainer}><ActivityIndicator size="large" color="#8A2BE2" /></View>;
  }

  if (!profile) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Connecte-toi pour voir ton profil</Text>
          <TouchableOpacity testID="go-login-btn" style={styles.loginBtn} onPress={() => router.replace('/')}>
            <Text style={styles.loginBtnText}>Se connecter</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const { user, match_history } = profile;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Profile Header */}
        <View style={styles.profileHeader}>
          <View style={styles.avatarLarge}>
            <Text style={styles.avatarLargeText}>{user.pseudo[0]?.toUpperCase()}</Text>
          </View>
          <Text style={styles.pseudoText}>{user.pseudo}</Text>
          <View style={styles.titleBadge}>
            <Text style={styles.titleText}>{user.title}</Text>
          </View>
          <Text style={styles.levelText}>Niveau {user.level}</Text>
        </View>

        {/* XP Bar */}
        <View style={styles.xpBarContainer}>
          <Text style={styles.xpTotal}>{user.total_xp.toLocaleString()} XP</Text>
          <View style={styles.xpBar}>
            <View style={[styles.xpFill, { width: `${Math.min((user.total_xp % 1000) / 10, 100)}%` }]} />
          </View>
        </View>

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{user.matches_played}</Text>
            <Text style={styles.statLabel}>Matchs</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statValue, { color: '#00FF9D' }]}>{user.matches_won}</Text>
            <Text style={styles.statLabel}>Victoires</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{user.win_rate}%</Text>
            <Text style={styles.statLabel}>Win Rate</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statValue, { color: '#FFD700' }]}>{user.best_streak}</Text>
            <Text style={styles.statLabel}>Best Streak</Text>
          </View>
        </View>

        {/* Category XP */}
        <Text style={styles.sectionTitle}>XP PAR CATÉGORIE</Text>
        <View style={styles.categoryXpContainer}>
          {[
            { key: 'series_tv', label: 'Séries TV', xp: user.xp_series_tv, color: '#E040FB' },
            { key: 'geographie', label: 'Géographie', xp: user.xp_geographie, color: '#00FFFF' },
            { key: 'histoire', label: 'Histoire', xp: user.xp_histoire, color: '#FFD700' },
          ].map((cat) => (
            <View key={cat.key} style={styles.catXpRow}>
              <Text style={styles.catXpIcon}>{CATEGORY_ICONS[cat.key]}</Text>
              <View style={styles.catXpInfo}>
                <Text style={styles.catXpLabel}>{cat.label}</Text>
                <View style={styles.catXpBar}>
                  <View style={[styles.catXpFill, { width: `${Math.min(cat.xp / 100, 100)}%`, backgroundColor: cat.color }]} />
                </View>
              </View>
              <Text style={[styles.catXpValue, { color: cat.color }]}>{cat.xp}</Text>
            </View>
          ))}
        </View>

        {/* Match History */}
        <Text style={styles.sectionTitle}>HISTORIQUE</Text>
        {match_history.length === 0 ? (
          <Text style={styles.noHistory}>Aucun match pour le moment</Text>
        ) : (
          match_history.map((m) => (
            <View key={m.id} style={[styles.matchCard, m.won && styles.matchCardWon]}>
              <View style={styles.matchLeft}>
                <Text style={styles.matchCategory}>{CATEGORY_ICONS[m.category] || '❓'}</Text>
                <View>
                  <Text style={styles.matchOpponent}>vs {m.opponent}</Text>
                  <Text style={styles.matchDate}>{new Date(m.created_at).toLocaleDateString('fr-FR')}</Text>
                </View>
              </View>
              <View style={styles.matchRight}>
                <Text style={[styles.matchScore, m.won ? styles.scoreWin : styles.scoreLoss]}>
                  {m.player_score} - {m.opponent_score}
                </Text>
                <Text style={[styles.matchResult, m.won ? styles.resultWin : styles.resultLoss]}>
                  {m.won ? 'VICTOIRE' : 'DÉFAITE'}
                </Text>
              </View>
            </View>
          ))
        )}

        {/* Logout */}
        <TouchableOpacity testID="logout-btn" style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.7}>
          <Text style={styles.logoutText}>Se déconnecter</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  loadingContainer: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: '#A3A3A3', fontSize: 16, marginBottom: 16 },
  loginBtn: { backgroundColor: '#8A2BE2', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  loginBtnText: { color: '#FFF', fontWeight: '700', fontSize: 16 },
  scroll: { paddingHorizontal: 20, paddingBottom: 40 },
  profileHeader: { alignItems: 'center', paddingVertical: 24 },
  avatarLarge: {
    width: 80, height: 80, borderRadius: 24, backgroundColor: '#8A2BE2',
    justifyContent: 'center', alignItems: 'center', marginBottom: 12,
    shadowColor: '#8A2BE2', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 12,
  },
  avatarLargeText: { color: '#FFF', fontSize: 36, fontWeight: '900' },
  pseudoText: { fontSize: 24, fontWeight: '800', color: '#FFF' },
  titleBadge: {
    marginTop: 8, backgroundColor: 'rgba(138,43,226,0.2)', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 4, borderWidth: 1, borderColor: 'rgba(138,43,226,0.3)',
  },
  titleText: { color: '#8A2BE2', fontSize: 13, fontWeight: '700' },
  levelText: { color: '#525252', fontSize: 13, marginTop: 6, fontWeight: '600' },
  xpBarContainer: { marginVertical: 16 },
  xpTotal: { color: '#00FFFF', fontSize: 14, fontWeight: '700', marginBottom: 8 },
  xpBar: { height: 6, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 3 },
  xpFill: { height: 6, backgroundColor: '#8A2BE2', borderRadius: 3 },
  statsGrid: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  statBox: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14,
    padding: 14, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  statValue: { fontSize: 22, fontWeight: '800', color: '#FFF' },
  statLabel: { fontSize: 10, color: '#525252', marginTop: 4, fontWeight: '600', textTransform: 'uppercase' },
  sectionTitle: { fontSize: 12, fontWeight: '800', color: '#525252', letterSpacing: 3, marginBottom: 12, marginTop: 8 },
  categoryXpContainer: { gap: 12, marginBottom: 24 },
  catXpRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  catXpIcon: { fontSize: 24, marginRight: 12 },
  catXpInfo: { flex: 1 },
  catXpLabel: { color: '#FFF', fontSize: 14, fontWeight: '600', marginBottom: 6 },
  catXpBar: { height: 4, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 2 },
  catXpFill: { height: 4, borderRadius: 2 },
  catXpValue: { fontSize: 16, fontWeight: '800', marginLeft: 12 },
  noHistory: { color: '#525252', fontSize: 14, textAlign: 'center', paddingVertical: 20 },
  matchCard: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 14,
    marginBottom: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  matchCardWon: { borderColor: 'rgba(0,255,157,0.15)', backgroundColor: 'rgba(0,255,157,0.04)' },
  matchLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  matchCategory: { fontSize: 20 },
  matchOpponent: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  matchDate: { color: '#525252', fontSize: 11, marginTop: 2 },
  matchRight: { alignItems: 'flex-end' },
  matchScore: { fontSize: 16, fontWeight: '800' },
  scoreWin: { color: '#00FF9D' },
  scoreLoss: { color: '#FF3B30' },
  matchResult: { fontSize: 10, fontWeight: '700', marginTop: 2, letterSpacing: 1 },
  resultWin: { color: '#00FF9D' },
  resultLoss: { color: '#FF3B30' },
  logoutBtn: {
    marginTop: 24, borderWidth: 1, borderColor: 'rgba(255,59,48,0.3)',
    borderRadius: 12, padding: 14, alignItems: 'center',
  },
  logoutText: { color: '#FF3B30', fontSize: 14, fontWeight: '600' },
});
