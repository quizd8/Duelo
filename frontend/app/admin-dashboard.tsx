import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

const CATEGORIES = [
  { id: 'series_tv', name: 'Séries TV Cultes', icon: '📺' },
  { id: 'geographie', name: 'Géographie Mondiale', icon: '🌍' },
  { id: 'histoire', name: 'Histoire de France', icon: '🏛️' },
];

const SAMPLE_JSON = `[
  {
    "question_text": "Votre question ici ?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correct_option": 0,
    "difficulty": "medium"
  }
]`;

export default function AdminDashboard() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');

  const [selectedCategory, setSelectedCategory] = useState(CATEGORIES[0].id);
  const [jsonText, setJsonText] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{
    imported: number; duplicates: number; errors: string[];
  } | null>(null);

  const verifyPassword = async () => {
    setAuthLoading(true);
    setAuthError('');
    try {
      const res = await fetch(`${API_URL}/api/admin/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setIsAuthenticated(true);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setAuthError('Mot de passe incorrect');
      }
    } catch {
      setAuthError('Erreur de connexion');
    }
    setAuthLoading(false);
  };

  const importQuestions = async () => {
    if (!jsonText.trim()) return;
    setImporting(true);
    setResult(null);

    try {
      const parsed = JSON.parse(jsonText);
      if (!Array.isArray(parsed)) {
        setResult({ imported: 0, duplicates: 0, errors: ['Le JSON doit être un tableau'] });
        setImporting(false);
        return;
      }

      const res = await fetch(`${API_URL}/api/admin/import-questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: selectedCategory, questions: parsed }),
      });
      const data = await res.json();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setResult(data);
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setResult({ imported: 0, duplicates: 0, errors: ['JSON invalide: ' + e.message] });
    }
    setImporting(false);
  };

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.authContent}>
          <TouchableOpacity testID="admin-back-btn" style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backText}>← Retour</Text>
          </TouchableOpacity>

          <View style={styles.authCard}>
            <Text style={styles.authIcon}>🔐</Text>
            <Text style={styles.authTitle}>Admin Dashboard</Text>
            <Text style={styles.authHint}>Entrez le mot de passe administrateur</Text>

            <TextInput
              testID="admin-password-input"
              style={styles.passwordInput}
              placeholder="Mot de passe"
              placeholderTextColor="#525252"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
            />

            {authError ? <Text style={styles.errorText}>{authError}</Text> : null}

            <TouchableOpacity
              testID="admin-login-btn"
              style={styles.authButton}
              onPress={verifyPassword}
              disabled={authLoading}
              activeOpacity={0.8}
            >
              {authLoading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.authButtonText}>ACCÉDER</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <TouchableOpacity testID="admin-back-main" onPress={() => router.back()}>
              <Text style={styles.backText}>← Retour</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Content Factory</Text>
          </View>

          {/* Category Selector */}
          <Text style={styles.sectionTitle}>CATÉGORIE</Text>
          <View style={styles.categorySelector}>
            {CATEGORIES.map((cat) => (
              <TouchableOpacity
                testID={`admin-cat-${cat.id}`}
                key={cat.id}
                style={[styles.catOption, selectedCategory === cat.id && styles.catOptionActive]}
                onPress={() => setSelectedCategory(cat.id)}
                activeOpacity={0.7}
              >
                <Text style={styles.catIcon}>{cat.icon}</Text>
                <Text style={[styles.catName, selectedCategory === cat.id && styles.catNameActive]}>
                  {cat.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* JSON Input */}
          <Text style={styles.sectionTitle}>QUESTIONS JSON</Text>
          <TextInput
            testID="json-textarea"
            style={styles.jsonInput}
            placeholder={SAMPLE_JSON}
            placeholderTextColor="#333"
            value={jsonText}
            onChangeText={setJsonText}
            multiline
            textAlignVertical="top"
            autoCapitalize="none"
            autoCorrect={false}
          />

          {/* Import Button */}
          <TouchableOpacity
            testID="import-btn"
            style={[styles.importButton, (!jsonText.trim() || importing) && styles.importDisabled]}
            onPress={importQuestions}
            disabled={!jsonText.trim() || importing}
            activeOpacity={0.8}
          >
            {importing ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.importText}>IMPORTER EN MASSE</Text>
            )}
          </TouchableOpacity>

          {/* Result */}
          {result && (
            <View style={styles.resultCard}>
              <Text style={styles.resultTitle}>Résultat de l'import</Text>
              <View style={styles.resultRow}>
                <Text style={styles.resultLabel}>Importées :</Text>
                <Text style={[styles.resultValue, { color: '#00FF9D' }]}>{result.imported}</Text>
              </View>
              <View style={styles.resultRow}>
                <Text style={styles.resultLabel}>Doublons :</Text>
                <Text style={[styles.resultValue, { color: '#FFD700' }]}>{result.duplicates}</Text>
              </View>
              {result.errors.length > 0 && (
                <View>
                  <Text style={[styles.resultLabel, { color: '#FF3B30', marginTop: 8 }]}>Erreurs :</Text>
                  {result.errors.map((err, i) => (
                    <Text key={i} style={styles.errorItem}>• {err}</Text>
                  ))}
                </View>
              )}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  authContent: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  backButton: { marginBottom: 24 },
  backText: { color: '#8A2BE2', fontSize: 16, fontWeight: '600' },
  authCard: {
    backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 20, padding: 28,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', alignItems: 'center',
  },
  authIcon: { fontSize: 40, marginBottom: 16 },
  authTitle: { fontSize: 24, fontWeight: '800', color: '#FFF', marginBottom: 6 },
  authHint: { fontSize: 13, color: '#525252', marginBottom: 24 },
  passwordInput: {
    width: '100%', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 14,
    padding: 16, fontSize: 16, color: '#FFF', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    marginBottom: 8,
  },
  errorText: { color: '#FF3B30', fontSize: 12, marginBottom: 8 },
  authButton: {
    width: '100%', backgroundColor: '#8A2BE2', borderRadius: 14, padding: 18,
    alignItems: 'center', marginTop: 8,
  },
  authButtonText: { color: '#FFF', fontSize: 16, fontWeight: '800', letterSpacing: 2 },
  scroll: { paddingHorizontal: 20, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 16 },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#FFF' },
  sectionTitle: { fontSize: 12, fontWeight: '800', color: '#525252', letterSpacing: 3, marginBottom: 12, marginTop: 20 },
  categorySelector: { gap: 8 },
  catOption: {
    flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  catOptionActive: { borderColor: '#8A2BE2', backgroundColor: 'rgba(138,43,226,0.1)' },
  catIcon: { fontSize: 20, marginRight: 12 },
  catName: { color: '#A3A3A3', fontSize: 15, fontWeight: '600' },
  catNameActive: { color: '#FFF' },
  jsonInput: {
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 16,
    color: '#FFF', fontSize: 13, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    minHeight: 200, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  importButton: {
    backgroundColor: '#8A2BE2', borderRadius: 14, padding: 18,
    alignItems: 'center', marginTop: 16,
  },
  importDisabled: { opacity: 0.4 },
  importText: { color: '#FFF', fontSize: 16, fontWeight: '800', letterSpacing: 2 },
  resultCard: {
    backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 14, padding: 20,
    marginTop: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  resultTitle: { fontSize: 16, fontWeight: '700', color: '#FFF', marginBottom: 12 },
  resultRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  resultLabel: { color: '#A3A3A3', fontSize: 14 },
  resultValue: { fontSize: 14, fontWeight: '700' },
  errorItem: { color: '#FF3B30', fontSize: 12, marginTop: 4 },
});
