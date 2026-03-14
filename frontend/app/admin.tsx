import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput,
  Alert, ActivityIndicator, Platform, KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import Papa from 'papaparse';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

// Expected CSV columns
const EXPECTED_COLUMNS = [
  'id', 'category', 'question_text', 'option_a', 'option_b',
  'option_c', 'option_d', 'correct_option', 'difficulty', 'angle', 'batch',
];

type QuestionRow = {
  id?: string;
  category: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: string;
  difficulty?: string;
  angle?: string;
  batch?: string;
};

type ImportResult = {
  success: boolean;
  imported: number;
  duplicates: number;
  errors: string[];
  total_processed: number;
};

type QuestionStats = {
  total_questions: number;
  categories: { category: string; count: number }[];
  batches: { batch: string; count: number }[];
};

export default function AdminScreen() {
  const router = useRouter();

  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // CSV state
  const [fileName, setFileName] = useState('');
  const [parsedRows, setParsedRows] = useState<QuestionRow[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [csvColumns, setCsvColumns] = useState<string[]>([]);

  // Import state
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  // Stats
  const [stats, setStats] = useState<QuestionStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  // Load stats on auth
  useEffect(() => {
    if (isAuthenticated) {
      loadStats();
    }
  }, [isAuthenticated]);

  const loadStats = async () => {
    setLoadingStats(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/questions-stats`);
      const data = await res.json();
      setStats(data);
    } catch (e) {
      console.error('Error loading stats:', e);
    } finally {
      setLoadingStats(false);
    }
  };

  const handleLogin = async () => {
    if (!password.trim()) return;
    setAuthLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: password.trim() }),
      });
      if (res.ok) {
        setIsAuthenticated(true);
      } else {
        Alert.alert('Erreur', 'Mot de passe incorrect');
      }
    } catch (e) {
      Alert.alert('Erreur', 'Impossible de se connecter au serveur');
    } finally {
      setAuthLoading(false);
    }
  };

  const pickCSVFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'application/csv', 'text/*'],
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const file = result.assets[0];
      setFileName(file.name);
      setImportResult(null);
      setParseErrors([]);
      setParsedRows([]);
      setCsvColumns([]);

      let csvText = '';

      if (Platform.OS === 'web') {
        // Web: fetch the file URI as text
        const response = await fetch(file.uri);
        csvText = await response.text();
      } else {
        // Native: use FileSystem
        csvText = await FileSystem.readAsStringAsync(file.uri, {
          encoding: FileSystem.EncodingType.UTF8,
        });
      }

      parseCSV(csvText);
    } catch (e: any) {
      Alert.alert('Erreur', `Impossible de lire le fichier: ${e.message || e}`);
    }
  };

  const parseCSV = (csvText: string) => {
    const errors: string[] = [];
    const validRows: QuestionRow[] = [];

    const parsed = Papa.parse(csvText, {
      delimiter: ';',
      header: true,
      skipEmptyLines: true,
      transformHeader: (header: string) => header.trim().toLowerCase().replace(/\s+/g, '_'),
    });

    if (parsed.errors && parsed.errors.length > 0) {
      parsed.errors.forEach((err: any) => {
        errors.push(`Ligne ${err.row !== undefined ? err.row + 2 : '?'}: ${err.message}`);
      });
    }

    const fields = parsed.meta?.fields || [];
    setCsvColumns(fields);

    // Check for required columns
    const requiredCols = ['category', 'question_text', 'option_a', 'option_b', 'option_c', 'option_d', 'correct_option'];
    const missingCols = requiredCols.filter(col => !fields.includes(col));
    if (missingCols.length > 0) {
      errors.push(`Colonnes manquantes: ${missingCols.join(', ')}`);
      setParseErrors(errors);
      return;
    }

    // Process each row
    (parsed.data as any[]).forEach((row: any, index: number) => {
      try {
        const questionText = (row.question_text || '').trim();
        const category = (row.category || '').trim();
        const optA = (row.option_a || '').trim();
        const optB = (row.option_b || '').trim();
        const optC = (row.option_c || '').trim();
        const optD = (row.option_d || '').trim();
        const correct = (row.correct_option || '').trim().toUpperCase();

        if (!questionText) {
          errors.push(`Ligne ${index + 2}: question_text vide`);
          return;
        }
        if (!category) {
          errors.push(`Ligne ${index + 2}: category vide`);
          return;
        }
        if (!optA || !optB || !optC || !optD) {
          errors.push(`Ligne ${index + 2}: option(s) manquante(s)`);
          return;
        }
        if (!['A', 'B', 'C', 'D'].includes(correct)) {
          errors.push(`Ligne ${index + 2}: correct_option invalide "${correct}" (attendu: A, B, C ou D)`);
          return;
        }

        validRows.push({
          id: (row.id || '').trim() || undefined,
          category,
          question_text: questionText,
          option_a: optA,
          option_b: optB,
          option_c: optC,
          option_d: optD,
          correct_option: correct,
          difficulty: (row.difficulty || 'medium').trim(),
          angle: (row.angle || '').trim(),
          batch: (row.batch || '').trim(),
        });
      } catch (e: any) {
        errors.push(`Ligne ${index + 2}: ${e.message || 'erreur inconnue'}`);
      }
    });

    setParsedRows(validRows);
    setParseErrors(errors);
  };

  const handleImport = async () => {
    if (parsedRows.length === 0) {
      Alert.alert('Erreur', 'Aucune question valide à importer');
      return;
    }

    Alert.alert(
      'Confirmer l\'importation',
      `Voulez-vous importer ${parsedRows.length} questions ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Importer', onPress: doImport },
      ],
    );
  };

  const doImport = async () => {
    setImporting(true);
    setImportResult(null);

    try {
      const res = await fetch(`${API_URL}/api/admin/upload-csv`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: password,
          questions: parsedRows,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setImportResult(data);
        // Reload stats
        loadStats();
      } else {
        Alert.alert('Erreur', data.detail || 'Erreur lors de l\'importation');
      }
    } catch (e: any) {
      Alert.alert('Erreur', `Erreur réseau: ${e.message || e}`);
    } finally {
      setImporting(false);
    }
  };

  const resetCSV = () => {
    setFileName('');
    setParsedRows([]);
    setParseErrors([]);
    setCsvColumns([]);
    setImportResult(null);
  };

  // ── Auth Screen ──
  if (!isAuthenticated) {
    return (
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.flex1}
        >
          <View style={styles.authContainer}>
            <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
              <Text style={styles.backBtnText}>Retour</Text>
            </TouchableOpacity>

            <View style={styles.authCard}>
              <Text style={styles.lockIcon}>🔒</Text>
              <Text style={styles.authTitle}>Administration</Text>
              <Text style={styles.authSubtitle}>Importation de questions CSV</Text>

              <TextInput
                style={styles.passwordInput}
                placeholder="Mot de passe admin"
                placeholderTextColor="#666"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                onSubmitEditing={handleLogin}
                autoCapitalize="none"
              />

              <TouchableOpacity
                style={[styles.loginBtn, !password.trim() && styles.loginBtnDisabled]}
                onPress={handleLogin}
                disabled={!password.trim() || authLoading}
              >
                {authLoading ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.loginBtnText}>Se connecter</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── Main Admin Screen ──
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>Retour</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Admin - Import CSV</Text>
        </View>

        {/* Stats Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Statistiques actuelles</Text>
          {loadingStats ? (
            <ActivityIndicator color="#8A2BE2" style={{ marginVertical: 12 }} />
          ) : stats ? (
            <View>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Total questions</Text>
                <Text style={styles.statValue}>{stats.total_questions}</Text>
              </View>
              {stats.categories.slice(0, 10).map((cat, i) => (
                <View key={i} style={styles.statRow}>
                  <Text style={styles.statLabel} numberOfLines={1}>{cat.category}</Text>
                  <Text style={styles.statValueSmall}>{cat.count}</Text>
                </View>
              ))}
              {stats.batches.length > 0 && (
                <View style={styles.batchSection}>
                  <Text style={styles.batchTitle}>Par batch :</Text>
                  {stats.batches.map((b, i) => (
                    <View key={i} style={styles.statRow}>
                      <Text style={styles.statLabel}>{b.batch || '(vide)'}</Text>
                      <Text style={styles.statValueSmall}>{b.count}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          ) : (
            <Text style={styles.noDataText}>Impossible de charger les stats</Text>
          )}
        </View>

        {/* Upload Section */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Importer un fichier CSV</Text>
          <Text style={styles.cardDesc}>
            Format attendu (séparateur ;) :{'\n'}
            id;category;question_text;option_a;option_b;option_c;option_d;correct_option;difficulty;angle;batch
          </Text>
          <Text style={styles.cardDescSub}>
            correct_option : A, B, C ou D{'\n'}
            id est optionnel (auto-généré si vide)
          </Text>

          {!fileName ? (
            <TouchableOpacity style={styles.uploadBtn} onPress={pickCSVFile}>
              <Text style={styles.uploadBtnIcon}>📁</Text>
              <Text style={styles.uploadBtnText}>Choisir un fichier CSV</Text>
            </TouchableOpacity>
          ) : (
            <View>
              {/* File info */}
              <View style={styles.fileInfo}>
                <Text style={styles.fileIcon}>📄</Text>
                <View style={styles.fileDetails}>
                  <Text style={styles.fileNameText} numberOfLines={1}>{fileName}</Text>
                  <Text style={styles.fileMetaText}>
                    {parsedRows.length} questions valides
                    {parseErrors.length > 0 ? ` • ${parseErrors.length} erreur(s)` : ''}
                  </Text>
                </View>
                <TouchableOpacity style={styles.resetBtn} onPress={resetCSV}>
                  <Text style={styles.resetBtnText}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* Detected columns */}
              {csvColumns.length > 0 && (
                <View style={styles.columnsInfo}>
                  <Text style={styles.columnsTitle}>Colonnes détectées :</Text>
                  <Text style={styles.columnsText}>{csvColumns.join(', ')}</Text>
                </View>
              )}

              {/* Preview */}
              {parsedRows.length > 0 && (
                <View style={styles.previewSection}>
                  <Text style={styles.previewTitle}>Aperçu ({Math.min(5, parsedRows.length)} premières questions) :</Text>
                  {parsedRows.slice(0, 5).map((row, i) => (
                    <View key={i} style={styles.previewCard}>
                      <Text style={styles.previewCategory}>{row.category}</Text>
                      <Text style={styles.previewQuestion} numberOfLines={2}>{row.question_text}</Text>
                      <View style={styles.previewOptions}>
                        {['A', 'B', 'C', 'D'].map((letter) => {
                          const optKey = `option_${letter.toLowerCase()}` as keyof QuestionRow;
                          const isCorrect = row.correct_option === letter;
                          return (
                            <Text
                              key={letter}
                              style={[styles.previewOption, isCorrect && styles.previewOptionCorrect]}
                              numberOfLines={1}
                            >
                              {letter}. {row[optKey]}
                            </Text>
                          );
                        })}
                      </View>
                      {row.difficulty && (
                        <Text style={styles.previewMeta}>
                          Difficulté: {row.difficulty}
                          {row.angle ? ` | Angle: ${row.angle}` : ''}
                          {row.batch ? ` | Batch: ${row.batch}` : ''}
                        </Text>
                      )}
                    </View>
                  ))}
                </View>
              )}

              {/* Parse errors */}
              {parseErrors.length > 0 && (
                <View style={styles.errorsSection}>
                  <Text style={styles.errorsTitle}>
                    Avertissements ({parseErrors.length}) :
                  </Text>
                  {parseErrors.slice(0, 20).map((err, i) => (
                    <Text key={i} style={styles.errorText}>{err}</Text>
                  ))}
                  {parseErrors.length > 20 && (
                    <Text style={styles.errorMoreText}>... et {parseErrors.length - 20} autres</Text>
                  )}
                </View>
              )}

              {/* Import Button */}
              <TouchableOpacity
                style={[styles.importBtn, (parsedRows.length === 0 || importing) && styles.importBtnDisabled]}
                onPress={handleImport}
                disabled={parsedRows.length === 0 || importing}
              >
                {importing ? (
                  <View style={styles.importingRow}>
                    <ActivityIndicator color="#FFF" />
                    <Text style={styles.importBtnText}> Importation en cours...</Text>
                  </View>
                ) : (
                  <Text style={styles.importBtnText}>
                    Importer {parsedRows.length} question{parsedRows.length > 1 ? 's' : ''}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Import Result */}
        {importResult && (
          <View style={[styles.card, styles.resultCard]}>
            <Text style={styles.resultTitle}>
              {importResult.success ? '✅ Importation terminée' : '❌ Erreur'}
            </Text>
            <View style={styles.resultStats}>
              <View style={styles.resultStatItem}>
                <Text style={styles.resultStatNum}>{importResult.imported}</Text>
                <Text style={styles.resultStatLabel}>importées</Text>
              </View>
              <View style={styles.resultStatItem}>
                <Text style={[styles.resultStatNum, { color: '#FFA000' }]}>{importResult.duplicates}</Text>
                <Text style={styles.resultStatLabel}>doublons</Text>
              </View>
              <View style={styles.resultStatItem}>
                <Text style={[styles.resultStatNum, { color: '#FF3B30' }]}>{importResult.errors.length}</Text>
                <Text style={styles.resultStatLabel}>erreurs</Text>
              </View>
            </View>
            {importResult.errors.length > 0 && (
              <View style={styles.errorsSection}>
                <Text style={styles.errorsTitle}>Erreurs serveur :</Text>
                {importResult.errors.slice(0, 10).map((err, i) => (
                  <Text key={i} style={styles.errorText}>{err}</Text>
                ))}
              </View>
            )}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050510' },
  flex1: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 8 },

  // Auth
  authContainer: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  authCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 20, padding: 32,
    alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  lockIcon: { fontSize: 48, marginBottom: 16 },
  authTitle: { color: '#FFF', fontSize: 24, fontWeight: '800', marginBottom: 4 },
  authSubtitle: { color: '#888', fontSize: 14, marginBottom: 24 },
  passwordInput: {
    width: '100%', backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
    color: '#FFF', fontSize: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    marginBottom: 16,
  },
  loginBtn: {
    width: '100%', backgroundColor: '#8A2BE2',
    borderRadius: 12, paddingVertical: 14, alignItems: 'center',
  },
  loginBtnDisabled: { opacity: 0.5 },
  loginBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)',
    marginBottom: 16,
  },
  backBtn: {
    paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 8,
  },
  backBtnText: { color: '#8A2BE2', fontSize: 14, fontWeight: '600' },
  headerTitle: { color: '#FFF', fontSize: 20, fontWeight: '800', marginLeft: 16 },

  // Card
  card: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16, padding: 20, marginBottom: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  cardTitle: { color: '#FFF', fontSize: 18, fontWeight: '700', marginBottom: 12 },
  cardDesc: { color: '#AAA', fontSize: 12, lineHeight: 18, marginBottom: 4, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  cardDescSub: { color: '#777', fontSize: 11, lineHeight: 16, marginBottom: 16 },

  // Stats
  statRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  statLabel: { color: '#CCC', fontSize: 13, flex: 1 },
  statValue: { color: '#8A2BE2', fontSize: 20, fontWeight: '900' },
  statValueSmall: { color: '#8A2BE2', fontSize: 15, fontWeight: '700' },
  noDataText: { color: '#666', fontSize: 13 },
  batchSection: { marginTop: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' },
  batchTitle: { color: '#888', fontSize: 12, fontWeight: '600', marginBottom: 4 },

  // Upload
  uploadBtn: {
    backgroundColor: 'rgba(138,43,226,0.15)',
    borderRadius: 12, paddingVertical: 28, alignItems: 'center',
    borderWidth: 2, borderColor: '#8A2BE2', borderStyle: 'dashed',
  },
  uploadBtnIcon: { fontSize: 32, marginBottom: 8 },
  uploadBtnText: { color: '#8A2BE2', fontSize: 16, fontWeight: '700' },

  // File info
  fileInfo: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(138,43,226,0.1)', borderRadius: 12, padding: 12,
    marginBottom: 12,
  },
  fileIcon: { fontSize: 24, marginRight: 12 },
  fileDetails: { flex: 1 },
  fileNameText: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  fileMetaText: { color: '#AAA', fontSize: 12, marginTop: 2 },
  resetBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(255,59,48,0.15)', justifyContent: 'center', alignItems: 'center',
  },
  resetBtnText: { color: '#FF3B30', fontSize: 16, fontWeight: '700' },

  // Columns
  columnsInfo: {
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: 10,
    marginBottom: 12,
  },
  columnsTitle: { color: '#888', fontSize: 11, fontWeight: '600', marginBottom: 4 },
  columnsText: { color: '#AAA', fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },

  // Preview
  previewSection: { marginBottom: 12 },
  previewTitle: { color: '#888', fontSize: 12, fontWeight: '600', marginBottom: 8 },
  previewCard: {
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 12,
    marginBottom: 8, borderLeftWidth: 3, borderLeftColor: '#8A2BE2',
  },
  previewCategory: {
    color: '#8A2BE2', fontSize: 10, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4,
  },
  previewQuestion: { color: '#FFF', fontSize: 14, fontWeight: '600', marginBottom: 8 },
  previewOptions: { gap: 4 },
  previewOption: { color: '#AAA', fontSize: 12, paddingLeft: 8 },
  previewOptionCorrect: { color: '#00C853', fontWeight: '700' },
  previewMeta: { color: '#666', fontSize: 10, marginTop: 6 },

  // Errors
  errorsSection: {
    backgroundColor: 'rgba(255,59,48,0.08)', borderRadius: 10, padding: 12,
    marginBottom: 12,
  },
  errorsTitle: { color: '#FF8A80', fontSize: 13, fontWeight: '700', marginBottom: 6 },
  errorText: { color: '#FF8A80', fontSize: 11, lineHeight: 18 },
  errorMoreText: { color: '#FF8A80', fontSize: 11, fontStyle: 'italic', marginTop: 4 },

  // Import button
  importBtn: {
    backgroundColor: '#00C853', borderRadius: 12, paddingVertical: 16,
    alignItems: 'center',
  },
  importBtnDisabled: { opacity: 0.4 },
  importBtnText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  importingRow: { flexDirection: 'row', alignItems: 'center' },

  // Results
  resultCard: { borderColor: 'rgba(0,200,83,0.3)' },
  resultTitle: { color: '#FFF', fontSize: 18, fontWeight: '800', textAlign: 'center', marginBottom: 16 },
  resultStats: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 16 },
  resultStatItem: { alignItems: 'center' },
  resultStatNum: { color: '#00C853', fontSize: 28, fontWeight: '900' },
  resultStatLabel: { color: '#888', fontSize: 12, marginTop: 2 },
});
