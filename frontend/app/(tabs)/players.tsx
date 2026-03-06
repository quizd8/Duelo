import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput, FlatList,
  ActivityIndicator, Dimensions, ScrollView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';

const { width } = Dimensions.get('window');
const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

const CATEGORY_META: Record<string, { icon: string; color: string; name: string }> = {
  series_tv: { icon: '📺', color: '#E040FB', name: 'Séries TV' },
  geographie: { icon: '🌍', color: '#00FFFF', name: 'Géographie' },
  histoire: { icon: '🏛️', color: '#FFD700', name: 'Histoire' },
};

type PlayerResult = {
  id: string; pseudo: string; avatar_seed: string;
  country: string | null; country_flag: string;
  total_xp: number; matches_played: number;
  selected_title: string; best_category: string | null; best_level: number;
};

type Conversation = {
  partner_id: string; partner_pseudo: string; partner_avatar_seed: string;
  last_message: string; last_message_time: string;
  is_sender: boolean; unread_count: number;
};

export default function PlayersScreen() {
  const router = useRouter();
  const [myId, setMyId] = useState('');
  const [tab, setTab] = useState<'search' | 'messages'>('search');

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [players, setPlayers] = useState<PlayerResult[]>([]);
  const [searching, setSearching] = useState(false);

  // Messages
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loadingConvos, setLoadingConvos] = useState(false);
  const [totalUnread, setTotalUnread] = useState(0);

  useEffect(() => {
    loadInit();
  }, []);

  useEffect(() => {
    if (tab === 'messages' && myId) fetchConversations();
  }, [tab]);

  const loadInit = async () => {
    const uid = await AsyncStorage.getItem('duelo_user_id');
    if (uid) {
      setMyId(uid);
      fetchUnreadCount(uid);
    }
    // Load initial players (top by XP)
    searchPlayers('', null);
  };

  const fetchUnreadCount = async (uid: string) => {
    try {
      const res = await fetch(`${API_URL}/api/chat/unread-count/${uid}`);
      const data = await res.json();
      setTotalUnread(data.unread_count || 0);
    } catch {}
  };

  const searchPlayers = async (q: string, cat: string | null) => {
    setSearching(true);
    try {
      let url = `${API_URL}/api/players/search?limit=20`;
      if (q.trim()) url += `&q=${encodeURIComponent(q.trim())}`;
      if (cat) url += `&category=${cat}`;
      const res = await fetch(url);
      const data = await res.json();
      // Filter out self
      setPlayers(data.filter((p: PlayerResult) => p.id !== myId));
    } catch {}
    setSearching(false);
  };

  const fetchConversations = async () => {
    if (!myId) return;
    setLoadingConvos(true);
    try {
      const res = await fetch(`${API_URL}/api/chat/conversations/${myId}`);
      const data = await res.json();
      setConversations(data);
    } catch {}
    setLoadingConvos(false);
  };

  const handleSearch = () => {
    searchPlayers(searchQuery, selectedCat);
  };

  const handleCategoryFilter = (cat: string | null) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newCat = selectedCat === cat ? null : cat;
    setSelectedCat(newCat);
    searchPlayers(searchQuery, newCat);
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

  return (
    <SafeAreaView style={st.container}>
      {/* Header */}
      <View style={st.header}>
        <Text style={st.headerTitle}>JOUEURS</Text>
      </View>

      {/* Tabs */}
      <View style={st.tabsRow}>
        <TouchableOpacity
          data-testid="tab-search"
          style={[st.tabBtn, tab === 'search' && st.tabBtnActive]}
          onPress={() => setTab('search')}
        >
          <Text style={[st.tabText, tab === 'search' && st.tabTextActive]}>🔍 Rechercher</Text>
        </TouchableOpacity>
        <TouchableOpacity
          data-testid="tab-messages"
          style={[st.tabBtn, tab === 'messages' && st.tabBtnActive]}
          onPress={() => { setTab('messages'); }}
        >
          <Text style={[st.tabText, tab === 'messages' && st.tabTextActive]}>
            💬 Messages {totalUnread > 0 ? `(${totalUnread})` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      {tab === 'search' ? (
        <View style={{ flex: 1 }}>
          {/* Search Bar */}
          <View style={st.searchRow}>
            <TextInput
              data-testid="search-input"
              style={st.searchInput}
              placeholder="Rechercher un joueur..."
              placeholderTextColor="#525252"
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={handleSearch}
              returnKeyType="search"
            />
            <TouchableOpacity data-testid="search-button" style={st.searchBtn} onPress={handleSearch}>
              <Text style={st.searchBtnText}>→</Text>
            </TouchableOpacity>
          </View>

          {/* Category Filters */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.filtersRow} contentContainerStyle={st.filtersContent}>
            {Object.entries(CATEGORY_META).map(([key, meta]) => (
              <TouchableOpacity
                key={key}
                data-testid={`filter-${key}`}
                style={[st.filterChip, selectedCat === key && { backgroundColor: meta.color + '30', borderColor: meta.color + '60' }]}
                onPress={() => handleCategoryFilter(key)}
              >
                <Text style={st.filterIcon}>{meta.icon}</Text>
                <Text style={[st.filterText, selectedCat === key && { color: meta.color }]}>{meta.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Results */}
          {searching ? (
            <ActivityIndicator size="large" color="#8A2BE2" style={{ marginTop: 40 }} />
          ) : (
            <FlatList
              data={players}
              keyExtractor={item => item.id}
              contentContainerStyle={st.listContent}
              ListEmptyComponent={
                <View style={st.emptyList}>
                  <Text style={st.emptyIcon}>👥</Text>
                  <Text style={st.emptyText}>Aucun joueur trouvé</Text>
                </View>
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  data-testid={`player-${item.id}`}
                  style={st.playerCard}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push(`/player-profile?id=${item.id}`);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={st.playerAvatar}>
                    <Text style={st.playerAvatarText}>{item.pseudo[0]?.toUpperCase()}</Text>
                  </View>
                  <View style={st.playerInfo}>
                    <View style={st.playerNameRow}>
                      <Text style={st.playerName}>{item.pseudo}</Text>
                      <Text style={st.playerFlag}>{item.country_flag}</Text>
                    </View>
                    <Text style={st.playerTitle}>{item.selected_title}</Text>
                    <View style={st.playerStatsRow}>
                      <Text style={st.playerStat}>{item.total_xp.toLocaleString()} XP</Text>
                      <Text style={st.playerStatDot}>·</Text>
                      <Text style={st.playerStat}>{item.matches_played} parties</Text>
                      {item.best_category && (
                        <>
                          <Text style={st.playerStatDot}>·</Text>
                          <Text style={[st.playerStat, { color: CATEGORY_META[item.best_category]?.color || '#A3A3A3' }]}>
                            {CATEGORY_META[item.best_category]?.icon} Niv.{item.best_level}
                          </Text>
                        </>
                      )}
                    </View>
                  </View>
                  <Text style={st.playerArrow}>›</Text>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      ) : (
        // Messages Tab
        <View style={{ flex: 1 }}>
          {loadingConvos ? (
            <ActivityIndicator size="large" color="#8A2BE2" style={{ marginTop: 40 }} />
          ) : conversations.length === 0 ? (
            <View style={st.emptyList}>
              <Text style={st.emptyIcon}>💬</Text>
              <Text style={st.emptyText}>Aucune conversation</Text>
              <Text style={st.emptySub}>Envoyez un message depuis le profil d'un joueur</Text>
            </View>
          ) : (
            <FlatList
              data={conversations}
              keyExtractor={item => item.partner_id}
              contentContainerStyle={st.listContent}
              renderItem={({ item }) => (
                <TouchableOpacity
                  data-testid={`convo-${item.partner_id}`}
                  style={st.convoCard}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push(`/chat?partnerId=${item.partner_id}&partnerPseudo=${item.partner_pseudo}`);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[st.convoAvatar, item.unread_count > 0 && st.convoAvatarUnread]}>
                    <Text style={st.convoAvatarText}>{item.partner_pseudo[0]?.toUpperCase()}</Text>
                  </View>
                  <View style={st.convoInfo}>
                    <View style={st.convoNameRow}>
                      <Text style={[st.convoName, item.unread_count > 0 && { color: '#FFF' }]}>
                        {item.partner_pseudo}
                      </Text>
                      <Text style={st.convoTime}>{timeAgo(item.last_message_time)}</Text>
                    </View>
                    <Text
                      style={[st.convoPreview, item.unread_count > 0 && { color: '#E0E0E0', fontWeight: '600' }]}
                      numberOfLines={1}
                    >
                      {item.is_sender ? 'Vous: ' : ''}{item.last_message}
                    </Text>
                  </View>
                  {item.unread_count > 0 && (
                    <View style={st.unreadBadge}>
                      <Text style={st.unreadText}>{item.unread_count}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },

  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  headerTitle: { fontSize: 12, fontWeight: '800', color: '#525252', letterSpacing: 3 },

  // Tabs
  tabsRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 16 },
  tabBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 14, alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  tabBtnActive: { backgroundColor: 'rgba(138,43,226,0.15)', borderColor: 'rgba(138,43,226,0.4)' },
  tabText: { color: '#A3A3A3', fontSize: 14, fontWeight: '600' },
  tabTextActive: { color: '#8A2BE2' },

  // Search
  searchRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 12 },
  searchInput: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 12, color: '#FFF', fontSize: 15,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  searchBtn: {
    width: 48, borderRadius: 14, backgroundColor: '#8A2BE2',
    justifyContent: 'center', alignItems: 'center',
  },
  searchBtnText: { color: '#FFF', fontSize: 20, fontWeight: '700' },

  // Filters
  filtersRow: { maxHeight: 44, marginBottom: 12 },
  filtersContent: { paddingHorizontal: 16, gap: 8 },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  filterIcon: { fontSize: 14 },
  filterText: { color: '#A3A3A3', fontSize: 13, fontWeight: '600' },

  // List
  listContent: { paddingHorizontal: 16, paddingBottom: 20 },

  emptyList: { alignItems: 'center', paddingVertical: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { color: '#FFF', fontSize: 18, fontWeight: '700', marginBottom: 4 },
  emptySub: { color: '#525252', fontSize: 13 },

  // Player card
  playerCard: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  playerAvatar: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: '#8A2BE2',
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  playerAvatarText: { color: '#FFF', fontSize: 20, fontWeight: '800' },
  playerInfo: { flex: 1 },
  playerNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  playerName: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  playerFlag: { fontSize: 14 },
  playerTitle: { color: '#A3A3A3', fontSize: 13, fontWeight: '500', marginBottom: 4 },
  playerStatsRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  playerStat: { color: '#525252', fontSize: 12, fontWeight: '600' },
  playerStatDot: { color: '#333', fontSize: 12 },
  playerArrow: { color: '#525252', fontSize: 24, fontWeight: '300' },

  // Conversation card
  convoCard: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  convoAvatar: {
    width: 50, height: 50, borderRadius: 25, backgroundColor: '#333',
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  convoAvatarUnread: { backgroundColor: '#8A2BE2' },
  convoAvatarText: { color: '#FFF', fontSize: 20, fontWeight: '800' },
  convoInfo: { flex: 1 },
  convoNameRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  convoName: { color: '#A3A3A3', fontSize: 15, fontWeight: '700' },
  convoTime: { color: '#525252', fontSize: 12 },
  convoPreview: { color: '#525252', fontSize: 14 },
  unreadBadge: {
    width: 22, height: 22, borderRadius: 11, backgroundColor: '#8A2BE2',
    justifyContent: 'center', alignItems: 'center', marginLeft: 8,
  },
  unreadText: { color: '#FFF', fontSize: 11, fontWeight: '800' },
});
