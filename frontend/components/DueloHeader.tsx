import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

// Header icon assets
const HEADER_ICONS = {
  search: require('../assets/header/search.png'),
  message: require('../assets/header/message.png'),
  notification: require('../assets/header/notification.png'),
};

export default function DueloHeader() {
  const router = useRouter();
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifCount, setNotifCount] = useState(0);

  useEffect(() => {
    fetchUnread();
    fetchNotifCount();
    const interval = setInterval(() => {
      fetchUnread();
      fetchNotifCount();
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  const fetchUnread = async () => {
    const userId = await AsyncStorage.getItem('duelo_user_id');
    if (!userId) return;
    try {
      const res = await fetch(`${API_URL}/api/chat/unread-count/${userId}`);
      const data = await res.json();
      setUnreadCount(data.unread_count || 0);
    } catch {}
  };

  const fetchNotifCount = async () => {
    const userId = await AsyncStorage.getItem('duelo_user_id');
    if (!userId) return;
    try {
      const res = await fetch(`${API_URL}/api/notifications/${userId}/unread-count`);
      const data = await res.json();
      setNotifCount(data.unread_count || 0);
    } catch {}
  };

  return (
    <View style={styles.header}>
      {/* Left: Search */}
      <TouchableOpacity
        style={styles.iconBtn}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push('/search');
        }}
        activeOpacity={0.7}
      >
        <Image source={HEADER_ICONS.search} style={styles.headerIcon} resizeMode="contain" />
      </TouchableOpacity>

      {/* Center: DUELO */}
      <Text style={styles.logo}>DUELO</Text>

      {/* Right: Messages + Notifications */}
      <View style={styles.rightIcons}>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push('/(tabs)/players');
          }}
          activeOpacity={0.7}
        >
          <Image source={HEADER_ICONS.message} style={styles.headerIcon} resizeMode="contain" />
          {unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push('/notifications');
          }}
          activeOpacity={0.7}
        >
          <Image source={HEADER_ICONS.notification} style={styles.headerIcon} resizeMode="contain" />
          {notifCount > 0 && (
            <View style={styles.notifBadge}>
              <Text style={styles.badgeText}>{notifCount > 9 ? '9+' : notifCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  headerIcon: {
    width: 28,
    height: 28,
  },
  logo: {
    fontSize: 22,
    fontWeight: '900',
    color: '#8A2BE2',
    letterSpacing: 6,
  },
  rightIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '800',
  },
  notifBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FF6B35',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
});
