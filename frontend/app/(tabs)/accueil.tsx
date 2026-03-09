import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, FlatList,
  ActivityIndicator, RefreshControl, Dimensions, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming,
  withSequence, withDelay, FadeInDown, FadeInRight,
  Easing, interpolate,
} from 'react-native-reanimated';
import DueloHeader from '../../components/DueloHeader';
import CosmicBackground from '../../components/CosmicBackground';

import { GLASS } from '../../theme/glassTheme';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DUEL_CARD_WIDTH = SCREEN_WIDTH * 0.72;

const CATEGORY_ICONS: Record<string, string> = {
  series_tv: '📺', geographie: '🌍', histoire: '🏛️', cinema: '🎬',
  sport: '⚽', musique: '🎵', sciences: '🔬', gastronomie: '🍽️',
};

// ── Types ──
interface DuelItem {
  id: string;
  opponent_pseudo: string;
  opponent_avatar_seed: string;
  category: string;
  category_name: string;
  category_color: string;
  player_score: number;
  opponent_score: number;
  won: boolean;
  created_at: string;
}

interface FeedItem {
  type: 'record' | 'community' | 'event';
  id: string;
  category: string;
  category_name: string;
  category_color: string;
  // record
  user_pseudo?: string;
  user_avatar_seed?: string;
  title?: string;
  body?: string;
  score?: string;
  icon?: string;
  xp_earned?: number;
  // community
  post_id?: string;
  user_id?: string;
  content?: string;
  has_image?: boolean;
  likes_count?: number;
  comments_count?: number;
  is_liked?: boolean;
  // event
  created_at: string;
}

interface UserData {
  pseudo: string;
  avatar_seed: string;
  total_xp: number;
  current_streak: number;
  streak_badge: string;
  matches_played: number;
  matches_won: number;
  country_flag: string;
  selected_title: string;
}

function getAvatar(seed: string) {
  const emojis = ['🐯', '🦊', '🐸', '🦄', '🐺', '🦅', '🐲', '🐼', '🦁', '🐙', '🐬', '🦋'];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  return emojis[Math.abs(hash) % emojis.length];
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "À l'instant";
  if (m < 60) return `${m}m`;
  const h = Math.floor(diff / 3600000);
  if (h < 24) return `${h}h`;
  const d = Math.floor(diff / 86400000);
  return `${d}j`;
}

// ── Shimmer Border Animation ──
function ShimmerBorder({ color, children }: { color: string; children: React.ReactNode }) {
  const shimmer = useSharedValue(0);
  useEffect(() => {
    shimmer.value = withRepeat(
      withTiming(1, { duration: 2500, easing: Easing.linear }),
      -1, false
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    opacity: interpolate(shimmer.value, [0, 0.5, 1], [0.3, 0.9, 0.3]),
  }));

  return (
    <View style={{ position: 'relative' }}>
      <Animated.View
        style={[
          {
            position: 'absolute', top: -1, left: -1, right: -1, bottom: -1,
            borderRadius: 21, borderWidth: 1.5, borderColor: color,
          },
          animStyle,
        ]}
      />
      {children}
    </View>
  );
}

// ── Breathing Glow for Stats ──
function BreathingGlow() {
  const glow = useSharedValue(0);
  useEffect(() => {
    glow.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
      ),
      -1, true
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    opacity: interpolate(glow.value, [0, 1], [0.15, 0.45]),
    transform: [{ scale: interpolate(glow.value, [0, 1], [1, 1.1]) }],
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute', width: 120, height: 120, borderRadius: 60,
          backgroundColor: '#8A2BE2', top: -20, right: -20,
        },
        animStyle,
      ]}
    />
  );
}

