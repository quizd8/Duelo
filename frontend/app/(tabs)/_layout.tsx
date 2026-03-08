import { Tabs } from 'expo-router';
import { View, Text, Image, StyleSheet, Platform } from 'react-native';

// Tab icon assets
const TAB_ICONS = {
  home: require('../../assets/tabs/home.png'),
  social: require('../../assets/tabs/social.png'),
  play: require('../../assets/tabs/play.png'),
  themes: require('../../assets/tabs/themes.png'),
  profile: require('../../assets/tabs/profile.png'),
};

function TabIcon({ label, focused, iconSource }: { label: string; focused: boolean; iconSource: any }) {
  return (
    <View style={styles.tabItem}>
      <Image
        source={iconSource}
        style={[
          styles.tabIconImage,
          { opacity: focused ? 1 : 0.45 },
        ]}
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
        tabBarActiveTintColor: '#8A2BE2',
        tabBarInactiveTintColor: '#525252',
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
    backgroundColor: '#0A0A0A',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    height: Platform.OS === 'ios' ? 88 : 68,
    paddingTop: 8,
    elevation: 0,
  },
  tabItem: { alignItems: 'center', justifyContent: 'center', paddingTop: 4, minWidth: 56 },
  tabIconImage: {
    width: 26,
    height: 26,
  },
  tabLabel: { fontSize: 9, color: '#525252', marginTop: 3, fontWeight: '600' },
  tabLabelActive: { color: '#8A2BE2' },
  activeIndicator: {
    width: 4, height: 4, borderRadius: 2,
    backgroundColor: '#8A2BE2', marginTop: 3,
    shadowColor: '#8A2BE2', shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8, shadowRadius: 4,
  },
  playTabWrap: { alignItems: 'center', justifyContent: 'center', marginTop: -12 },
  playTabCircle: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: '#8A2BE2', justifyContent: 'center', alignItems: 'center',
    shadowColor: '#8A2BE2', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5, shadowRadius: 12, elevation: 8,
  },
  playTabCircleActive: {
    backgroundColor: '#9B3FFF',
    shadowOpacity: 0.8, shadowRadius: 16,
  },
  playTabIconImage: {
    width: 30,
    height: 30,
  },
});
