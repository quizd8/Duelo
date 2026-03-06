import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput, FlatList,
  ActivityIndicator, KeyboardAvoidingView, Platform, Keyboard
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

type Message = {
  id: string; sender_id: string; receiver_id: string;
  content: string; read: boolean; created_at: string;
};

export default function ChatScreen() {
  const router = useRouter();
  const { partnerId, partnerPseudo } = useLocalSearchParams<{ partnerId: string; partnerPseudo: string }>();
  const [myId, setMyId] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    init();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const init = async () => {
    const uid = await AsyncStorage.getItem('duelo_user_id');
    if (uid) {
      setMyId(uid);
      await fetchMessages(uid);
      // Poll every 5s
      pollRef.current = setInterval(() => fetchMessages(uid), 5000);
    }
    setLoading(false);
  };

  const fetchMessages = async (uid: string) => {
    try {
      const res = await fetch(`${API_URL}/api/chat/${uid}/messages?with_user=${partnerId}`);
      const data = await res.json();
      setMessages(data);
    } catch {}
  };

  const handleSend = async () => {
    if (!text.trim() || !myId || sending) return;
    setSending(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const res = await fetch(`${API_URL}/api/chat/send`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender_id: myId, receiver_id: partnerId, content: text.trim() }),
      });
      if (res.ok) {
        setText('');
        Keyboard.dismiss();
        await fetchMessages(myId);
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
      }
    } catch {}
    setSending(false);
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
    const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    if (diffDays === 0) return time;
    if (diffDays === 1) return `Hier ${time}`;
    if (diffDays < 7) return `${d.toLocaleDateString('fr-FR', { weekday: 'short' })} ${time}`;
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) + ` ${time}`;
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isMe = item.sender_id === myId;
    return (
      <View style={[st.msgRow, isMe ? st.msgRowRight : st.msgRowLeft]}>
        <View style={[st.msgBubble, isMe ? st.myBubble : st.theirBubble]}>
          <Text style={[st.msgText, isMe ? st.myText : st.theirText]}>{item.content}</Text>
          <Text style={[st.msgTime, isMe ? st.myTime : st.theirTime]}>{formatTime(item.created_at)}</Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return <View style={st.loadingContainer}><ActivityIndicator size="large" color="#8A2BE2" /></View>;
  }

  return (
    <SafeAreaView style={st.container}>
      {/* Header */}
      <View style={st.header}>
        <TouchableOpacity data-testid="chat-back-button" onPress={() => router.back()} style={st.headerBack}>
          <Text style={st.headerBackText}>←</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={st.headerCenter}
          onPress={() => router.push(`/player-profile?id=${partnerId}`)}
        >
          <View style={st.headerAvatar}>
            <Text style={st.headerAvatarText}>{(partnerPseudo || '?')[0]?.toUpperCase()}</Text>
          </View>
          <View>
            <Text style={st.headerName}>{partnerPseudo || 'Joueur'}</Text>
            <Text style={st.headerSub}>Messages supprimés après 7 jours</Text>
          </View>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Messages */}
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={item => item.id}
          renderItem={renderMessage}
          contentContainerStyle={st.messagesList}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <View style={st.emptyChat}>
              <Text style={st.emptyChatIcon}>💬</Text>
              <Text style={st.emptyChatText}>Commencez la conversation !</Text>
              <Text style={st.emptyChatSub}>Les messages sont supprimés après 7 jours</Text>
            </View>
          }
        />

        {/* Input */}
        <View style={st.inputRow}>
          <TextInput
            data-testid="chat-input"
            style={st.input}
            placeholder="Votre message..."
            placeholderTextColor="#525252"
            value={text}
            onChangeText={setText}
            multiline
            maxLength={500}
          />
          <TouchableOpacity
            data-testid="chat-send-button"
            style={[st.sendBtn, text.trim() ? st.sendBtnActive : null]}
            onPress={handleSend}
            disabled={!text.trim() || sending}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Text style={st.sendBtnText}>↑</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  loadingContainer: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  headerBack: { padding: 8 },
  headerBackText: { color: '#A3A3A3', fontSize: 22, fontWeight: '600' },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, marginLeft: 8 },
  headerAvatar: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#8A2BE2',
    justifyContent: 'center', alignItems: 'center',
  },
  headerAvatarText: { color: '#FFF', fontSize: 18, fontWeight: '800' },
  headerName: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  headerSub: { color: '#525252', fontSize: 11, marginTop: 1 },

  // Messages
  messagesList: { paddingHorizontal: 16, paddingVertical: 12, flexGrow: 1, justifyContent: 'flex-end' },

  msgRow: { marginBottom: 8 },
  msgRowRight: { alignItems: 'flex-end' },
  msgRowLeft: { alignItems: 'flex-start' },

  msgBubble: { maxWidth: '78%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  myBubble: { backgroundColor: '#8A2BE2', borderBottomRightRadius: 4 },
  theirBubble: { backgroundColor: 'rgba(255,255,255,0.08)', borderBottomLeftRadius: 4 },

  msgText: { fontSize: 15, lineHeight: 21 },
  myText: { color: '#FFF' },
  theirText: { color: '#E0E0E0' },

  msgTime: { fontSize: 10, marginTop: 4 },
  myTime: { color: 'rgba(255,255,255,0.5)', textAlign: 'right' },
  theirTime: { color: '#525252' },

  // Empty
  emptyChat: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 80 },
  emptyChatIcon: { fontSize: 48, marginBottom: 12 },
  emptyChatText: { color: '#FFF', fontSize: 18, fontWeight: '700', marginBottom: 4 },
  emptyChatSub: { color: '#525252', fontSize: 13 },

  // Input
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 12, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)', gap: 8,
  },
  input: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 22,
    paddingHorizontal: 16, paddingVertical: 12, color: '#FFF', fontSize: 15, maxHeight: 100,
  },
  sendBtn: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: '#333',
    justifyContent: 'center', alignItems: 'center',
  },
  sendBtnActive: { backgroundColor: '#8A2BE2' },
  sendBtnText: { color: '#FFF', fontSize: 20, fontWeight: '800' },
});
