import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

// Header pages that support swipe-back to the last tab
const SWIPEABLE_HEADER_SCREENS = ['search', 'conversations', 'notifications'];

const swipeableScreenOptions = {
  headerShown: false,
  presentation: 'containedTransparentModal' as const,
  animation: 'none' as const,
  contentStyle: { backgroundColor: 'transparent' },
  gestureEnabled: false,
};

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.root}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#050510' },
          animation: Platform.OS === 'web' ? 'none' : 'slide_from_right',
          animationDuration: 300,
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="search" options={swipeableScreenOptions} />
        <Stack.Screen name="conversations" options={swipeableScreenOptions} />
        <Stack.Screen name="notifications" options={swipeableScreenOptions} />
      </Stack>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#050510',
  },
});
