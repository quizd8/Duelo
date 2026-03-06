import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator,
  Modal
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import DueloHeader from '../../components/DueloHeader';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

const GRID_PAD = 16;

const CATEGORY_META: Record<string, { icon: string; name: string; color: string; bg: string }> = {
  series_tv: { icon: '📺', name: 'Séries TV', color: '#E040FB', bg: '#2D1B4E' },
  geographie: { icon: '🌍', name: 'Géographie', color: '#00FFFF', bg: '#0D2B2B' },
  histoire: { icon: '🏛️', name: 'Histoire', color: '#FFD700', bg: '#2B2510' },
  cinema: { icon: '🎬', name: 'Cinéma', color: '#FF6B6B', bg: '#2B1515' },
  sport: { icon: '⚽', name: 'Sport', color: '#00FF9D', bg: '#0D2B1A' },
  musique: { icon: '🎵', name: 'Musique', color: '#FF8C00', bg: '#2B1E0D' },
  sciences: { icon: '🔬', name: 'Sciences', color: '#7B68EE', bg: '#1A1533' },
  gastronomie: { icon: '🍽️', name: 'Gastronomie', color: '#FF69B4', bg: '#2B152B' },
};

type CategoryData = {
  xp: number; level: number; title: string;
  xp_progress: { current: number; needed: number; progress: number };
  unlocked_titles: { level: number; title: string }[];
};

type ProfileData = {
  user: {
    id: string; pseudo: string; avatar_seed: string; is_guest: boolean;
    total_xp: number; selected_title: string | null;
    country: string | null; country_flag: string;
    categories: Record<string, CategoryData>;
    matches_played: number; matches_won: number;
    best_streak: number; current_streak: number; streak_badge: string;
    win_rate: number; mmr: number;
    followers_count: number; following_count: number;
  };
  all_unlocked_titles: { level: number; title: string; category: string }[];
  match_history: Array<{
    id: string; category: string; player_score: number; opponent_score: number;
    opponent: string; won: boolean; xp_earned: number;
    xp_breakdown: any; correct_count: number; created_at: string;
  }>;
};

