import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Image,
  ActivityIndicator, RefreshControl, FlatList, Dimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';

const { width } = Dimensions.get('window');
const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

const CATEGORY_META: Record<string, { icon: string; color: string; name: string }> = {
  series_tv: { icon: '📺', color: '#E040FB', name: 'Séries TV' },
  geographie: { icon: '🌍', color: '#00FFFF', name: 'Géographie' },
  histoire: { icon: '🏛️', color: '#FFD700', name: 'Histoire' },
};

type PlayerProfile = {
  id: string; pseudo: string; avatar_seed: string;
  selected_title: string; country: string | null; country_flag: string;
  matches_played: number; matches_won: number; win_rate: number;
  current_streak: number; best_streak: number; total_xp: number;
  categories: Record<string, { xp: number; level: number; title: string }>;
  champion_titles: { category: string; category_name: string; scope: string; date: string }[];
  followers_count: number; following_count: number; is_following: boolean;
  posts: {
    id: string; category_id: string; category_name: string;
    content: string; image_base64: string | null;
    likes_count: number; comments_count: number; is_liked: boolean; created_at: string;
  }[];
};

export default function PlayerProfileScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [myId, setMyId] = useState('');
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [followLoading, setFollowLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { init(); }, []);

  const init = async () => {
    const uid = await AsyncStorage.getItem('duelo_user_id');
    if (uid) setMyId(uid);
    await fetchProfile(uid || '');
    setLoading(false);
  };

  const fetchProfile = async (viewerId: string) => {
    try {
      const res = await fetch(`${API_URL}/api/player/${id}/profile?viewer_id=${viewerId}`);
      const data = await res.json();
      setProfile(data);
    } catch {}
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchProfile(myId);
    setRefreshing(false);
  };

  const handleFollow = async () => {
    if (!myId || followLoading || !profile || myId === profile.id) return;
    setFollowLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const res = await fetch(`${API_URL}/api/player/${id}/follow`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ follower_id: myId }),
      });
      const data = await res.json();
      setProfile(prev => prev ? {
        ...prev,
        is_following: data.following,
        followers_count: prev.followers_count + (data.following ? 1 : -1)
      } : null);
    } catch {}
    setFollowLoading(false);
  };

  const handlePlay = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    // Find best category of this player
    if (profile?.categories) {
      const cats = Object.entries(profile.categories);
      const best = cats.reduce((a, b) => b[1].xp > a[1].xp ? b : a, cats[0]);
      router.push(`/matchmaking?category=${best[0]}`);
    }
  };

  const handleChat = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/chat?partnerId=${id}&partnerPseudo=${profile?.pseudo || ''}`);
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "À l'instant";
    if (mins < 60) return `${mins}min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}j`;
  };

  if (loading) {
    return <View style={s.loadingContainer}><ActivityIndicator size="large" color="#8A2BE2" /></View>;
  }
  if (!profile) return null;

  const isOwnProfile = myId === profile.id;

  return (
    <SafeAreaView style={s.container}>
      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#8A2BE2" />}
      >
        {/* Back */}
        <TouchableOpacity data-testid="back-button" style={s.backBtn} onPress={() => router.back()}>
          <Text style={s.backText}>← Retour</Text>
        </TouchableOpacity>

        {/* Profile Header */}
        <View style={s.headerCard}>
          {/* Avatar */}
          <View style={s.avatarSection}>
            <View style={s.avatarRing}>
              <View style={s.avatar}>
                <Text style={s.avatarText}>{profile.pseudo[0]?.toUpperCase()}</Text>
              </View>
            </View>
            {/* Category badges around avatar */}
            <View style={s.badgesRow}>
              {Object.entries(profile.categories).map(([key, cat]) => (
                cat.xp > 0 ? (
                  <View key={key} style={[s.catBadge, { backgroundColor: CATEGORY_META[key]?.color + '30', borderColor: CATEGORY_META[key]?.color + '60' }]}>
                    <Text style={s.catBadgeIcon}>{CATEGORY_META[key]?.icon}</Text>
                    <Text style={[s.catBadgeLevel, { color: CATEGORY_META[key]?.color }]}>Niv.{cat.level}</Text>
                  </View>
                ) : null
              ))}
            </View>
          </View>

          {/* Name & Info */}
          <Text style={s.pseudo} data-testid="player-pseudo">{profile.pseudo}</Text>
          <Text style={s.title}>{profile.selected_title}</Text>
          <View style={s.countryRow}>
            <Text style={s.countryFlag}>{profile.country_flag}</Text>
            <Text style={s.countryText}>{profile.country || 'Monde'}</Text>
          </View>

          {/* Champion Titles */}
          {profile.champion_titles.length > 0 && (
            <View style={s.championSection}>
              {profile.champion_titles.map((ct, i) => (
                <View key={i} style={s.championBanner}>
                  <Text style={s.championText}>🏆 #1 en {ct.category_name}</Text>
                  <Text style={s.championSub}>En {ct.scope}, {ct.date}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Action Buttons */}
          {!isOwnProfile && (
            <View style={s.actionsRow}>
              <TouchableOpacity data-testid="play-button" style={s.actionBtn} onPress={handlePlay}>
                <Text style={s.actionIcon}>⚡</Text>
                <Text style={s.actionText}>Jouer</Text>
              </TouchableOpacity>
              <TouchableOpacity
                data-testid="follow-button"
                style={[s.actionBtn, profile.is_following ? s.followingBtn : s.followBtn]}
                onPress={handleFollow} disabled={followLoading}
              >
                <Text style={s.actionIcon}>{profile.is_following ? '✓' : '+'}</Text>
                <Text style={[s.actionText, profile.is_following && { color: '#00FF9D' }]}>
                  {profile.is_following ? 'Suivi' : 'Suivre'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity data-testid="chat-button" style={[s.actionBtn, s.chatBtn]} onPress={handleChat}>
                <Text style={s.actionIcon}>💬</Text>
                <Text style={[s.actionText, { color: '#00BFFF' }]}>Message</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Stats Row */}
          <View style={s.statsRow}>
            <View style={s.statItem}>
              <Text style={s.statValue}>{profile.matches_played}</Text>
              <Text style={s.statLabel}>PARTIES</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statItem}>
              <Text style={s.statValue}>{profile.followers_count}</Text>
              <Text style={s.statLabel}>ABONNÉS</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statItem}>
              <Text style={s.statValue}>{profile.following_count}</Text>
              <Text style={s.statLabel}>ABONNÉ À</Text>
            </View>
          </View>
        </View>

        {/* Posts Wall */}
        <View style={s.wallHeader}>
          <Text style={s.wallTitle}>PUBLICATIONS</Text>
          <Text style={s.wallCount}>{profile.posts.length}</Text>
        </View>

        {profile.posts.length === 0 ? (
          <View style={s.emptyWall}>
            <Text style={s.emptyIcon}>📝</Text>
            <Text style={s.emptyText}>Aucune publication pour le moment</Text>
          </View>
        ) : (
          profile.posts.map(post => (
            <View key={post.id} style={s.postCard}>
              <View style={s.postHeader}>
                <View style={[s.postCatBadge, { backgroundColor: (CATEGORY_META[post.category_id]?.color || '#8A2BE2') + '20' }]}>
                  <Text style={s.postCatIcon}>{CATEGORY_META[post.category_id]?.icon || '❓'}</Text>
                  <Text style={[s.postCatName, { color: CATEGORY_META[post.category_id]?.color || '#8A2BE2' }]}>
                    {post.category_name}
                  </Text>
                </View>
                <Text style={s.postTime}>{timeAgo(post.created_at)}</Text>
              </View>
              <Text style={s.postContent}>{post.content}</Text>
              {post.image_base64 && (
                <Image source={{ uri: post.image_base64 }} style={s.postImage} resizeMode="cover" />
              )}
              <View style={s.postActions}>
                <View style={s.postActionItem}>
                  <Text style={s.postActionIcon}>{post.is_liked ? '❤️' : '🤍'}</Text>
                  <Text style={s.postActionCount}>{post.likes_count}</Text>
                </View>
                <View style={s.postActionItem}>
                  <Text style={s.postActionIcon}>💬</Text>
                  <Text style={s.postActionCount}>{post.comments_count}</Text>
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  loadingContainer: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  scroll: { paddingBottom: 40 },

  backBtn: { paddingHorizontal: 20, paddingVertical: 12 },
  backText: { color: '#A3A3A3', fontSize: 15, fontWeight: '600' },

  // Header
  headerCard: {
    marginHorizontal: 16, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginBottom: 20, alignItems: 'center',
  },

  avatarSection: { alignItems: 'center', marginBottom: 16 },
  avatarRing: {
    width: 100, height: 100, borderRadius: 50,
    borderWidth: 3, borderColor: '#8A2BE2',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#8A2BE2', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 16,
  },
  avatar: {
    width: 90, height: 90, borderRadius: 45, backgroundColor: '#1A1A2E',
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { fontSize: 38, fontWeight: '900', color: '#8A2BE2' },

  badgesRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  catBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, borderWidth: 1,
  },
  catBadgeIcon: { fontSize: 14 },
  catBadgeLevel: { fontSize: 11, fontWeight: '800' },

  pseudo: { fontSize: 26, fontWeight: '900', color: '#FFF', marginBottom: 4 },
  title: { fontSize: 15, color: '#A3A3A3', fontWeight: '600', marginBottom: 8 },

  countryRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
  countryFlag: { fontSize: 18 },
  countryText: { fontSize: 14, color: '#A3A3A3', fontWeight: '600' },

  // Champions
  championSection: { width: '100%', marginBottom: 16, gap: 8 },
  championBanner: {
    backgroundColor: 'rgba(255,215,0,0.1)', borderRadius: 14, paddingVertical: 10, paddingHorizontal: 16,
    borderWidth: 1, borderColor: 'rgba(255,215,0,0.3)', alignItems: 'center',
  },
  championText: { color: '#FFD700', fontSize: 15, fontWeight: '800' },
  championSub: { color: '#A3A3A3', fontSize: 12, marginTop: 2 },

  // Actions
  actionsRow: { flexDirection: 'row', gap: 8, width: '100%', marginBottom: 20 },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, borderRadius: 14, gap: 6, backgroundColor: '#8A2BE2',
  },
  followBtn: { backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  followingBtn: { backgroundColor: 'rgba(0,255,157,0.1)', borderWidth: 1, borderColor: 'rgba(0,255,157,0.3)' },
  chatBtn: { backgroundColor: 'rgba(0,191,255,0.1)', borderWidth: 1, borderColor: 'rgba(0,191,255,0.3)' },
  actionIcon: { fontSize: 16 },
  actionText: { color: '#FFF', fontSize: 13, fontWeight: '700' },

  // Stats
  statsRow: { flexDirection: 'row', alignItems: 'center', width: '100%' },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 24, fontWeight: '900', color: '#FFF' },
  statLabel: { fontSize: 9, fontWeight: '800', color: '#525252', letterSpacing: 1, marginTop: 4 },
  statDivider: { width: 1, height: 36, backgroundColor: 'rgba(255,255,255,0.08)' },

  // Wall
  wallHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, marginBottom: 12,
  },
  wallTitle: { fontSize: 12, fontWeight: '800', color: '#525252', letterSpacing: 2 },
  wallCount: { fontSize: 12, fontWeight: '700', color: '#A3A3A3' },

  emptyWall: { alignItems: 'center', paddingVertical: 40 },
  emptyIcon: { fontSize: 40, marginBottom: 8 },
  emptyText: { color: '#525252', fontSize: 15 },

  // Post
  postCard: {
    marginHorizontal: 16, backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  postHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  postCatBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  postCatIcon: { fontSize: 14 },
  postCatName: { fontSize: 12, fontWeight: '700' },
  postTime: { color: '#525252', fontSize: 12 },
  postContent: { color: '#E0E0E0', fontSize: 15, lineHeight: 22, marginBottom: 10 },
  postImage: { width: '100%', height: 200, borderRadius: 12, marginBottom: 10 },
  postActions: { flexDirection: 'row', gap: 20 },
  postActionItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  postActionIcon: { fontSize: 18 },
  postActionCount: { color: '#A3A3A3', fontSize: 14, fontWeight: '600' },
});