// ── Duel Card ──
function DuelCard({ duel, index, onRematch }: { duel: DuelItem; index: number; onRematch: () => void }) {
  return (
    <Animated.View entering={FadeInRight.delay(index * 100).duration(500)}>
      <ShimmerBorder color={duel.category_color}>
        <View style={[styles.duelCard, { borderColor: duel.category_color + '20' }]}>
          {/* Glass overlay */}
          <View style={styles.duelGlass} />

          {/* Category badge */}
          <View style={[styles.duelCatBadge, { backgroundColor: duel.category_color + '25' }]}>
            <Text style={styles.duelCatIcon}>{CATEGORY_ICONS[duel.category] || '❓'}</Text>
            <Text style={[styles.duelCatName, { color: duel.category_color }]} numberOfLines={1}>
              {duel.category_name}
            </Text>
          </View>

          {/* VS Section */}
          <View style={styles.duelVsSection}>
            {/* Player */}
            <View style={styles.duelPlayer}>
              <View style={[styles.duelAvatarWrap, { borderColor: '#8A2BE2' }]}>
                <Text style={styles.duelAvatarEmoji}>🫵</Text>
              </View>
              <Text style={styles.duelPlayerLabel}>Toi</Text>
            </View>

            {/* Score */}
            <View style={styles.duelScoreWrap}>
              <Text style={[styles.duelScoreNum, duel.won && { color: '#00FF9D' }]}>
                {duel.player_score}
              </Text>
              <Text style={styles.duelVsText}>VS</Text>
              <Text style={[styles.duelScoreNum, !duel.won && { color: '#FF3B5C' }]}>
                {duel.opponent_score}
              </Text>
            </View>

            {/* Opponent */}
            <View style={styles.duelPlayer}>
              <View style={[styles.duelAvatarWrap, { borderColor: duel.category_color }]}>
                <Text style={styles.duelAvatarEmoji}>{getAvatar(duel.opponent_avatar_seed)}</Text>
              </View>
              <Text style={styles.duelPlayerLabel} numberOfLines={1}>{duel.opponent_pseudo}</Text>
            </View>
          </View>

          {/* Result badge */}
          <View style={[styles.duelResultBadge, { backgroundColor: duel.won ? '#00FF9D15' : '#FF3B5C15' }]}>
            <Text style={[styles.duelResultText, { color: duel.won ? '#00FF9D' : '#FF3B5C' }]}>
              {duel.won ? '✓ VICTOIRE' : '✗ DÉFAITE'}
            </Text>
          </View>

          {/* Rematch button */}
          <TouchableOpacity
            style={styles.rematchBtn}
            onPress={onRematch}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={[duel.category_color, '#8A2BE2']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.rematchGradient}
            >
              <Text style={styles.rematchText}>⚔️ REVANCHE</Text>
            </LinearGradient>
          </TouchableOpacity>

          {/* Time ago */}
          <Text style={styles.duelTimeAgo}>{timeAgo(duel.created_at)}</Text>
        </View>
      </ShimmerBorder>
    </Animated.View>
  );
}

// ── Record Card ──
function RecordCard({ item, index }: { item: FeedItem; index: number }) {
  return (
    <Animated.View entering={FadeInDown.delay(index * 80).duration(400)}>
      <View style={[styles.feedCard, { borderLeftWidth: 3, borderLeftColor: item.category_color }]}>
        <View style={styles.feedCardHeader}>
          <View style={[styles.feedIconBadge, { backgroundColor: item.category_color + '20' }]}>
            <Text style={styles.feedIconEmoji}>{item.icon || '🏆'}</Text>
          </View>
          <View style={styles.feedHeaderText}>
            <Text style={styles.feedCardTitle}>{item.title}</Text>
            <Text style={styles.feedCardTime}>{timeAgo(item.created_at)}</Text>
          </View>
        </View>
        <Text style={styles.feedCardBody}>{item.body}</Text>
        {item.xp_earned ? (
          <View style={styles.xpBadge}>
            <Text style={styles.xpBadgeText}>+{item.xp_earned} XP</Text>
          </View>
        ) : null}
      </View>
    </Animated.View>
  );
}