export default function ProfileScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showTitleModal, setShowTitleModal] = useState(false);
  const [savingTitle, setSavingTitle] = useState(false);

  useEffect(() => { loadProfile(); }, []);

  const loadProfile = async () => {
    const userId = await AsyncStorage.getItem('duelo_user_id');
    if (!userId) { setLoading(false); return; }
    try {
      const res = await fetch(`${API_URL}/api/profile/${userId}`);
      const data = await res.json();
      setProfile(data);
    } catch {}
    setLoading(false);
  };

  const handleSelectTitle = async (title: string) => {
    if (!profile) return;
    setSavingTitle(true);
    try {
      const res = await fetch(`${API_URL}/api/user/select-title`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: profile.user.id, title }),
      });
      if (res.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setProfile(prev => prev ? { ...prev, user: { ...prev.user, selected_title: title } } : null);
      }
    } catch {}
    setSavingTitle(false);
    setShowTitleModal(false);
  };

  const handleLogout = async () => {
    await AsyncStorage.multiRemove(['duelo_user_id', 'duelo_pseudo', 'duelo_avatar_seed']);
    router.replace('/');
  };

  if (loading) {
    return <View style={s.loadingContainer}><ActivityIndicator size="large" color="#8A2BE2" /></View>;
  }
  if (!profile) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.emptyContainer}>
          <Text style={s.emptyText}>Connecte-toi pour voir ton profil</Text>
          <TouchableOpacity style={s.loginBtn} onPress={() => router.replace('/')}>
            <Text style={s.loginBtnText}>Se connecter</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const { user, all_unlocked_titles, match_history } = profile;
  const displayTitle = user.selected_title || all_unlocked_titles[0]?.title || '';

  // Sort categories by level descending
  const sortedCategories = Object.entries(user.categories)
    .sort((a, b) => b[1].level - a[1].level || b[1].xp - a[1].xp);

  return (
    <SafeAreaView style={s.container}>
      <DueloHeader />
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Profile Header: Avatar left + info right ── */}
        <View style={s.profileHeader}>
          <View style={s.avatarContainer}>
            <View style={s.avatar}>
              <Text style={s.avatarText}>{user.pseudo[0]?.toUpperCase()}</Text>
            </View>
          </View>
          <View style={s.profileInfo}>
            <Text style={s.pseudo}>{user.pseudo}</Text>
            {displayTitle ? (
              <TouchableOpacity style={s.titleBadge} onPress={() => setShowTitleModal(true)}>
                <Text style={s.titleText}>{displayTitle}</Text>
                <Text style={s.titleEditIcon}> ✎</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={s.titleBadge} onPress={() => setShowTitleModal(true)}>
                <Text style={s.titleTextEmpty}>Aucun titre</Text>
                <Text style={s.titleEditIcon}> ✎</Text>
              </TouchableOpacity>
            )}
            {user.country ? (
              <View style={s.locationRow}>
                <Text style={s.locationFlag}>{user.country_flag}</Text>
                <Text style={s.locationText}>{user.country}</Text>
              </View>
            ) : (
              <View style={s.locationRow}>
                <Text style={s.locationFlag}>🌍</Text>
                <Text style={s.locationText}>Monde</Text>
              </View>
            )}
          </View>
        </View>

        {/* ── Stats Row ── */}
        <View style={s.statsRow}>
          <View style={s.statItem}>
            <Text style={s.statValue}>{user.matches_played}</Text>
            <Text style={s.statLabel}>PARTIES</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.statItem}>
            <Text style={s.statValue}>{user.followers_count}</Text>
            <Text style={s.statLabel}>ABONNÉS</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.statItem}>
            <Text style={s.statValue}>{user.following_count}</Text>
            <Text style={s.statLabel}>ABONNEMENTS</Text>
          </View>
        </View>

        {/* ── Mes Thèmes Grid (4 per row) ── */}
        <Text style={s.sectionTitle}>MES THÈMES</Text>
        <View style={s.topicsGrid}>
          {sortedCategories.map(([catKey, catData]) => {
            const meta = CATEGORY_META[catKey] || { icon: '?', name: catKey, color: '#8A2BE2', bg: '#1A1A2E' };
            const isUnplayed = catData.level === 0;
            return (
              <TouchableOpacity
                key={catKey}
                style={s.topicCard}
                onPress={() => router.push(`/category-detail?id=${catKey}`)}
                activeOpacity={0.8}
              >
                <View style={[s.topicCardInner, { backgroundColor: isUnplayed ? '#111' : meta.bg }]}>
                  <View style={[s.topicIconBox, { backgroundColor: meta.color + (isUnplayed ? '15' : '25') }]}>
                    <Text style={[s.topicIcon, isUnplayed && { opacity: 0.4 }]}>{meta.icon}</Text>
                  </View>
                  <Text style={[s.topicName, { color: isUnplayed ? '#525252' : meta.color }]}>{meta.name}</Text>
                  <Text style={[s.topicLevel, isUnplayed && { color: '#333' }]}>
                    {isUnplayed ? 'Niv. 0' : `Niv. ${catData.level}`}
                  </Text>
                  {/* XP progress mini bar */}
                  {!isUnplayed && (
                    <View style={s.topicBarBg}>
                      <View style={[s.topicBarFill, { width: `${catData.xp_progress.progress * 100}%`, backgroundColor: meta.color }]} />
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Quick Stats ── */}
        <Text style={s.sectionTitle}>STATISTIQUES</Text>
        <View style={s.quickStats}>
          <View style={s.qStatBox}>
            <Text style={[s.qStatVal, { color: '#00FF9D' }]}>{user.matches_won}</Text>
            <Text style={s.qStatLbl}>Victoires</Text>
          </View>
          <View style={s.qStatBox}>
            <Text style={s.qStatVal}>{user.win_rate}%</Text>
            <Text style={s.qStatLbl}>Win Rate</Text>
          </View>
          <View style={s.qStatBox}>
            <Text style={[s.qStatVal, { color: '#FFD700' }]}>{user.best_streak}</Text>
            <Text style={s.qStatLbl}>Best Streak</Text>
          </View>
          <View style={s.qStatBox}>
            <Text style={[s.qStatVal, { color: '#00FFFF' }]}>{user.total_xp.toLocaleString()}</Text>
            <Text style={s.qStatLbl}>XP Total</Text>
          </View>
        </View>

        {/* ── Titles ── */}
        {all_unlocked_titles.length > 0 && (
          <>
            <Text style={s.sectionTitle}>MES TITRES</Text>
            <View style={s.titlesWrap}>
              {all_unlocked_titles.map((t, i) => {
                const meta = CATEGORY_META[t.category] || { icon: '?', name: '', color: '#8A2BE2', bg: '#1A1A2E' };
                const isSelected = user.selected_title === t.title;
                return (
                  <TouchableOpacity
                    key={`${t.category}-${t.level}`}
                    style={[s.titleChip, isSelected && { borderColor: meta.color, backgroundColor: meta.color + '15' }]}
                    onPress={() => handleSelectTitle(t.title)}
                  >
                    <Text style={s.titleChipIcon}>{meta.icon}</Text>
                    <Text style={[s.titleChipText, isSelected && { color: meta.color }]}>{t.title}</Text>
                    {isSelected && <Text style={[s.titleChipCheck, { color: meta.color }]}>✓</Text>}
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        {/* ── Match History ── */}
        <Text style={s.sectionTitle}>HISTORIQUE</Text>
        {match_history.length === 0 ? (
          <Text style={s.noHistory}>Aucun match pour le moment</Text>
        ) : (
          match_history.map((m) => (
            <View key={m.id} style={[s.matchCard, m.won && s.matchCardWon]}>
              <View style={s.matchLeft}>
                <Text style={s.matchCatIcon}>{CATEGORY_META[m.category]?.icon || '?'}</Text>
                <View>
                  <Text style={s.matchOpp}>vs {m.opponent}</Text>
                  <Text style={s.matchDate}>{new Date(m.created_at).toLocaleDateString('fr-FR')}</Text>
                </View>
              </View>
              <View style={s.matchRight}>
                <Text style={[s.matchScore, m.won ? s.scoreWin : s.scoreLoss]}>
                  {m.player_score} - {m.opponent_score}
                </Text>
                <View style={s.matchXpRow}>
                  <Text style={[s.matchResult, m.won ? s.resultWin : s.resultLoss]}>
                    {m.won ? 'VICTOIRE' : 'DÉFAITE'}
                  </Text>
                  {m.xp_earned > 0 && <Text style={s.matchXp}>+{m.xp_earned} XP</Text>}
                </View>
              </View>
            </View>
          ))
        )}

        {/* ── Paramètres ── */}
        <Text style={s.sectionTitle}>PARAMÈTRES</Text>
        <View style={s.settingsWrap}>
          <TouchableOpacity style={s.settingsRow} onPress={() => setShowTitleModal(true)}>
            <Text style={s.settingsIcon}>🏷️</Text>
            <Text style={s.settingsText}>Changer de titre</Text>
            <Text style={s.settingsArrow}>›</Text>
          </TouchableOpacity>
          <View style={s.settingsDivider} />
          <TouchableOpacity style={s.settingsRow}>
            <Text style={s.settingsIcon}>🔔</Text>
            <Text style={s.settingsText}>Notifications</Text>
            <Text style={s.settingsArrow}>›</Text>
          </TouchableOpacity>
          <View style={s.settingsDivider} />
          <TouchableOpacity style={s.settingsRow}>
            <Text style={s.settingsIcon}>🌐</Text>
            <Text style={s.settingsText}>Langue</Text>
            <Text style={s.settingsArrow}>›</Text>
          </TouchableOpacity>
          <View style={s.settingsDivider} />
          <TouchableOpacity style={s.settingsRow}>
            <Text style={s.settingsIcon}>📜</Text>
            <Text style={s.settingsText}>Conditions d'utilisation</Text>
            <Text style={s.settingsArrow}>›</Text>
          </TouchableOpacity>
          <View style={s.settingsDivider} />
          <TouchableOpacity style={[s.settingsRow]} onPress={handleLogout} activeOpacity={0.7}>
            <Text style={s.settingsIcon}>🚪</Text>
            <Text style={[s.settingsText, { color: '#FF3B30' }]}>Se déconnecter</Text>
            <Text style={[s.settingsArrow, { color: '#FF3B30' }]}>›</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Title Selection Modal */}
      <Modal visible={showTitleModal} transparent animationType="fade" onRequestClose={() => setShowTitleModal(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <Text style={s.modalTitle}>Choisir un titre</Text>
            <Text style={s.modalHint}>Ce titre sera affiché sous ton pseudo en duel</Text>
            {all_unlocked_titles.length === 0 ? (
              <View style={s.modalEmpty}>
                <Text style={s.modalEmptyText}>Joue des parties pour débloquer des titres !</Text>
              </View>
            ) : (
              <ScrollView style={s.modalScroll}>
                {all_unlocked_titles.map((t) => {
                  const meta = CATEGORY_META[t.category] || { icon: '?', name: '', color: '#8A2BE2', bg: '' };
                  const isSelected = user.selected_title === t.title;
                  return (
                    <TouchableOpacity
                      key={`${t.category}-${t.level}`}
                      style={[s.modalItem, isSelected && { borderColor: meta.color, backgroundColor: meta.color + '10' }]}
                      onPress={() => handleSelectTitle(t.title)}
                      disabled={savingTitle}
                    >
                      <Text style={s.modalItemIcon}>{meta.icon}</Text>
                      <View style={s.modalItemInfo}>
                        <Text style={[s.modalItemTitle, isSelected && { color: meta.color }]}>{t.title}</Text>
                        <Text style={s.modalItemSub}>{meta.name} - Niv. {t.level}</Text>
                      </View>
                      {isSelected && <Text style={[s.modalItemCheck, { color: meta.color }]}>✓</Text>}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
            <TouchableOpacity style={s.modalClose} onPress={() => setShowTitleModal(false)}>
              <Text style={s.modalCloseText}>Fermer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  loadingContainer: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: '#A3A3A3', fontSize: 16, marginBottom: 16 },
  loginBtn: { backgroundColor: '#8A2BE2', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  loginBtnText: { color: '#FFF', fontWeight: '700', fontSize: 16 },
  scroll: { paddingBottom: 40 },

  /* ── Profile Header (avatar left + info right) ── */
  profileHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: GRID_PAD, paddingVertical: 20,
    gap: 16,
  },
  avatarContainer: {},
  avatar: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: '#1A1A2E',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 3, borderColor: '#8A2BE2',
  },
  avatarText: { fontSize: 32, fontWeight: '900', color: '#8A2BE2' },
  profileInfo: { flex: 1 },
  pseudo: { fontSize: 24, fontWeight: '900', color: '#FFF' },
  titleBadge: {
    flexDirection: 'row', alignItems: 'center', marginTop: 4,
    alignSelf: 'flex-start',
  },
  titleText: { color: '#B57EDC', fontSize: 14, fontWeight: '700' },
  titleTextEmpty: { color: '#525252', fontSize: 14, fontWeight: '600', fontStyle: 'italic' },
  titleEditIcon: { color: '#525252', fontSize: 12 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  locationFlag: { fontSize: 14 },
  locationText: { color: '#A3A3A3', fontSize: 13, fontWeight: '600' },

  /* Stats Row */
  statsRow: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: GRID_PAD, paddingVertical: 16,
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '900', color: '#FFF' },
  statLabel: { fontSize: 9, fontWeight: '800', color: '#525252', letterSpacing: 1.5, marginTop: 4 },
  statDivider: { width: 1, height: 36, backgroundColor: 'rgba(255,255,255,0.08)' },

  /* Section Title */
  sectionTitle: {
    fontSize: 12, fontWeight: '800', color: '#525252', letterSpacing: 3,
    marginBottom: 14, marginTop: 24, paddingHorizontal: GRID_PAD,
  },

  /* ── Topics Grid ── */
  topicsGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: GRID_PAD - 5,
  },
  topicCard: {
    width: '25%', padding: 5,
    alignItems: 'center',
  },
  topicCardInner: {
    width: '100%', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 6,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
  },
  topicIconBox: {
    width: 44, height: 44, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center', marginBottom: 6,
  },
  topicIcon: { fontSize: 22 },
  topicName: { fontSize: 10, fontWeight: '800', marginBottom: 2, textAlign: 'center' },
  topicLevel: { fontSize: 9, fontWeight: '700', color: '#A3A3A3', letterSpacing: 0.5, marginBottom: 6 },
  topicBarBg: { width: '80%', height: 4, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' },
  topicBarFill: { height: 4, borderRadius: 2 },

  /* Quick Stats */
  quickStats: { flexDirection: 'row', gap: 8, paddingHorizontal: GRID_PAD },
  qStatBox: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14,
    padding: 14, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  qStatVal: { fontSize: 20, fontWeight: '800', color: '#FFF' },
  qStatLbl: { fontSize: 9, color: '#525252', marginTop: 4, fontWeight: '700', textTransform: 'uppercase' },

  /* Titles */
  titlesWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: GRID_PAD, marginBottom: 8 },
  titleChip: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', gap: 6,
  },
  titleChipIcon: { fontSize: 14 },
  titleChipText: { color: '#A3A3A3', fontSize: 13, fontWeight: '600' },
  titleChipCheck: { fontSize: 14, fontWeight: '800' },

  /* Match History */
  noHistory: { color: '#525252', fontSize: 14, textAlign: 'center', paddingVertical: 20, paddingHorizontal: GRID_PAD },
  matchCard: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 14,
    marginBottom: 8, marginHorizontal: GRID_PAD, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  matchCardWon: { borderColor: 'rgba(0,255,157,0.15)', backgroundColor: 'rgba(0,255,157,0.04)' },
  matchLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  matchCatIcon: { fontSize: 20 },
  matchOpp: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  matchDate: { color: '#525252', fontSize: 11, marginTop: 2 },
  matchRight: { alignItems: 'flex-end' },
  matchScore: { fontSize: 16, fontWeight: '800' },
  scoreWin: { color: '#00FF9D' },
  scoreLoss: { color: '#FF3B30' },
  matchXpRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  matchResult: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  resultWin: { color: '#00FF9D' },
  resultLoss: { color: '#FF3B30' },
  matchXp: { color: '#00FFFF', fontSize: 10, fontWeight: '700' },

  /* Settings (Paramètres) */
  settingsWrap: {
    marginHorizontal: GRID_PAD, borderRadius: 14, overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    marginBottom: 24,
  },
  settingsRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16,
  },
  settingsIcon: { fontSize: 18, marginRight: 12 },
  settingsText: { flex: 1, color: '#E0E0E0', fontSize: 15, fontWeight: '600' },
  settingsArrow: { color: '#525252', fontSize: 22, fontWeight: '300' },
  settingsDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.04)', marginHorizontal: 16 },

  /* Modal */
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', paddingHorizontal: 24 },
  modalContent: {
    backgroundColor: '#1A1A1A', borderRadius: 20, padding: 24, maxHeight: '70%',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  modalTitle: { fontSize: 22, fontWeight: '800', color: '#FFF', marginBottom: 4 },
  modalHint: { fontSize: 13, color: '#525252', marginBottom: 20 },
  modalEmpty: { alignItems: 'center', paddingVertical: 30 },
  modalEmptyText: { color: '#525252', fontSize: 14, textAlign: 'center' },
  modalScroll: { maxHeight: 300 },
  modalItem: {
    flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12,
    marginBottom: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  modalItemIcon: { fontSize: 22, marginRight: 12 },
  modalItemInfo: { flex: 1 },
  modalItemTitle: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  modalItemSub: { color: '#525252', fontSize: 11, marginTop: 2 },
  modalItemCheck: { fontSize: 18, fontWeight: '800' },
  modalClose: {
    marginTop: 16, padding: 14, borderRadius: 12, alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  modalCloseText: { color: '#A3A3A3', fontSize: 14, fontWeight: '600' },
});
