import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DueloHeader from '../../components/DueloHeader';

export default function ThemesScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <DueloHeader />
      <View style={styles.content}>
        <Text style={styles.icon}>📚</Text>
        <Text style={styles.title}>Thèmes</Text>
        <Text style={styles.subtitle}>Bientôt disponible</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  icon: { fontSize: 56, marginBottom: 16 },
  title: { fontSize: 24, fontWeight: '800', color: '#FFF', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#525252', fontWeight: '600' },
});