// ── Community Card ──
function CommunityCard({ item, index, userId, onLike }: {
  item: FeedItem; index: number; userId: string; onLike: (postId: string) => void
}) {
  return (
    <Animated.View entering={FadeInDown.delay(index * 80).duration(400)}>
      <View style={styles.feedCard}>
        {/* Header */}
        <View style={styles.communityHeader}>
          <View style={styles.communityUser}>
            <View style={[styles.communityAvatar, { backgroundColor: item.category_color + '20' }]}>
              <Text style={styles.communityAvatarEmoji}>{getAvatar(item.user_avatar_seed || '')}</Text>
            </View>
            <View>
              <Text style={styles.communityPseudo}>{item.user_pseudo}</Text>
              <View style={styles.communityMeta}>
                <View style={[styles.communityCatDot, { backgroundColor: item.category_color }]} />
                <Text style={[styles.communityCatLabel, { color: item.category_color }]}>
                  {item.category_name}
                </Text>
                <Text style={styles.communityTime}> · {timeAgo(item.created_at)}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Content */}
        <Text style={styles.communityContent}>{item.content}</Text>

        {/* Actions */}
        <View style={styles.communityActions}>
          <TouchableOpacity
            style={styles.communityActionBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              if (item.post_id) onLike(item.post_id);
            }}
          >
            <Text style={[styles.communityActionIcon, item.is_liked && { color: '#FF3B5C' }]}>
              {item.is_liked ? '⚡' : '🤍'}
            </Text>
            <Text style={[styles.communityActionCount, item.is_liked && { color: '#FF3B5C' }]}>
              {item.likes_count || 0}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.communityActionBtn}>
            <Text style={styles.communityActionIcon}>💬</Text>
            <Text style={styles.communityActionCount}>{item.comments_count || 0}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
}

// ── Event Card ──
function EventCard({ item, index }: { item: FeedItem; index: number }) {
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1200 }),
        withTiming(0, { duration: 1200 }),
      ),
      -1, true
    );
  }, []);
  const pulseStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0, 1], [0.6, 1]),
  }));

  return (
    <Animated.View entering={FadeInDown.delay(index * 80).duration(400)}>
      <Animated.View style={pulseStyle}>
        <LinearGradient
          colors={[item.category_color + '15', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.eventCard, { borderColor: item.category_color + '30' }]}
        >
          <View style={[styles.eventIconWrap, { backgroundColor: item.category_color + '25' }]}>
            <Text style={styles.eventIcon}>{item.icon || '⚡'}</Text>
          </View>
          <View style={styles.eventContent}>
            <Text style={[styles.eventTitle, { color: item.category_color }]}>{item.title}</Text>
            <Text style={styles.eventBody}>{item.body}</Text>
          </View>
          <View style={[styles.eventLiveBadge, { backgroundColor: item.category_color }]}>
            <Text style={styles.eventLiveText}>LIVE</Text>
          </View>
        </LinearGradient>
      </Animated.View>
    </Animated.View>
  );
}


