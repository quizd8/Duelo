import React from 'react';
import { Image, StyleSheet, View, Platform, ImageBackground } from 'react-native';

const BG_IMAGE = require('../assets/images/fond_duelo.webp');

export default function CosmicBackground({ children }: { children: React.ReactNode }) {
  if (Platform.OS !== 'web') {
    return (
      <ImageBackground source={BG_IMAGE} style={styles.bg} resizeMode="cover">
        <View style={styles.overlay} />
        {children}
      </ImageBackground>
    );
  }

  // Web: render background with Image component (no focus hook needed)
  return (
    <View style={styles.bg}>
      <Image source={BG_IMAGE} style={styles.bgImage} resizeMode="cover" />
      <View style={styles.overlay} />
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  bg: {
    flex: 1,
    backgroundColor: '#050510',
  },
  bgImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%' as any,
    height: '100%' as any,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 10, 0.15)',
  },
  content: {
    flex: 1,
  },
});
