import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, Image,
  ActivityIndicator, KeyboardAvoidingView, Platform, Keyboard, RefreshControl,
  Modal, FlatList, Dimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';

const { width } = Dimensions.get('window');
const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

const CATEGORY_META: Record<string, { icon: string; color: string; bgPattern: string }> = {
  series_tv: { icon: '📺', color: '#E040FB', bgPattern: '🎬🍿🎭📺🎥' },
  geographie: { icon: '🌍', color: '#00FFFF', bgPattern: '🗺️🏔️🌊🌍✈️' },
  histoire: { icon: '🏛️', color: '#FFD700', bgPattern: '⚔️🏰👑🏛️📜' },
};

type CategoryDetail = {
  id: string; name: string; description: string;
  total_questions: number; followers_count: number;
  user_level: number; user_title: string; user_xp: number;
  xp_progress: { current: number; needed: number; progress: number };
  is_following: boolean; completion_pct: number;
};

type WallPostData = {
  id: string;
  user: { id: string; pseudo: string; avatar_seed: string };
  content: string; image_base64: string | null;
  likes_count: number; comments_count: number;
  is_liked: boolean; created_at: string;
};

type CommentData = {
  id: string;
  user: { id: string; pseudo: string; avatar_seed: string };
  content: string; created_at: string;
};

type LeaderEntry = {
  id: string; rank: number; pseudo: string; avatar_seed: string;
  level: number; title: string; xp: number;
};

