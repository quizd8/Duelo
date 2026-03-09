import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { View, Text, Image, StyleSheet, Platform, TouchableOpacity, Dimensions, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { useRouter, usePathname, Slot } from 'expo-router';
import { GLASS } from '../../theme/glassTheme';

// Import screen components directly for the pager
import AccueilScreen from './accueil';
import PlayersScreen from './players';
import PlayScreen from './play';
import ThemesScreen from './themes';
import ProfileScreen from './profile';

// Tab icon assets
const TAB_ICONS = {
  home: require('../../assets/tabs/home.webp'),
  social: require('../../assets/tabs/social.webp'),
  play: require('../../assets/tabs/play.webp'),
  themes: require('../../assets/tabs/themes.webp'),
  profile: require('../../assets/tabs/profile.webp'),
};

const TAB_CONFIG = [
  { name: 'accueil', label: 'Accueil', icon: TAB_ICONS.home },
  { name: 'players', label: 'Social', icon: TAB_ICONS.social },
  { name: 'play', label: 'Jouer', icon: TAB_ICONS.play, isCenter: true },
  { name: 'themes', label: 'Thèmes', icon: TAB_ICONS.themes },
  { name: 'profile', label: 'Profil', icon: TAB_ICONS.profile },
];

const TAB_NAMES = TAB_CONFIG.map(t => t.name);
const TAB_COUNT = TAB_CONFIG.length;
const SCREENS = [AccueilScreen, PlayersScreen, PlayScreen, ThemesScreen, ProfileScreen];

const SPRING_CONFIG = { damping: 22, stiffness: 220, mass: 0.8 };

function CustomTabBar({ currentIndex, onTabPress }: { currentIndex: number; onTabPress: (index: number) => void }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.tabBar, { paddingBottom: insets.bottom > 0 ? insets.bottom : 8 }]}>
      {TAB_CONFIG.map((tab, index) => {
        const isFocused = currentIndex === index;

        if (tab.isCenter) {
          return (
            <TouchableOpacity key={tab.name} style={styles.playTabWrap} onPress={() => onTabPress(index)} activeOpacity={1}>
              <View style={[styles.playTabCircle, isFocused && styles.playTabCircleActive]}>
                <Image source={tab.icon} style={styles.playTabIconImage} resizeMode="contain" />
              </View>
              <Text style={[styles.tabLabel, isFocused && styles.tabLabelActive]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        }

        return (
          <TouchableOpacity key={tab.name} style={styles.tabItem} onPress={() => onTabPress(index)} activeOpacity={1}>
            <Image source={tab.icon} style={styles.tabIconImage} resizeMode="contain" />
            <Text style={[styles.tabLabel, isFocused && styles.tabLabelActive]}>{tab.label}</Text>
            {isFocused && <View style={styles.activeIndicator} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function TabLayout() {
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const translateX = useSharedValue(0);
  const currentIndex = useSharedValue(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [renderedPages, setRenderedPages] = useState<Set<number>>(new Set([0, 1]));

  // Pre-render adjacent pages when active index changes
  useEffect(() => {
    setRenderedPages(prev => {
      const next = new Set(prev);
      next.add(activeIndex);
      if (activeIndex > 0) next.add(activeIndex - 1);
      if (activeIndex < TAB_COUNT - 1) next.add(activeIndex + 1);
      return next;
    });
  }, [activeIndex]);

  // Handle external navigation (e.g., from results screen back to a tab)
  const pathname = usePathname();
  const lastSyncedPath = useRef('');

  useEffect(() => {
    if (!pathname) return;
    const tabName = pathname.split('/').pop();
    if (!tabName || tabName === lastSyncedPath.current) return;
    const idx = TAB_NAMES.indexOf(tabName);
    if (idx >= 0 && idx !== activeIndex) {
      lastSyncedPath.current = tabName;
      currentIndex.value = idx;
      translateX.value = -idx * SCREEN_WIDTH;
      setActiveIndex(idx);
    }
  }, [pathname, SCREEN_WIDTH]);

  const updateActiveIndex = useCallback((idx: number) => {
    setActiveIndex(idx);
    lastSyncedPath.current = TAB_NAMES[idx];
  }, []);

  const panGesture = Gesture.Pan()
    .activeOffsetX([-30, 30])
    .failOffsetY([-15, 15])
    .onUpdate((e) => {
      'worklet';
      const rawTranslate = -currentIndex.value * SCREEN_WIDTH + e.translationX;
      const maxTranslate = 0;
      const minTranslate = -(TAB_COUNT - 1) * SCREEN_WIDTH;

      // Rubber band effect at edges
      if (rawTranslate > maxTranslate) {
        translateX.value = rawTranslate * 0.25;
      } else if (rawTranslate < minTranslate) {
        translateX.value = minTranslate + (rawTranslate - minTranslate) * 0.25;
      } else {
        translateX.value = rawTranslate;
      }
    })
    .onEnd((e) => {
      'worklet';
      const curPage = currentIndex.value;
      let newPage = curPage;

      const threshold = SCREEN_WIDTH / 3;
      const isHorizontal = Math.abs(e.translationX) > Math.abs(e.translationY) * 1.2;

      if (isHorizontal) {
        if (e.translationX < -threshold || (e.translationX < -30 && e.velocityX < -500)) {
          newPage = Math.min(curPage + 1, TAB_COUNT - 1);
        } else if (e.translationX > threshold || (e.translationX > 30 && e.velocityX > 500)) {
          newPage = Math.max(curPage - 1, 0);
        }
      }

      currentIndex.value = newPage;
      translateX.value = withSpring(-newPage * SCREEN_WIDTH, SPRING_CONFIG);
      runOnJS(updateActiveIndex)(newPage);
    });

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const onTabPress = useCallback((index: number) => {
    currentIndex.value = index;
    translateX.value = withTiming(-index * SCREEN_WIDTH, { duration: 300 });
    setActiveIndex(index);
    lastSyncedPath.current = TAB_NAMES[index];
  }, [SCREEN_WIDTH]);

  return (
    <View style={styles.container}>
      {/* Hidden Slot for expo-router compatibility */}
      <View style={styles.hiddenSlot} pointerEvents="none">
        <Slot />
      </View>

      {/* Custom swipeable pager */}
      <View style={styles.pagerContainer}>
        <GestureDetector gesture={panGesture}>
          <Animated.View style={[styles.pagerStrip, containerStyle]}>
            {SCREENS.map((ScreenComponent, idx) => (
              <View key={idx} style={[styles.page, { width: SCREEN_WIDTH }]}>
                {renderedPages.has(idx) ? <ScreenComponent /> : <View style={styles.placeholder} />}
              </View>
            ))}
          </Animated.View>
        </GestureDetector>
      </View>

      <CustomTabBar currentIndex={activeIndex} onTabPress={onTabPress} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050510',
  },
  hiddenSlot: {
    position: 'absolute',
    width: 1,
    height: 1,
    overflow: 'hidden',
    opacity: 0,
  },
  pagerContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  pagerStrip: {
    flexDirection: 'row',
    flex: 1,
  },
  page: {
    overflow: 'hidden',
  },
  placeholder: {
    flex: 1,
    backgroundColor: '#050510',
  },
  tabBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    backgroundColor: GLASS.bgDark,
    borderTopWidth: 1,
    borderTopColor: GLASS.borderCyan,
    paddingTop: 8,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      } as any,
      default: {},
    }),
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 4,
    minWidth: 56,
  },
  tabIconImage: {
    width: 40,
    height: 40,
  },
  tabLabel: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 3,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif',
    letterSpacing: 0.5,
  },
  tabLabelActive: { color: '#00FFFF' },
  activeIndicator: {
    width: 4, height: 4, borderRadius: 2,
    backgroundColor: '#00FFFF', marginTop: 3,
    shadowColor: '#00FFFF', shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8, shadowRadius: 6,
  },
  playTabWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -12,
  },
  playTabCircle: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: '#8A2BE2', justifyContent: 'center', alignItems: 'center',
    borderWidth: 1.5, borderColor: 'rgba(0, 255, 255, 0.4)',
    shadowColor: '#00FFFF', shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
  },
  playTabCircleActive: {
    backgroundColor: '#9B3FFF',
    borderColor: 'rgba(0, 255, 255, 0.7)',
    shadowOpacity: 0.7, shadowRadius: 16,
  },
  playTabIconImage: {
    width: 38,
    height: 38,
  },
});
