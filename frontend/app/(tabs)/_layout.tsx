import { Tabs } from 'expo-router';
import { View, Text, Image, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import { GLASS } from '../../theme/glassTheme';

// Tab icon assets
const TAB_ICONS = {
  home: require('../../assets/tabs/home.webp'),
  social: require('../../assets/tabs/social.webp'),
  play: require('../../assets/tabs/play.webp'),
  themes: require('../../assets/tabs/themes.webp'),
  profile: require('../../assets/tabs/profile.webp'),
};

function TabIcon({ label, focused, iconSource }: { label: string; focused: boolean; iconSource: any }) {
  return (
    <View style={styles.tabItem}>
      <Image
        source={iconSource}
        style={styles.tabIconImage}
        resizeMode="contain"
      />
      <Text style={[styles.tabLabel, focused && styles.tabLabelActive]} numberOfLines={1}>{label}</Text>
      {focused && <View style={styles.activeIndicator} />}
    </View>
  );
}

function PlayTabIcon({ focused }: { focused: boolean }) {
  return (
    <View style={styles.playTabWrap}>
      <View style={[styles.playTabCircle, focused && styles.playTabCircleActive]}>
        <Image
          source={TAB_ICONS.play}
          style={styles.playTabIconImage}
          resizeMode="contain"
        />
      </View>
      <Text style={[styles.tabLabel, focused && styles.tabLabelActive, { marginTop: 4 }]}>Jouer</Text>
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarShowLabel: false,
        tabBarActiveTintColor: '#00FFFF',
        tabBarInactiveTintColor: '#00FFFF',
        tabBarItemStyle: { opacity: 1 },
        tabBarButton: (props) => (
          <TouchableOpacity
            {...props}
            activeOpacity={1}
            style={[props.style, { opacity: 1 }]}
          />
        ),
        sceneStyle: { backgroundColor: 'transparent' },
      }}
    >
      <Tabs.Screen
        name="accueil"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon label="Accueil" focused={focused} iconSource={TAB_ICONS.home} />,
        }}
      />
      <Tabs.Screen
        name="players"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon label="Social" focused={focused} iconSource={TAB_ICONS.social} />,
        }}
      />
      <Tabs.Screen
        name="home"
        options={{
          tabBarIcon: ({ focused }) => <PlayTabIcon focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="themes"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon label="Thèmes" focused={focused} iconSource={TAB_ICONS.themes} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarIcon: ({ focused }) => <TabIcon label="Profil" focused={focused} iconSource={TAB_ICONS.profile} />,
        }}
      />
      <Tabs.Screen
        name="leaderboard"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: GLASS.bgDark,
    borderTopWidth: 1,
    borderTopColor: GLASS.borderCyan,
    height: Platform.OS === 'ios' ? 88 : 68,
    paddingTop: 8,
    elevation: 0,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      } as any,
      default: {},
    }),
  },
  tabItem: { alignItems: 'center', justifyContent: 'center', paddingTop: 4, minWidth: 56 },
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
  playTabWrap: { alignItems: 'center', justifyContent: 'center', marginTop: -12 },
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
