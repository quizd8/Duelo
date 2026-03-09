import { Tabs } from 'expo-router';
import { View, Text, Image, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GLASS } from '../../theme/glassTheme';

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

function CustomTabBar({ state, navigation }: any) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.tabBar, { paddingBottom: insets.bottom > 0 ? insets.bottom : 8 }]}>
      {TAB_CONFIG.map((tab, index) => {
        const isFocused = state.index === index;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: state.routes[index]?.key,
            canPreventDefault: true,
          });
          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(state.routes[index]?.name);
          }
        };

        if (tab.isCenter) {
          return (
            <TouchableOpacity key={tab.name} style={styles.playTabWrap} onPress={onPress} activeOpacity={1}>
              <View style={[styles.playTabCircle, isFocused && styles.playTabCircleActive]}>
                <Image source={tab.icon} style={styles.playTabIconImage} resizeMode="contain" />
              </View>
              <Text style={[styles.tabLabel, isFocused && styles.tabLabelActive]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        }

        return (
          <TouchableOpacity key={tab.name} style={styles.tabItem} onPress={onPress} activeOpacity={1}>
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
  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        lazy: true,
        sceneStyle: { backgroundColor: '#050510' },
      }}
    >
      <Tabs.Screen name="accueil" />
      <Tabs.Screen name="players" />
      <Tabs.Screen name="play" />
      <Tabs.Screen name="themes" />
      <Tabs.Screen name="profile" />
      <Tabs.Screen name="leaderboard" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
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