export default function CategoryDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const meta = CATEGORY_META[id || ''] || { icon: '❓', color: '#8A2BE2', bgPattern: '' };

  const [userId, setUserId] = useState('');
  const [detail, setDetail] = useState<CategoryDetail | null>(null);
  const [posts, setPosts] = useState<WallPostData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);

  // Post creation
  const [showCreatePost, setShowCreatePost] = useState(false);
  const [newPostText, setNewPostText] = useState('');
  const [newPostImage, setNewPostImage] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);

  // Comments
  const [expandedPost, setExpandedPost] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, CommentData[]>>({});
  const [commentText, setCommentText] = useState('');
  const [commentingPost, setCommentingPost] = useState<string | null>(null);

  // Leaderboard modal
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderEntry[]>([]);

  useEffect(() => {
    init();
  }, []);

  const init = async () => {
    const uid = await AsyncStorage.getItem('duelo_user_id');
    if (uid) setUserId(uid);
    await fetchDetail(uid || '');
    await fetchWall(uid || '');
    setLoading(false);
  };

  const fetchDetail = async (uid: string) => {
    try {
      const res = await fetch(`${API_URL}/api/category/${id}/detail?user_id=${uid}`);
      const data = await res.json();
      setDetail(data);
    } catch {}
  };

  const fetchWall = async (uid: string) => {
    try {
      const res = await fetch(`${API_URL}/api/category/${id}/wall?user_id=${uid}`);
      const data = await res.json();
      setPosts(data);
    } catch {}
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchDetail(userId);
    await fetchWall(userId);
    setRefreshing(false);
  };

  const handleFollow = async () => {
    if (!userId || followLoading) return;
    setFollowLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const res = await fetch(`${API_URL}/api/category/${id}/follow`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      });
      const data = await res.json();
      setDetail(prev => prev ? { ...prev, is_following: data.following, followers_count: prev.followers_count + (data.following ? 1 : -1) } : null);
    } catch {}
    setFollowLoading(false);
  };

  const handlePlay = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    router.push(`/matchmaking?category=${id}`);
  };

  const handleLeaderboard = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowLeaderboard(true);
    try {
      const res = await fetch(`${API_URL}/api/category/${id}/leaderboard`);
      const data = await res.json();
      setLeaderboard(data);
    } catch {}
  };

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.5,
      base64: true,
      allowsEditing: true,
    });
    if (!result.canceled && result.assets[0].base64) {
      setNewPostImage(`data:image/jpeg;base64,${result.assets[0].base64}`);
    }
  };

  const handleCreatePost = async () => {
    if (!newPostText.trim() || !userId || posting) return;
    setPosting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const res = await fetch(`${API_URL}/api/category/${id}/wall`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          content: newPostText.trim(),
          image_base64: newPostImage,
        }),
      });
      const data = await res.json();
      setPosts(prev => [data, ...prev]);
      setNewPostText('');
      setNewPostImage(null);
      setShowCreatePost(false);
    } catch {}
    setPosting(false);
  };

  const handleLike = async (postId: string) => {
    if (!userId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const res = await fetch(`${API_URL}/api/wall/${postId}/like`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      });
      const data = await res.json();
      setPosts(prev => prev.map(p => p.id === postId ? {
        ...p,
        is_liked: data.liked,
        likes_count: p.likes_count + (data.liked ? 1 : -1)
      } : p));
    } catch {}
  };

  const loadComments = async (postId: string) => {
    if (expandedPost === postId) {
      setExpandedPost(null);
      return;
    }
    setExpandedPost(postId);
    try {
      const res = await fetch(`${API_URL}/api/wall/${postId}/comments`);
      const data = await res.json();
      setComments(prev => ({ ...prev, [postId]: data }));
    } catch {}
  };

  const handleComment = async (postId: string) => {
    if (!commentText.trim() || !userId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const res = await fetch(`${API_URL}/api/wall/${postId}/comment`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, content: commentText.trim() }),
      });
      const data = await res.json();
      setComments(prev => ({ ...prev, [postId]: [...(prev[postId] || []), data] }));
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, comments_count: p.comments_count + 1 } : p));
      setCommentText('');
      setCommentingPost(null);
      Keyboard.dismiss();
    } catch {}
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
    return <View style={styles.loadingContainer}><ActivityIndicator size="large" color={meta.color} /></View>;
  }

  if (!detail) return null;

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={meta.color} />}
        >
          {/* Back button */}
          <TouchableOpacity data-testid="back-button" style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>← Retour</Text>
          </TouchableOpacity>

          {/* Category Header */}
          <View style={[styles.headerCard, { borderColor: meta.color + '30' }]}>
            <View style={styles.headerTop}>
              <View style={[styles.catImageBox, { backgroundColor: meta.color + '20' }]}>
                <Text style={styles.catEmoji}>{meta.icon}</Text>
              </View>
              <View style={styles.headerInfo}>
                <Text style={styles.catName}>{detail.name}</Text>
                <Text style={styles.catDescription}>{detail.description}</Text>
              </View>
            </View>

            {/* Action Buttons Row */}
            <View style={styles.actionsRow}>
              <TouchableOpacity data-testid="play-button" style={[styles.actionBtn, styles.playBtn]} onPress={handlePlay} activeOpacity={0.8}>
                <Text style={styles.playBtnIcon}>⚡</Text>
                <Text style={styles.playBtnText}>Jouer</Text>
              </TouchableOpacity>
              <TouchableOpacity
                data-testid="follow-button"
                style={[styles.actionBtn, detail.is_following ? styles.followingBtn : styles.followBtn]}
                onPress={handleFollow} activeOpacity={0.8} disabled={followLoading}
              >
                <Text style={styles.followIcon}>{detail.is_following ? '✓' : '+'}</Text>
                <Text style={[styles.followText, detail.is_following && { color: '#00FF9D' }]}>
                  {detail.is_following ? 'Suivi' : 'Suivre'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity data-testid="leaderboard-button" style={[styles.actionBtn, styles.leaderBtn]} onPress={handleLeaderboard} activeOpacity={0.8}>
                <Text style={styles.leaderIcon}>🏆</Text>
                <Text style={styles.leaderText}>Classement</Text>
              </TouchableOpacity>
            </View>

            {/* Progress Bar */}
            <View style={styles.progressSection}>
              <Text style={styles.progressLabel}>QUESTIONS COMPLÉTÉES</Text>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${detail.completion_pct}%`, backgroundColor: meta.color }]} />
                <Text style={styles.progressPct}>{detail.completion_pct}%</Text>
              </View>
            </View>

            {/* Stats Row */}
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>VOTRE NIVEAU</Text>
                <Text style={[styles.statValue, { color: meta.color }]}>{detail.user_level}</Text>
                <Text style={styles.statSub}>{detail.user_title}</Text>
              </View>
              <View style={[styles.statDivider, { backgroundColor: meta.color + '30' }]} />
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>FOLLOWERS</Text>
                <Text style={styles.statValue}>{detail.followers_count.toLocaleString()}</Text>
              </View>
              <View style={[styles.statDivider, { backgroundColor: meta.color + '30' }]} />
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>QUESTIONS</Text>
                <Text style={styles.statValue}>{detail.total_questions}</Text>
              </View>
            </View>
          </View>

          {/* Wall Header + Create Post */}
          <View style={styles.wallHeader}>
            <Text style={styles.wallTitle}>MUR DE LA COMMUNAUTÉ</Text>
            <TouchableOpacity
              data-testid="create-post-button"
              style={[styles.createPostBtn, { backgroundColor: meta.color + '20', borderColor: meta.color + '40' }]}
              onPress={() => setShowCreatePost(true)}
            >
              <Text style={[styles.createPostText, { color: meta.color }]}>+ Publier</Text>
            </TouchableOpacity>
          </View>

          {/* Wall Posts */}
          {posts.length === 0 ? (
            <View style={styles.emptyWall}>
              <Text style={styles.emptyIcon}>💬</Text>
              <Text style={styles.emptyText}>Sois le premier à publier !</Text>
              <Text style={styles.emptySub}>Partage tes opinions, records et trouvailles</Text>
            </View>
          ) : (
            posts.map(post => (
              <View key={post.id} data-testid={`post-card-${post.id}`} style={styles.postCard}>
                {/* Post Header */}
                <TouchableOpacity
                  style={styles.postHeader}
                  onPress={() => router.push(`/player-profile?id=${post.user.id}`)}
                  activeOpacity={0.7}
                >
                  <View style={styles.postAvatar}>
                    <Text style={styles.postAvatarText}>{post.user.pseudo[0]?.toUpperCase()}</Text>
                  </View>
                  <View style={styles.postUserInfo}>
                    <Text style={styles.postUsername}>{post.user.pseudo}</Text>
                    <Text style={styles.postTime}>{timeAgo(post.created_at)}</Text>
                  </View>
                </TouchableOpacity>

                {/* Post Content */}
                <Text style={styles.postContent}>{post.content}</Text>

                {/* Post Image */}
                {post.image_base64 && (
                  <Image source={{ uri: post.image_base64 }} style={styles.postImage} resizeMode="cover" />
                )}

                {/* Post Actions */}
                <View style={styles.postActions}>
                  <TouchableOpacity style={styles.postActionBtn} onPress={() => handleLike(post.id)}>
                    <Text style={[styles.postActionIcon, post.is_liked && { color: '#FF3B30' }]}>
                      {post.is_liked ? '❤️' : '🤍'}
                    </Text>
                    <Text style={[styles.postActionCount, post.is_liked && { color: '#FF3B30' }]}>
                      {post.likes_count}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.postActionBtn} onPress={() => loadComments(post.id)}>
                    <Text style={styles.postActionIcon}>💬</Text>
                    <Text style={styles.postActionCount}>{post.comments_count}</Text>
                  </TouchableOpacity>
                </View>

                {/* Comments Section */}
                {expandedPost === post.id && (
                  <View style={styles.commentsSection}>
                    {(comments[post.id] || []).map(c => (
                      <View key={c.id} style={styles.commentRow}>
                        <View style={styles.commentAvatar}>
                          <Text style={styles.commentAvatarText}>{c.user.pseudo[0]?.toUpperCase()}</Text>
                        </View>
                        <View style={styles.commentContent}>
                          <Text style={styles.commentUser}>{c.user.pseudo}</Text>
                          <Text style={styles.commentText}>{c.content}</Text>
                          <Text style={styles.commentTime}>{timeAgo(c.created_at)}</Text>
                        </View>
                      </View>
                    ))}
                    {/* Add comment input */}
                    <View style={styles.commentInputRow}>
                      <TextInput
                        style={styles.commentInput}
                        placeholder="Ajouter un commentaire..."
                        placeholderTextColor="#525252"
                        value={commentingPost === post.id ? commentText : ''}
                        onFocus={() => setCommentingPost(post.id)}
                        onChangeText={text => { setCommentingPost(post.id); setCommentText(text); }}
                        multiline
                      />
                      <TouchableOpacity
                        style={[styles.commentSend, { backgroundColor: meta.color }]}
                        onPress={() => handleComment(post.id)}
                      >
                        <Text style={styles.commentSendText}>↑</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            ))
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Create Post Modal */}
      <Modal visible={showCreatePost} transparent animationType="slide" onRequestClose={() => setShowCreatePost(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalOverlay}>
            <View style={styles.createModalContent}>
              <View style={styles.createModalHeader}>
                <TouchableOpacity onPress={() => { setShowCreatePost(false); setNewPostImage(null); setNewPostText(''); }}>
                  <Text style={styles.createModalCancel}>Annuler</Text>
                </TouchableOpacity>
                <Text style={styles.createModalTitle}>Nouveau post</Text>
                <TouchableOpacity
                  style={[styles.publishBtn, { backgroundColor: newPostText.trim() ? meta.color : '#333' }]}
                  onPress={handleCreatePost}
                  disabled={!newPostText.trim() || posting}
                >
                  {posting ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.publishText}>Publier</Text>}
                </TouchableOpacity>
              </View>

              <TextInput
                style={styles.postInput}
                placeholder="Partage quelque chose avec la communauté..."
                placeholderTextColor="#525252"
                value={newPostText}
                onChangeText={setNewPostText}
                multiline
                maxLength={500}
                autoFocus
              />

              {newPostImage && (
                <View style={styles.previewImageContainer}>
                  <Image source={{ uri: newPostImage }} style={styles.previewImage} resizeMode="cover" />
                  <TouchableOpacity style={styles.removeImage} onPress={() => setNewPostImage(null)}>
                    <Text style={styles.removeImageText}>✕</Text>
                  </TouchableOpacity>
                </View>
              )}

              <View style={styles.createModalActions}>
                <TouchableOpacity style={styles.mediaBtn} onPress={pickImage}>
                  <Text style={styles.mediaBtnText}>📷 Photo</Text>
                </TouchableOpacity>
                <Text style={styles.charCount}>{newPostText.length}/500</Text>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Leaderboard Modal */}
      <Modal visible={showLeaderboard} transparent animationType="slide" onRequestClose={() => setShowLeaderboard(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.leaderModalContent}>
            <View style={styles.leaderModalHeader}>
              <Text style={styles.leaderModalTitle}>🏆 Classement {detail.name}</Text>
              <TouchableOpacity onPress={() => setShowLeaderboard(false)}>
                <Text style={styles.leaderModalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            {leaderboard.length === 0 ? (
              <View style={styles.emptyLeader}>
                <Text style={styles.emptyLeaderText}>Aucun joueur classé pour le moment</Text>
              </View>
            ) : (
              <FlatList
                data={leaderboard}
                keyExtractor={item => item.pseudo}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.leaderRow}
                    onPress={() => {
                      setShowLeaderboard(false);
                      router.push(`/player-profile?id=${item.id}`);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.leaderRank,
                      item.rank === 1 && { color: '#FFD700' },
                      item.rank === 2 && { color: '#C0C0C0' },
                      item.rank === 3 && { color: '#CD7F32' },
                    ]}>#{item.rank}</Text>
                    <View style={[styles.leaderAvatar, { backgroundColor: meta.color + '40' }]}>
                      <Text style={styles.leaderAvatarText}>{item.pseudo[0]?.toUpperCase()}</Text>
                    </View>
                    <View style={styles.leaderInfo}>
                      <Text style={styles.leaderPseudo}>{item.pseudo}</Text>
                      <Text style={[styles.leaderTitle, { color: meta.color }]}>{item.title}</Text>
                    </View>
                    <View style={styles.leaderStats}>
                      <Text style={styles.leaderLevel}>Niv. {item.level}</Text>
                      <Text style={styles.leaderXp}>{item.xp.toLocaleString()} XP</Text>
                    </View>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  loadingContainer: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  scrollContent: { paddingBottom: 40 },

  // Back
  backBtn: { paddingHorizontal: 20, paddingVertical: 12 },
  backBtnText: { color: '#A3A3A3', fontSize: 15, fontWeight: '600' },

  // Header Card
  headerCard: {
    marginHorizontal: 16, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginBottom: 20,
  },
  headerTop: { flexDirection: 'row', marginBottom: 20 },
  catImageBox: { width: 80, height: 80, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  catEmoji: { fontSize: 42 },
  headerInfo: { flex: 1, justifyContent: 'center' },
  catName: { fontSize: 24, fontWeight: '900', color: '#FFF', marginBottom: 4 },
  catDescription: { fontSize: 14, color: '#A3A3A3', lineHeight: 20 },

  // Action Buttons
  actionsRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12, borderRadius: 14, gap: 6,
  },
  playBtn: { backgroundColor: '#8A2BE2' },
  playBtnIcon: { fontSize: 16 },
  playBtnText: { color: '#FFF', fontSize: 14, fontWeight: '800' },
  followBtn: {
    backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  followingBtn: {
    backgroundColor: 'rgba(0,255,157,0.1)', borderWidth: 1, borderColor: 'rgba(0,255,157,0.3)',
  },
  followIcon: { fontSize: 14, color: '#FFF', fontWeight: '800' },
  followText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  leaderBtn: {
    backgroundColor: 'rgba(255,215,0,0.1)', borderWidth: 1, borderColor: 'rgba(255,215,0,0.3)',
  },
  leaderIcon: { fontSize: 14 },
  leaderText: { color: '#FFD700', fontSize: 12, fontWeight: '700' },

  // Progress
  progressSection: { marginBottom: 20 },
  progressLabel: { fontSize: 11, fontWeight: '800', color: '#525252', letterSpacing: 2, marginBottom: 8 },
  progressBar: {
    height: 28, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 14,
    overflow: 'hidden', justifyContent: 'center',
  },
  progressFill: { position: 'absolute', height: 28, borderRadius: 14 },
  progressPct: { color: '#FFF', fontSize: 12, fontWeight: '800', textAlign: 'center', zIndex: 1 },

  // Stats Row
  statsRow: { flexDirection: 'row', alignItems: 'center' },
  statItem: { flex: 1, alignItems: 'center' },
  statLabel: { fontSize: 9, fontWeight: '800', color: '#525252', letterSpacing: 1, marginBottom: 6 },
  statValue: { fontSize: 28, fontWeight: '900', color: '#FFF' },
  statSub: { fontSize: 11, color: '#A3A3A3', fontWeight: '600', marginTop: 2 },
  statDivider: { width: 1, height: 40 },

  // Wall
  wallHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, marginBottom: 16,
  },
  wallTitle: { fontSize: 12, fontWeight: '800', color: '#525252', letterSpacing: 2 },
  createPostBtn: { borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8, borderWidth: 1 },
  createPostText: { fontSize: 13, fontWeight: '700' },

  emptyWall: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 40 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 18, fontWeight: '700', color: '#FFF', marginBottom: 4 },
  emptySub: { fontSize: 14, color: '#525252', textAlign: 'center' },

  // Post Card
  postCard: {
    marginHorizontal: 16, backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  postHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  postAvatar: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#8A2BE2',
    justifyContent: 'center', alignItems: 'center', marginRight: 10,
  },
  postAvatarText: { color: '#FFF', fontSize: 18, fontWeight: '800' },
  postUserInfo: { flex: 1 },
  postUsername: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  postTime: { color: '#525252', fontSize: 12, marginTop: 1 },
  postContent: { color: '#E0E0E0', fontSize: 15, lineHeight: 22, marginBottom: 12 },
  postImage: { width: '100%', height: 200, borderRadius: 12, marginBottom: 12 },

  // Post Actions
  postActions: { flexDirection: 'row', gap: 20 },
  postActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  postActionIcon: { fontSize: 18 },
  postActionCount: { color: '#A3A3A3', fontSize: 14, fontWeight: '600' },

  // Comments
  commentsSection: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  commentRow: { flexDirection: 'row', marginBottom: 12 },
  commentAvatar: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: '#333',
    justifyContent: 'center', alignItems: 'center', marginRight: 8,
  },
  commentAvatarText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  commentContent: { flex: 1 },
  commentUser: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  commentText: { color: '#D0D0D0', fontSize: 13, marginTop: 2 },
  commentTime: { color: '#525252', fontSize: 11, marginTop: 4 },
  commentInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  commentInput: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 10, color: '#FFF', fontSize: 14, maxHeight: 80,
  },
  commentSend: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  commentSendText: { color: '#FFF', fontSize: 18, fontWeight: '800' },

  // Create Post Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'flex-end' },
  createModalContent: {
    backgroundColor: '#1A1A1A', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40, minHeight: 300,
  },
  createModalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16,
  },
  createModalCancel: { color: '#A3A3A3', fontSize: 15, fontWeight: '600' },
  createModalTitle: { color: '#FFF', fontSize: 17, fontWeight: '800' },
  publishBtn: { borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 },
  publishText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  postInput: {
    color: '#FFF', fontSize: 16, minHeight: 100, textAlignVertical: 'top',
    lineHeight: 24,
  },
  previewImageContainer: { position: 'relative', marginBottom: 12 },
  previewImage: { width: '100%', height: 200, borderRadius: 12 },
  removeImage: {
    position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center',
  },
  removeImageText: { color: '#FFF', fontSize: 14, fontWeight: '800' },
  createModalActions: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', paddingTop: 12,
  },
  mediaBtn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.06)' },
  mediaBtnText: { color: '#A3A3A3', fontSize: 14 },
  charCount: { color: '#525252', fontSize: 13, fontWeight: '500' },

  // Leaderboard Modal
  leaderModalContent: {
    backgroundColor: '#1A1A1A', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40, maxHeight: '80%',
  },
  leaderModalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20,
  },
  leaderModalTitle: { color: '#FFF', fontSize: 20, fontWeight: '800' },
  leaderModalClose: { color: '#A3A3A3', fontSize: 22, fontWeight: '600', padding: 4 },
  emptyLeader: { alignItems: 'center', paddingVertical: 40 },
  emptyLeaderText: { color: '#525252', fontSize: 15 },
  leaderRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  leaderRank: { color: '#FFF', fontSize: 16, fontWeight: '800', width: 36, textAlign: 'center' },
  leaderAvatar: {
    width: 40, height: 40, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  leaderAvatarText: { color: '#FFF', fontSize: 18, fontWeight: '800' },
  leaderInfo: { flex: 1 },
  leaderPseudo: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  leaderTitle: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  leaderStats: { alignItems: 'flex-end' },
  leaderLevel: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  leaderXp: { color: '#525252', fontSize: 12, marginTop: 2 },
});