// ── Main Screen ──
export default function AccueilScreen() {
  const router = useRouter();
  const [userData, setUserData] = useState<UserData | null>(null);
  const [pendingDuels, setPendingDuels] = useState<DuelItem[]>([]);
  const [socialFeed, setSocialFeed] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    loadFeed();
  }, []);

  const loadFeed = async () => {
    try {
      const uid = await AsyncStorage.getItem('duelo_user_id');
      if (!uid) { setLoading(false); return; }
      setUserId(uid);

      const res = await fetch(`${API_URL}/api/feed/home/${uid}`);
      if (res.ok) {
        const data = await res.json();
        setUserData(data.user);
        setPendingDuels(data.pending_duels || []);
        setSocialFeed(data.social_feed || []);
      }
    } catch (err) {
      console.error('Feed load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadFeed();
    setRefreshing(false);
  }, []);

  const handleRematch = (duel: DuelItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    router.push(`/matchmaking?category=${duel.category}`);
  };

  const handleLike = async (postId: string) => {
    if (!userId) return;
    try {
      await fetch(`${API_URL}/api/wall/${postId}/like`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      });
      // Optimistic update
      setSocialFeed(prev =>
        prev.map(item =>
          item.post_id === postId
            ? {
                ...item,
                is_liked: !item.is_liked,
                likes_count: (item.likes_count || 0) + (item.is_liked ? -1 : 1),
              }
            : item
        )
      );
    } catch {}
  };

  if (loading) {
    return (
      <CosmicBackground>
      <SafeAreaView style={styles.container}>
        <DueloHeader />
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#8A2BE2" />
        </View>
      </SafeAreaView>
      </CosmicBackground>
    );
  }

  return (
    <CosmicBackground>
    <SafeAreaView style={styles.container}>
      <DueloHeader />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#8A2BE2"
            colors={['#8A2BE2']}
          />
        }
      >
        {/* ── Greeting Section ── */}
        <Animated.View entering={FadeInDown.duration(600)} style={styles.greetingSection}>
          <View style={styles.greetingRow}>
            <View>
              <Text style={styles.greetingHi}>
                Salut, {userData?.pseudo || 'Joueur'} {userData?.country_flag || '👋'}
              </Text>
              <Text style={styles.greetingTitle}>{userData?.selected_title || 'Novice'}</Text>
            </View>
            {/* Stats pill */}
            <View style={styles.statsRow}>
              {(userData?.current_streak || 0) > 0 && (
                <View style={styles.streakPill}>
                  <Text style={styles.streakIcon}>🔥</Text>
                  <Text style={styles.streakNum}>{userData?.current_streak}</Text>
                </View>
              )}
              <View style={styles.xpPill}>
                <Text style={styles.xpIcon}>⚡</Text>
                <Text style={styles.xpNum}>{(userData?.total_xp || 0).toLocaleString()}</Text>
              </View>
            </View>
          </View>
        </Animated.View>

        {/* ── Pending Duels Section ── */}
        {pendingDuels.length > 0 && (
          <Animated.View entering={FadeInDown.delay(200).duration(500)}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionIcon}>⚔️</Text>
              <Text style={styles.sectionTitle}>DUELS EN ATTENTE</Text>
              <View style={styles.sectionBadge}>
                <Text style={styles.sectionBadgeText}>{pendingDuels.length}</Text>
              </View>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.duelsScroll}
              snapToInterval={DUEL_CARD_WIDTH + 12}
              decelerationRate="fast"
            >
              {pendingDuels.map((duel, idx) => (
                <DuelCard
                  key={duel.id}
                  duel={duel}
                  index={idx}
                  onRematch={() => handleRematch(duel)}
                />
              ))}
            </ScrollView>
          </Animated.View>
        )}

        {/* ── Quick Play Section ── */}
        <Animated.View entering={FadeInDown.delay(300).duration(500)}>
          <TouchableOpacity
            style={styles.quickPlayBtn}
            activeOpacity={0.85}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
              router.push('/(tabs)/play');
            }}
          >
            <LinearGradient
              colors={['#8A2BE2', '#00FFFF']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.quickPlayGradient}
            >
              <Text style={styles.quickPlayIcon}>⚡</Text>
              <Text style={styles.quickPlayText}>LANCER UN DUEL</Text>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>

        {/* ── Social Wall ── */}
        <Animated.View entering={FadeInDown.delay(400).duration(500)}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionIcon}>🌐</Text>
            <Text style={styles.sectionTitle}>ACTIVITÉ</Text>
          </View>
        </Animated.View>

        {socialFeed.length === 0 ? (
          <Animated.View entering={FadeInDown.delay(500).duration(400)} style={styles.emptyFeed}>
            <Text style={styles.emptyFeedIcon}>🌙</Text>
            <Text style={styles.emptyFeedTitle}>C'est calme ici...</Text>
            <Text style={styles.emptyFeedText}>
              Lance un duel ou publie sur le mur social d'une catégorie pour voir l'activité !
            </Text>
          </Animated.View>
        ) : (
          socialFeed.map((item, idx) => {
            if (item.type === 'event') {
              return <EventCard key={item.id} item={item} index={idx} />;
            }
            if (item.type === 'record') {
              return <RecordCard key={item.id} item={item} index={idx} />;
            }
            if (item.type === 'community') {
              return (
                <CommunityCard
                  key={item.id}
                  item={item}
                  index={idx}
                  userId={userId || ''}
                  onLike={handleLike}
                />
              );
            }
            return null;
          })
        )}

        {/* Bottom spacing */}
        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
    </CosmicBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: 20 },

  // ── Greeting ──
  greetingSection: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  greetingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  greetingHi: {
    fontSize: 22,
    fontWeight: '900',
    color: '#FFF',
    letterSpacing: -0.5,
  },
  greetingTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#8A2BE2',
    marginTop: 2,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  streakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 107, 53, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 4,
  },
  streakIcon: { fontSize: 14 },
  streakNum: { fontSize: 13, fontWeight: '800', color: '#FF6B35' },
  xpPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(138, 43, 226, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 4,
  },
  xpIcon: { fontSize: 14 },
  xpNum: { fontSize: 13, fontWeight: '800', color: '#8A2BE2' },

  // ── Section Headers ──
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 12,
    gap: 8,
  },
  sectionIcon: { fontSize: 16 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#666',
    letterSpacing: 2,
  },
  sectionBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#8A2BE2',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  sectionBadgeText: { fontSize: 10, fontWeight: '800', color: '#FFF' },

  // ── Duels Scroll ──
  duelsScroll: {
    paddingLeft: 16,
    paddingRight: 4,
    gap: 12,
  },

  // ── Duel Card ──
  duelCard: {
    width: DUEL_CARD_WIDTH,
    borderRadius: GLASS.radius,
    backgroundColor: GLASS.bg,
    borderWidth: 1,
    borderColor: GLASS.borderCyan,
    padding: 16,
    overflow: 'hidden',
  },
  duelGlass: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 255, 255, 0.02)',
    borderRadius: GLASS.radius,
  },
  duelCatBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 6,
    marginBottom: 14,
  },
  duelCatIcon: { fontSize: 14 },
  duelCatName: { fontSize: 11, fontWeight: '700' },

  duelVsSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  duelPlayer: {
    alignItems: 'center',
    width: 60,
  },
  duelAvatarWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginBottom: 4,
  },
  duelAvatarEmoji: { fontSize: 20 },
  duelPlayerLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#AAA',
    textAlign: 'center',
  },
  duelScoreWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  duelScoreNum: {
    fontSize: 28,
    fontWeight: '900',
    color: '#FFF',
  },
  duelVsText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#444',
    letterSpacing: 1,
  },
  duelResultBadge: {
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 3,
    borderRadius: 8,
    marginBottom: 10,
  },
  duelResultText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  rematchBtn: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  rematchGradient: {
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
  },
  rematchText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#FFF',
    letterSpacing: 1.5,
  },
  duelTimeAgo: {
    fontSize: 10,
    color: '#444',
    textAlign: 'center',
    marginTop: 8,
  },

  // ── Quick Play ──
  quickPlayBtn: {
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: GLASS.radius,
    overflow: 'hidden',
  },
  quickPlayGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 10,
    borderRadius: GLASS.radius,
  },
  quickPlayIcon: { fontSize: 20 },
  quickPlayText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFF',
    letterSpacing: 2,
  },

  // ── Feed Cards ──
  feedCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: GLASS.radius,
    backgroundColor: GLASS.bg,
    borderWidth: 1,
    borderColor: GLASS.borderCyan,
    padding: 14,
  },
  feedCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 10,
  },
  feedIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  feedIconEmoji: { fontSize: 18 },
  feedHeaderText: { flex: 1 },
  feedCardTitle: { fontSize: 14, fontWeight: '800', color: '#FFF' },
  feedCardTime: { fontSize: 11, color: '#555', marginTop: 1 },
  feedCardBody: { fontSize: 13, color: '#BBB', lineHeight: 18 },
  xpBadge: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: 'rgba(138, 43, 226, 0.15)',
  },
  xpBadgeText: { fontSize: 12, fontWeight: '800', color: '#8A2BE2' },

  // ── Community Card ──
  communityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  communityUser: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  communityAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  communityAvatarEmoji: { fontSize: 20 },
  communityPseudo: { fontSize: 14, fontWeight: '700', color: '#FFF' },
  communityMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  communityCatDot: { width: 6, height: 6, borderRadius: 3, marginRight: 5 },
  communityCatLabel: { fontSize: 11, fontWeight: '600' },
  communityTime: { fontSize: 11, color: '#555' },
  communityContent: { fontSize: 14, color: '#CCC', lineHeight: 20, marginBottom: 10 },
  communityActions: {
    flexDirection: 'row',
    gap: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
    paddingTop: 10,
  },
  communityActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  communityActionIcon: { fontSize: 16 },
  communityActionCount: { fontSize: 12, fontWeight: '700', color: '#666' },

  // ── Event Card ──
  eventCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  eventIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  eventIcon: { fontSize: 22 },
  eventContent: { flex: 1 },
  eventTitle: { fontSize: 14, fontWeight: '800' },
  eventBody: { fontSize: 12, color: '#888', marginTop: 2 },
  eventLiveBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  eventLiveText: { fontSize: 9, fontWeight: '900', color: '#FFF', letterSpacing: 1 },

  // ── Empty Feed ──
  emptyFeed: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 32,
  },
  emptyFeedIcon: { fontSize: 40, marginBottom: 12 },
  emptyFeedTitle: { fontSize: 18, fontWeight: '700', color: '#FFF', marginBottom: 6 },
  emptyFeedText: { fontSize: 13, color: '#666', textAlign: 'center', lineHeight: 18 },
});
