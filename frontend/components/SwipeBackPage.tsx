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
import * as Haptics from 'expo-haptics';
import { useSwipeBackProgress } from './SwipeBackContext';

const SPRING_CONFIG = { damping: 22, stiffness: 220, mass: 0.8 };
const SWIPE_THRESHOLD_RATIO = 0.3;
const IS_WEB = Platform.OS === 'web';

interface SwipeBackPageProps {
  children: React.ReactNode;
}

export default function SwipeBackPage({ children }: SwipeBackPageProps) {
  const router = useRouter();
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  // On web: start off-screen for custom entry animation
  // On native: start at 0, native stack handles entry animation
  const translateX = useSharedValue(IS_WEB ? SCREEN_WIDTH : 0);
  const parallaxProgress = useSwipeBackProgress();
  const hasTriggeredHaptic = useSharedValue(false);

  useEffect(() => {
    if (IS_WEB) {
      // Web: custom slide-in animation
      translateX.value = withTiming(0, { duration: 300 });
    }
    // Activate parallax (1 = page covering tabs)
    if (parallaxProgress) {
      parallaxProgress.value = withTiming(1, { duration: 300 });
    }
    return () => {
      if (parallaxProgress) {
        parallaxProgress.value = 0;
      }
    };
  }, []);

  const triggerHaptic = () => {
    if (!IS_WEB) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const goBack = () => {
    router.back();
  };

  const panGesture = Gesture.Pan()
    // Touch-friendly thresholds (more tolerant for finger input)
    .activeOffsetX(IS_WEB ? 20 : 15)
    .failOffsetX(IS_WEB ? -10 : -20)
    .failOffsetY(IS_WEB ? [-15, 15] : [-25, 25])
    .onStart(() => {
      'worklet';
      hasTriggeredHaptic.value = false;
    })
    .onUpdate((e) => {
      'worklet';
      const tx = Math.max(0, e.translationX);
      translateX.value = tx;

      // Parallax: 1 = fully covering, 0 = fully swiped away
      const progress = 1 - (tx / SCREEN_WIDTH);
      if (parallaxProgress) {
        parallaxProgress.value = Math.max(0, progress);
      }

      // Haptic feedback at threshold
      const threshold = SCREEN_WIDTH * SWIPE_THRESHOLD_RATIO;
      if (tx > threshold && !hasTriggeredHaptic.value) {
        hasTriggeredHaptic.value = true;
        runOnJS(triggerHaptic)();
      } else if (tx < threshold) {
        hasTriggeredHaptic.value = false;
      }
    })
    .onEnd((e) => {
      'worklet';
      const threshold = SCREEN_WIDTH * SWIPE_THRESHOLD_RATIO;
      if (
        e.translationX > threshold ||
        (e.translationX > 40 && e.velocityX > 500)
      ) {
        // Swipe completed
        translateX.value = withTiming(SCREEN_WIDTH, { duration: 220 }, () => {
          if (parallaxProgress) parallaxProgress.value = 0;
          runOnJS(goBack)();
        });
        if (parallaxProgress) {
          parallaxProgress.value = withTiming(0, { duration: 220 });
        }
      } else {
        // Swipe cancelled
        translateX.value = withSpring(0, SPRING_CONFIG);
        if (parallaxProgress) {
          parallaxProgress.value = withSpring(1, SPRING_CONFIG);
        }
      }
    });

  const pageStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

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
      <Animated.View style={[styles.dimOverlay, overlayStyle]} pointerEvents="none" />
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
    backgroundColor: 'transparent',
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
