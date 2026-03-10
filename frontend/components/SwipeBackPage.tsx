import React, { useEffect } from 'react';
import { View, StyleSheet, useWindowDimensions, Platform } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';

const SPRING_CONFIG = { damping: 22, stiffness: 220, mass: 0.8 };

interface SwipeBackPageProps {
  children: React.ReactNode;
}

export default function SwipeBackPage({ children }: SwipeBackPageProps) {
  const router = useRouter();
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const translateX = useSharedValue(SCREEN_WIDTH); // Start off-screen (right)

  // Entry animation: slide in from the right
  useEffect(() => {
    translateX.value = withTiming(0, { duration: 300 });
  }, []);

  const goBack = () => {
    router.back();
  };

  const panGesture = Gesture.Pan()
    .activeOffsetX(20)       // Activate after 20px horizontal movement right
    .failOffsetX(-10)        // Fail if user swipes left
    .failOffsetY([-15, 15])  // Fail if user scrolls vertically
    .onUpdate((e) => {
      'worklet';
      // Only allow right swipe (positive translation)
      translateX.value = Math.max(0, e.translationX);
    })
    .onEnd((e) => {
      'worklet';
      const threshold = SCREEN_WIDTH * 0.3;
      if (
        e.translationX > threshold ||
        (e.translationX > 40 && e.velocityX > 500)
      ) {
        // Swipe completed - slide page out and go back
        translateX.value = withTiming(SCREEN_WIDTH, { duration: 220 }, () => {
          runOnJS(goBack)();
        });
      } else {
        // Swipe cancelled - spring back
        translateX.value = withSpring(0, SPRING_CONFIG);
      }
    });

  // Page slides right following the finger
  const pageStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  // Semi-transparent overlay that dims the tab page behind
  // Fades from dark (page covering tabs) to clear (tabs visible)
  const overlayStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateX.value,
      [0, SCREEN_WIDTH],
      [0.5, 0],
      Extrapolation.CLAMP,
    ),
  }));

  return (
    <View style={styles.container}>
      {/* Dark overlay on top of the visible tab page */}
      <Animated.View style={[styles.dimOverlay, overlayStyle]} pointerEvents="none" />

      {/* Sliding page content */}
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.page, pageStyle]}>
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent', // Transparent to show the tab page behind
  },
  dimOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    zIndex: 0,
  },
  page: {
    flex: 1,
    backgroundColor: '#050510',
    zIndex: 1,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: -8, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 16,
      },
      android: {
        elevation: 16,
      },
      web: {
        boxShadow: '-10px 0px 30px rgba(0, 0, 0, 0.7)',
      } as any,
    }),
  },
});
