import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput,
  Alert, ActivityIndicator, Platform, KeyboardAvoidingView, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import Papa from 'papaparse';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

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
  angle_num?: string;
  batch?: string;
};

type ImportResult = {
  success: boolean;
  imported: number;
  duplicates: number;
  errors: string[];
  total_processed: number;
};

type ThemeItem = {
  id: string;
  name: string;
  description: string;
  question_count: number;
  color_hex: string;
};

type ClusterItem = {
  name: string;
  icon: string;
  themes: ThemeItem[];
  total_questions: number;
};

type SuperCategoryItem = {
  id: string;
  label: string;
  icon: string;
  color: string;
  clusters: ClusterItem[];
  total_themes: number;
  total_questions: number;
};

type ThemesOverview = {
  super_categories: SuperCategoryItem[];
  totals: {
    super_categories: number;
    clusters: number;
    themes: number;
    questions: number;
  };
};

type MatchStat = {
  theme_id: string;
  theme_name: string;
  match_count: number;
};

type ReportItem = {
  id: string;
  user_id: string;
  user_pseudo: string;
  question_id: string;
  question_text: string;
  category: string;
  reason_type: string;
  description: string;
  status: string;
  created_at: string;
};

type ReportCounts = {
  pending: number;
  reviewed: number;
  resolved: number;
  total: number;
};

const TABS = ['Questions', 'Themes', 'Stats', 'Signalements'];

const REASON_LABELS: Record<string, string> = {
  wrong_answer: 'Mauvaise reponse',
  unclear_question: 'Question pas claire',
  typo: 'Faute / erreur',
  outdated: 'Info obsolete',
  other: 'Autre',
};

const STATUS_COLORS: Record<string, string> = {
  pending: '#FFA500',
  reviewed: '#00BFFF',
  resolved: '#00C853',
};

export default function AdminScreen() {
  const router = useRouter();

  // Auth
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Active tab
  const [activeTab, setActiveTab] = useState(0);

  // Questions CSV state
  const [fileName, setFileName] = useState('');
  const [parsedRows, setParsedRows] = useState<QuestionRow[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [csvColumns, setCsvColumns] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  // Themes state
  const [themesOverview, setThemesOverview] = useState<ThemesOverview | null>(null);
  const [loadingThemes, setLoadingThemes] = useState(false);
  const [themesFileName, setThemesFileName] = useState('');
  const [themesCSVText, setThemesCSVText] = useState('');
  const [themesPreviewCount, setThemesPreviewCount] = useState(0);
  const [uploadingThemes, setUploadingThemes] = useState(false);
  const [themesUploadResult, setThemesUploadResult] = useState<any>(null);
  const [expandedSC, setExpandedSC] = useState<string | null>(null);
  const [expandedCluster, setExpandedCluster] = useState<string | null>(null);

  // Theme selection for deletion
  const [selectedThemes, setSelectedThemes] = useState<Set<string>>(new Set());
  const [deletingThemes, setDeletingThemes] = useState(false);

  // Stats state
  const [matchStats, setMatchStats] = useState<MatchStat[]>([]);
  const [totalMatches, setTotalMatches] = useState(0);
  const [loadingMatchStats, setLoadingMatchStats] = useState(false);

  // Reports state
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [reportCounts, setReportCounts] = useState<ReportCounts>({ pending: 0, reviewed: 0, resolved: 0, total: 0 });
  const [loadingReports, setLoadingReports] = useState(false);
  const [reportFilter, setReportFilter] = useState<string>('');

  // Refresh
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      loadThemesOverview();
      loadMatchStats();
      loadReports();
    }
  }, [isAuthenticated]);

  // ── Loaders ──

  const loadThemesOverview = async () => {
    setLoadingThemes(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/themes-overview`);
      const data = await res.json();
      setThemesOverview(data);
    } catch (e) {
      console.error('Error loading themes:', e);
    } finally {
      setLoadingThemes(false);
    }
  };

  const loadMatchStats = async () => {
    setLoadingMatchStats(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/match-stats-by-theme`);
      const data = await res.json();
      setMatchStats(data.stats || []);
      setTotalMatches(data.total_matches || 0);
    } catch (e) {
      console.error('Error loading match stats:', e);
    } finally {
      setLoadingMatchStats(false);
    }
  };

  const loadReports = async () => {
    setLoadingReports(true);
    try {
      const url = reportFilter
        ? `${API_URL}/api/admin/reports?status=${reportFilter}`
        : `${API_URL}/api/admin/reports`;
      const res = await fetch(url);
      const data = await res.json();
      setReports(data.reports || []);
      setReportCounts(data.counts || { pending: 0, reviewed: 0, resolved: 0, total: 0 });
    } catch (e) {
      console.error('Error loading reports:', e);
    } finally {
      setLoadingReports(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (activeTab === 0) { /* Questions tab - nothing to refresh */ }
    else if (activeTab === 1) await loadThemesOverview();
    else if (activeTab === 2) await loadMatchStats();
    else if (activeTab === 3) await loadReports();
    setRefreshing(false);
  }, [activeTab, reportFilter]);

  // ── Auth ──

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

  // ── Questions CSV ──

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
        const response = await fetch(file.uri);
        csvText = await response.text();
      } else {
        csvText = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.UTF8 });
      }
      parseCSV(csvText);
    } catch (e: any) {
      Alert.alert('Erreur', `Impossible de lire le fichier: ${e.message || e}`);
    }
  };

  const parseCSV = (csvText: string) => {
    const errors: string[] = [];
    const validRows: QuestionRow[] = [];

    // Map French column names to internal names
    const COLUMN_MAP: Record<string, string> = {
      'id': 'id',
      'catégorie': 'category', 'categorie': 'category', 'category': 'category',
      'question': 'question_text', 'question_text': 'question_text',
      'rep_a': 'option_a', 'option_a': 'option_a',
      'rep_b': 'option_b', 'option_b': 'option_b',
      'rep_c': 'option_c', 'option_c': 'option_c',
      'rep_d': 'option_d', 'option_d': 'option_d',
      'bonne_rep': 'correct_option', 'correct_option': 'correct_option',
      'difficulté': 'difficulty', 'difficulte': 'difficulty', 'difficulty': 'difficulty',
      'angle': 'angle',
      'angle_num': 'angle_num',
      'batch': 'batch',
    };

    const parsed = Papa.parse(csvText, {
      delimiter: ';',
      header: true,
      skipEmptyLines: true,
      transformHeader: (header: string) => {
        const normalized = header.trim().toLowerCase().replace(/\s+/g, '_');
        return COLUMN_MAP[normalized] || normalized;
      },
    });
    if (parsed.errors && parsed.errors.length > 0) {
      parsed.errors.forEach((err: any) => {
        errors.push(`Ligne ${err.row !== undefined ? err.row + 2 : '?'}: ${err.message}`);
      });
    }
    const fields = parsed.meta?.fields || [];
    setCsvColumns(fields);
    const requiredCols = ['category', 'question_text', 'option_a', 'option_b', 'option_c', 'option_d', 'correct_option'];
    const missingCols = requiredCols.filter(col => !fields.includes(col));
    if (missingCols.length > 0) {
      errors.push(`Colonnes manquantes: ${missingCols.join(', ')}`);
      setParseErrors(errors);
      return;
    }
    (parsed.data as any[]).forEach((row: any, index: number) => {
      try {
        const questionText = (row.question_text || '').trim();
        const category = (row.category || '').trim();
        const optA = (row.option_a || '').trim();
        const optB = (row.option_b || '').trim();
        const optC = (row.option_c || '').trim();
        const optD = (row.option_d || '').trim();
        const correct = (row.correct_option || '').trim().toUpperCase();
        if (!questionText) { errors.push(`Ligne ${index + 2}: question_text vide`); return; }
        if (!category) { errors.push(`Ligne ${index + 2}: category vide`); return; }
        if (!optA || !optB || !optC || !optD) { errors.push(`Ligne ${index + 2}: option(s) manquante(s)`); return; }
        if (!['A', 'B', 'C', 'D'].includes(correct)) { errors.push(`Ligne ${index + 2}: correct_option invalide`); return; }
        validRows.push({
          id: (row.id || '').trim() || undefined,
          category, question_text: questionText,
          option_a: optA, option_b: optB, option_c: optC, option_d: optD,
          correct_option: correct, difficulty: (row.difficulty || 'medium').trim(),
          angle: (row.angle || '').trim(), angle_num: (row.angle_num || '').trim(),
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
    if (parsedRows.length === 0) { Alert.alert('Erreur', 'Aucune question valide'); return; }
    Alert.alert('Confirmer', `Importer ${parsedRows.length} questions ?`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Importer', onPress: doImport },
    ]);
  };

  const doImport = async () => {
    setImporting(true);
    setImportResult(null);
    try {
      const res = await fetch(`${API_URL}/api/admin/upload-csv`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, questions: parsedRows }),
      });
      const data = await res.json();
      if (res.ok) { setImportResult(data); loadThemesOverview(); }
      else { Alert.alert('Erreur', data.detail || 'Erreur lors de l\'importation'); }
    } catch (e: any) {
      Alert.alert('Erreur', `Erreur reseau: ${e.message || e}`);
    } finally {
      setImporting(false);
    }
  };

  const resetCSV = () => {
    setFileName(''); setParsedRows([]); setParseErrors([]); setCsvColumns([]); setImportResult(null);
  };

  // ── Themes CSV ──

  const pickThemesCSV = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'application/csv', 'text/*'],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const file = result.assets[0];
      setThemesFileName(file.name);
      setThemesUploadResult(null);
      let csvText = '';
      if (Platform.OS === 'web') {
        const response = await fetch(file.uri);
        csvText = await response.text();
      } else {
        csvText = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.UTF8 });
      }
      setThemesCSVText(csvText);
      // Count rows for preview
      const lines = csvText.split('\n').filter(l => l.trim().length > 0);
      setThemesPreviewCount(Math.max(0, lines.length - 1));
    } catch (e: any) {
      Alert.alert('Erreur', `Impossible de lire le fichier: ${e.message || e}`);
    }
  };

  const uploadThemesCSV = async () => {
    if (!themesCSVText.trim()) return;
    Alert.alert(
      'Confirmer le remplacement',
      `Cela va supprimer TOUS les themes existants et les remplacer par les ${themesPreviewCount} themes du CSV. Continuer ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Remplacer', style: 'destructive', onPress: doUploadThemes },
      ],
    );
  };

  const doUploadThemes = async () => {
    setUploadingThemes(true);
    setThemesUploadResult(null);
    try {
      const res = await fetch(`${API_URL}/api/admin/upload-themes-csv`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, themes_csv: themesCSVText }),
      });
      const data = await res.json();
      if (res.ok) {
        setThemesUploadResult(data);
        loadThemesOverview();
      } else {
        Alert.alert('Erreur', data.detail || 'Erreur lors de l\'upload');
      }
    } catch (e: any) {
      Alert.alert('Erreur', `Erreur reseau: ${e.message || e}`);
    } finally {
      setUploadingThemes(false);
    }
  };

  const resetThemesCSV = () => {
    setThemesFileName(''); setThemesCSVText(''); setThemesPreviewCount(0); setThemesUploadResult(null);
  };

  // ── Theme selection & deletion ──

  const toggleThemeSelection = (themeId: string) => {
    setSelectedThemes(prev => {
      const next = new Set(prev);
      if (next.has(themeId)) next.delete(themeId);
      else next.add(themeId);
      return next;
    });
  };

  const toggleClusterSelection = (themes: ThemeItem[]) => {
    const ids = themes.map(t => t.id);
    const allSelected = ids.every(id => selectedThemes.has(id));
    setSelectedThemes(prev => {
      const next = new Set(prev);
      ids.forEach(id => allSelected ? next.delete(id) : next.add(id));
      return next;
    });
  };

  const handleDeleteThemes = () => {
    if (selectedThemes.size === 0) return;
    const count = selectedThemes.size;
    Alert.alert(
      'Supprimer des themes',
      `Supprimer ${count} theme${count > 1 ? 's' : ''} et toutes leurs questions associees ? Cette action est irreversible.`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: doDeleteThemes },
      ],
    );
  };

  const doDeleteThemes = async () => {
    setDeletingThemes(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/delete-themes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password,
          theme_ids: Array.from(selectedThemes),
          delete_questions: true,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        Alert.alert('Supprime', `${data.deleted_themes} theme(s) et ${data.deleted_questions} question(s) supprimes.`);
        setSelectedThemes(new Set());
        loadThemesOverview();
      } else {
        Alert.alert('Erreur', data.detail || 'Erreur lors de la suppression');
      }
    } catch (e: any) {
      Alert.alert('Erreur', `Erreur reseau: ${e.message || e}`);
    } finally {
      setDeletingThemes(false);
    }
  };

  // ── Report status update ──

  const updateReportStatus = async (reportId: string, newStatus: string) => {
    try {
      await fetch(`${API_URL}/api/admin/reports/${reportId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      loadReports();
    } catch (e) {
      Alert.alert('Erreur', 'Impossible de mettre a jour le status');
    }
  };

  // ── Auth Screen ──
  if (!isAuthenticated) {
    return (
      <View style={styles.opaqueWrapper} testID="admin-bg" nativeID="admin-bg">
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex1}>
          <View style={styles.authContainer}>
            <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
              <Text style={styles.backBtnText}>Retour</Text>
            </TouchableOpacity>
            <View style={styles.authCard}>
              <Text style={styles.lockIcon}>{'🔒'}</Text>
              <Text style={styles.authTitle}>Administration</Text>
              <Text style={styles.authSubtitle}>Panel d'administration Duelo</Text>
              <TextInput
                style={styles.passwordInput}
                placeholder="Mot de passe admin"
                placeholderTextColor="#555"
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
                {authLoading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.loginBtnText}>Se connecter</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
      </View>
    );
  }

  // ── Tab Content Renderers ──

  const renderQuestionsTab = () => (
    <View>
      {/* Upload Section */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Importer des questions CSV</Text>
        <Text style={styles.cardDesc}>
          Format (separateur ;) : ID;Categorie;Question;Rep A;Rep B;Rep C;Rep D;Bonne rep;Difficulte;Angle;Angle Num
        </Text>
        {!fileName ? (
          <TouchableOpacity style={styles.uploadBtn} onPress={pickCSVFile}>
            <Text style={styles.uploadBtnIcon}>{'📁'}</Text>
            <Text style={styles.uploadBtnText}>Choisir un fichier CSV</Text>
          </TouchableOpacity>
        ) : (
          <View>
            <View style={styles.fileInfo}>
              <Text style={styles.fileIcon}>{'📄'}</Text>
              <View style={styles.fileDetails}>
                <Text style={styles.fileNameText} numberOfLines={1}>{fileName}</Text>
                <Text style={styles.fileMetaText}>
                  {parsedRows.length} questions valides
                  {parseErrors.length > 0 ? ` | ${parseErrors.length} erreur(s)` : ''}
                </Text>
              </View>
              <TouchableOpacity style={styles.resetBtn} onPress={resetCSV}>
                <Text style={styles.resetBtnText}>X</Text>
              </TouchableOpacity>
            </View>
            {csvColumns.length > 0 && (
              <View style={styles.columnsInfo}>
                <Text style={styles.columnsTitle}>Colonnes detectees :</Text>
                <Text style={styles.columnsText}>{csvColumns.join(', ')}</Text>
              </View>
            )}
            {parsedRows.length > 0 && (
              <View style={styles.previewSection}>
                <Text style={styles.previewTitle}>Apercu ({Math.min(3, parsedRows.length)} premieres) :</Text>
                {parsedRows.slice(0, 3).map((row, i) => (
                  <View key={i} style={styles.previewCard}>
                    <Text style={styles.previewCategory}>{row.category}</Text>
                    <Text style={styles.previewQuestion} numberOfLines={2}>{row.question_text}</Text>
                  </View>
                ))}
              </View>
            )}
            {parseErrors.length > 0 && (
              <View style={styles.errorsSection}>
                <Text style={styles.errorsTitle}>Avertissements ({parseErrors.length}) :</Text>
                {parseErrors.slice(0, 10).map((err, i) => (
                  <Text key={i} style={styles.errorText}>{err}</Text>
                ))}
              </View>
            )}
            <TouchableOpacity
              style={[styles.importBtn, (parsedRows.length === 0 || importing) && styles.importBtnDisabled]}
              onPress={handleImport}
              disabled={parsedRows.length === 0 || importing}
            >
              {importing ? (
                <View style={styles.importingRow}>
                  <ActivityIndicator color="#FFF" />
                  <Text style={styles.importBtnText}> Importation...</Text>
                </View>
              ) : (
                <Text style={styles.importBtnText}>Importer {parsedRows.length} question{parsedRows.length > 1 ? 's' : ''}</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>

      {importResult && (
        <View style={[styles.card, styles.resultCard]}>
          <Text style={styles.resultTitle}>
            {importResult.success ? 'Importation terminee' : 'Erreur'}
          </Text>
          <View style={styles.resultStats}>
            <View style={styles.resultStatItem}>
              <Text style={styles.resultStatNum}>{importResult.imported}</Text>
              <Text style={styles.resultStatLabel}>importees</Text>
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
        </View>
      )}
    </View>
  );

  const renderThemesTab = () => (
    <View>
      {/* Upload Themes CSV */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Upload CSV Themes</Text>
        <Text style={styles.cardDescSub}>
          Le CSV ecrase tous les themes existants. Colonnes attendues : ID_Theme;Super_Categorie;Cluster;Nom_Public;...
        </Text>
        {!themesFileName ? (
          <TouchableOpacity style={styles.uploadBtn} onPress={pickThemesCSV}>
            <Text style={styles.uploadBtnIcon}>{'📋'}</Text>
            <Text style={styles.uploadBtnText}>Choisir le CSV Themes</Text>
          </TouchableOpacity>
        ) : (
          <View>
            <View style={styles.fileInfo}>
              <Text style={styles.fileIcon}>{'📋'}</Text>
              <View style={styles.fileDetails}>
                <Text style={styles.fileNameText} numberOfLines={1}>{themesFileName}</Text>
                <Text style={styles.fileMetaText}>{themesPreviewCount} themes detectes</Text>
              </View>
              <TouchableOpacity style={styles.resetBtn} onPress={resetThemesCSV}>
                <Text style={styles.resetBtnText}>X</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[styles.importBtnDanger, uploadingThemes && styles.importBtnDisabled]}
              onPress={uploadThemesCSV}
              disabled={uploadingThemes}
            >
              {uploadingThemes ? (
                <View style={styles.importingRow}>
                  <ActivityIndicator color="#FFF" />
                  <Text style={styles.importBtnText}> Upload en cours...</Text>
                </View>
              ) : (
                <Text style={styles.importBtnText}>Remplacer tous les themes ({themesPreviewCount})</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
        {themesUploadResult && (
          <View style={[styles.resultBanner, { marginTop: 12 }]}>
            <Text style={styles.resultBannerText}>
              {themesUploadResult.themes_imported} themes importes
            </Text>
          </View>
        )}
      </View>

      {/* Themes Overview */}
      <View style={styles.card}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <Text style={styles.cardTitle}>Vue d'ensemble des themes</Text>
          {selectedThemes.size > 0 && (
            <TouchableOpacity onPress={() => setSelectedThemes(new Set())} data-testid="clear-selection-btn">
              <Text style={{ color: '#888', fontSize: 12 }}>Deselectionner</Text>
            </TouchableOpacity>
          )}
        </View>
        {loadingThemes ? (
          <ActivityIndicator color="#8A2BE2" style={{ marginVertical: 12 }} />
        ) : themesOverview ? (
          <View>
            {/* Totals */}
            <View style={styles.totalsRow}>
              <View style={styles.totalItem}>
                <Text style={styles.totalNum}>{themesOverview.totals.super_categories}</Text>
                <Text style={styles.totalLabel}>Super Cat.</Text>
              </View>
              <View style={styles.totalItem}>
                <Text style={styles.totalNum}>{themesOverview.totals.clusters}</Text>
                <Text style={styles.totalLabel}>Clusters</Text>
              </View>
              <View style={styles.totalItem}>
                <Text style={styles.totalNum}>{themesOverview.totals.themes}</Text>
                <Text style={styles.totalLabel}>Themes</Text>
              </View>
              <View style={styles.totalItem}>
                <Text style={styles.totalNum}>{themesOverview.totals.questions}</Text>
                <Text style={styles.totalLabel}>Questions</Text>
              </View>
            </View>

            {/* Super Categories List */}
            {themesOverview.super_categories.map((sc) => (
              <View key={sc.id} style={styles.scContainer}>
                <TouchableOpacity
                  style={[styles.scHeader, { borderLeftColor: sc.color }]}
                  onPress={() => setExpandedSC(expandedSC === sc.id ? null : sc.id)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.scIcon}>{sc.icon}</Text>
                  <View style={styles.scHeaderInfo}>
                    <Text style={styles.scName}>{sc.label}</Text>
                    <Text style={styles.scMeta}>{sc.total_themes} themes | {sc.total_questions} questions</Text>
                  </View>
                  <Text style={styles.scArrow}>{expandedSC === sc.id ? 'v' : '>'}</Text>
                </TouchableOpacity>

                {expandedSC === sc.id && sc.clusters.map((cl) => {
                  const clKey = `${sc.id}_${cl.name}`;
                  const allClusterSelected = cl.themes.length > 0 && cl.themes.every(t => selectedThemes.has(t.id));
                  const someClusterSelected = cl.themes.some(t => selectedThemes.has(t.id));
                  return (
                  <View key={cl.name} style={styles.clContainer}>
                    <TouchableOpacity
                      style={styles.clHeader}
                      onPress={() => setExpandedCluster(expandedCluster === clKey ? null : clKey)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.clIcon}>{cl.icon}</Text>
                      <View style={styles.clHeaderInfo}>
                        <Text style={styles.clName}>{cl.name}</Text>
                        <Text style={styles.clMeta}>{cl.themes.length} themes | {cl.total_questions} Q</Text>
                      </View>
                      <Text style={styles.clArrow}>{expandedCluster === clKey ? 'v' : '>'}</Text>
                    </TouchableOpacity>

                    {expandedCluster === clKey && (
                      <View>
                        {/* Select all cluster */}
                        <TouchableOpacity
                          style={styles.selectAllRow}
                          onPress={() => toggleClusterSelection(cl.themes)}
                          data-testid={`select-all-${cl.name}`}
                        >
                          <View style={[styles.checkbox, allClusterSelected && styles.checkboxChecked, !allClusterSelected && someClusterSelected && styles.checkboxPartial]}>
                            {allClusterSelected && <Text style={styles.checkMark}>✓</Text>}
                            {!allClusterSelected && someClusterSelected && <Text style={styles.checkMark}>-</Text>}
                          </View>
                          <Text style={styles.selectAllText}>
                            {allClusterSelected ? 'Tout deselectionner' : 'Tout selectionner'} ({cl.themes.length})
                          </Text>
                        </TouchableOpacity>

                        {cl.themes.map((theme) => (
                        <TouchableOpacity
                          key={theme.id}
                          style={[styles.themeRow, selectedThemes.has(theme.id) && styles.themeRowSelected]}
                          onPress={() => toggleThemeSelection(theme.id)}
                          activeOpacity={0.7}
                          data-testid={`theme-row-${theme.id}`}
                        >
                          <View style={[styles.checkbox, selectedThemes.has(theme.id) && styles.checkboxChecked]}>
                            {selectedThemes.has(theme.id) && <Text style={styles.checkMark}>✓</Text>}
                          </View>
                          <View style={[styles.themeIdBadge, { backgroundColor: theme.color_hex ? theme.color_hex + '30' : 'rgba(138,43,226,0.15)' }]}>
                            <Text style={[styles.themeIdText, { color: theme.color_hex || '#8A2BE2' }]}>{theme.id}</Text>
                          </View>
                          <View style={styles.themeInfo}>
                            <Text style={styles.themeName} numberOfLines={1}>{theme.name}</Text>
                          </View>
                          <Text style={styles.themeQCount}>{theme.question_count} Q</Text>
                        </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                  );
                })}
              </View>
            ))}
          </View>
        ) : <Text style={styles.noDataText}>Aucun theme en base</Text>}
      </View>

      {/* Floating delete bar */}
      {selectedThemes.size > 0 && (
        <View style={styles.deleteBar} data-testid="delete-themes-bar">
          <Text style={styles.deleteBarText}>{selectedThemes.size} theme{selectedThemes.size > 1 ? 's' : ''} selectionne{selectedThemes.size > 1 ? 's' : ''}</Text>
          <TouchableOpacity
            style={[styles.deleteBarBtn, deletingThemes && { opacity: 0.5 }]}
            onPress={handleDeleteThemes}
            disabled={deletingThemes}
            data-testid="delete-themes-btn"
          >
            {deletingThemes ? (
              <ActivityIndicator color="#FFF" size="small" />
            ) : (
              <Text style={styles.deleteBarBtnText}>Supprimer</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  const renderStatsTab = () => (
    <View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Parties par theme</Text>
        <Text style={styles.cardDescSub}>Themes classes par popularite (nombre de parties jouees)</Text>
        {loadingMatchStats ? (
          <ActivityIndicator color="#8A2BE2" style={{ marginVertical: 12 }} />
        ) : matchStats.length > 0 ? (
          <View>
            <View style={[styles.statRow, { borderBottomWidth: 2, borderBottomColor: 'rgba(138,43,226,0.3)' }]}>
              <Text style={[styles.statLabel, { fontWeight: '700', color: '#FFF' }]}>Total parties</Text>
              <Text style={styles.statValue}>{totalMatches}</Text>
            </View>
            {matchStats.map((stat, i) => {
              const pct = totalMatches > 0 ? (stat.match_count / totalMatches * 100) : 0;
              return (
                <View key={i} style={styles.matchStatRow}>
                  <View style={styles.matchStatRank}>
                    <Text style={styles.matchStatRankText}>{i + 1}</Text>
                  </View>
                  <View style={styles.matchStatInfo}>
                    <View style={styles.matchStatHeader}>
                      <Text style={styles.matchStatName} numberOfLines={1}>{stat.theme_name}</Text>
                      <Text style={styles.matchStatCount}>{stat.match_count}</Text>
                    </View>
                    <View style={styles.matchStatBarBg}>
                      <View style={[styles.matchStatBar, { width: `${Math.max(pct, 2)}%` }]} />
                    </View>
                    <Text style={styles.matchStatId}>{stat.theme_id} | {pct.toFixed(1)}%</Text>
                  </View>
                </View>
              );
            })}
          </View>
        ) : <Text style={styles.noDataText}>Aucune partie jouee</Text>}
      </View>
    </View>
  );

  const renderReportsTab = () => (
    <View>
      {/* Filter */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Signalements de questions</Text>
        <View style={styles.reportFilterRow}>
          {['', 'pending', 'reviewed', 'resolved'].map((f) => (
            <TouchableOpacity
              key={f}
              style={[styles.reportFilterBtn, reportFilter === f && styles.reportFilterBtnActive]}
              onPress={() => { setReportFilter(f); setTimeout(loadReports, 100); }}
            >
              <Text style={[styles.reportFilterText, reportFilter === f && styles.reportFilterTextActive]}>
                {f === '' ? 'Tous' : f === 'pending' ? 'En attente' : f === 'reviewed' ? 'Examine' : 'Resolu'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.reportCountsRow}>
          <View style={[styles.reportCountBadge, { backgroundColor: 'rgba(255,165,0,0.15)' }]}>
            <Text style={[styles.reportCountNum, { color: '#FFA500' }]}>{reportCounts.pending}</Text>
            <Text style={styles.reportCountLabel}>En attente</Text>
          </View>
          <View style={[styles.reportCountBadge, { backgroundColor: 'rgba(0,191,255,0.15)' }]}>
            <Text style={[styles.reportCountNum, { color: '#00BFFF' }]}>{reportCounts.reviewed}</Text>
            <Text style={styles.reportCountLabel}>Examines</Text>
          </View>
          <View style={[styles.reportCountBadge, { backgroundColor: 'rgba(0,200,83,0.15)' }]}>
            <Text style={[styles.reportCountNum, { color: '#00C853' }]}>{reportCounts.resolved}</Text>
            <Text style={styles.reportCountLabel}>Resolus</Text>
          </View>
        </View>
      </View>

      {/* Reports List */}
      {loadingReports ? (
        <ActivityIndicator color="#8A2BE2" style={{ marginVertical: 24 }} />
      ) : reports.length > 0 ? (
        reports.map((r) => (
          <View key={r.id} style={styles.reportCard}>
            <View style={styles.reportCardHeader}>
              <View style={[styles.reportStatusBadge, { backgroundColor: (STATUS_COLORS[r.status] || '#888') + '25' }]}>
                <Text style={[styles.reportStatusText, { color: STATUS_COLORS[r.status] || '#888' }]}>{r.status}</Text>
              </View>
              <Text style={styles.reportDate}>
                {r.created_at ? new Date(r.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
              </Text>
            </View>
            <Text style={styles.reportQuestionText} numberOfLines={3}>{r.question_text}</Text>
            <View style={styles.reportMetaRow}>
              <Text style={styles.reportMetaLabel}>Joueur:</Text>
              <Text style={styles.reportMetaValue}>{r.user_pseudo}</Text>
            </View>
            <View style={styles.reportMetaRow}>
              <Text style={styles.reportMetaLabel}>Categorie:</Text>
              <Text style={styles.reportMetaValue}>{r.category}</Text>
            </View>
            <View style={styles.reportMetaRow}>
              <Text style={styles.reportMetaLabel}>Raison:</Text>
              <Text style={styles.reportMetaValue}>{REASON_LABELS[r.reason_type] || r.reason_type}</Text>
            </View>
            {r.description ? (
              <View style={styles.reportDescBox}>
                <Text style={styles.reportDescText}>{r.description}</Text>
              </View>
            ) : null}
            <View style={styles.reportActions}>
              {r.status !== 'reviewed' && (
                <TouchableOpacity
                  style={[styles.reportActionBtn, { backgroundColor: 'rgba(0,191,255,0.15)' }]}
                  onPress={() => updateReportStatus(r.id, 'reviewed')}
                >
                  <Text style={[styles.reportActionText, { color: '#00BFFF' }]}>Marquer examine</Text>
                </TouchableOpacity>
              )}
              {r.status !== 'resolved' && (
                <TouchableOpacity
                  style={[styles.reportActionBtn, { backgroundColor: 'rgba(0,200,83,0.15)' }]}
                  onPress={() => updateReportStatus(r.id, 'resolved')}
                >
                  <Text style={[styles.reportActionText, { color: '#00C853' }]}>Marquer resolu</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        ))
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>{'📭'}</Text>
          <Text style={styles.emptyText}>Aucun signalement{reportFilter ? ` (${reportFilter})` : ''}</Text>
        </View>
      )}
    </View>
  );

  // ── Main Admin Screen ──
  return (
    <View style={styles.opaqueWrapper} testID="admin-bg" nativeID="admin-bg">
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Retour</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Admin Duelo</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        {TABS.map((tab, i) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tabItem, activeTab === i && styles.tabItemActive]}
            onPress={() => setActiveTab(i)}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabText, activeTab === i && styles.tabTextActive]}>{tab}</Text>
            {i === 3 && reportCounts.pending > 0 && (
              <View style={styles.tabBadge}>
                <Text style={styles.tabBadgeText}>{reportCounts.pending}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#8A2BE2" />}
      >
        {activeTab === 0 && renderQuestionsTab()}
        {activeTab === 1 && renderThemesTab()}
        {activeTab === 2 && renderStatsTab()}
        {activeTab === 3 && renderReportsTab()}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  opaqueWrapper: { 
    flex: 1, 
    backgroundColor: '#000000',
    ...(Platform.OS === 'web' ? { position: 'fixed' as any, top: 0, left: 0, right: 0, bottom: 0, zIndex: 100 } : {}),
  },
  flex1: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 8 },

  // Auth
  authContainer: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  authCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 20, padding: 32,
    alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  lockIcon: { fontSize: 48, marginBottom: 16 },
  authTitle: { color: '#FFF', fontSize: 24, fontWeight: '800', marginBottom: 4 },
  authSubtitle: { color: '#666', fontSize: 14, marginBottom: 24 },
  passwordInput: {
    width: '100%', backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
    color: '#FFF', fontSize: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
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
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  backBtn: {
    paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 8,
  },
  backBtnText: { color: '#8A2BE2', fontSize: 14, fontWeight: '600' },
  headerTitle: { color: '#FFF', fontSize: 20, fontWeight: '800', marginLeft: 16 },

  // Tabs
  tabBar: {
    flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  tabItem: {
    flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 8,
    flexDirection: 'row', justifyContent: 'center',
  },
  tabItemActive: { backgroundColor: 'rgba(138,43,226,0.15)' },
  tabText: { color: '#666', fontSize: 12, fontWeight: '600' },
  tabTextActive: { color: '#8A2BE2', fontWeight: '800' },
  tabBadge: {
    backgroundColor: '#FF3B30', borderRadius: 8, minWidth: 16, height: 16,
    justifyContent: 'center', alignItems: 'center', marginLeft: 4, paddingHorizontal: 4,
  },
  tabBadgeText: { color: '#FFF', fontSize: 9, fontWeight: '800' },

  // Card
  card: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16, padding: 20, marginBottom: 16,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  cardTitle: { color: '#FFF', fontSize: 18, fontWeight: '700', marginBottom: 12 },
  cardDesc: { color: '#999', fontSize: 11, lineHeight: 17, marginBottom: 8, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  cardDescSub: { color: '#666', fontSize: 11, lineHeight: 16, marginBottom: 16 },

  // Stats
  statRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  statLabel: { color: '#BBB', fontSize: 13, flex: 1 },
  statValue: { color: '#8A2BE2', fontSize: 20, fontWeight: '900' },
  statValueSmall: { color: '#8A2BE2', fontSize: 15, fontWeight: '700' },
  noDataText: { color: '#555', fontSize: 13 },

  // Upload
  uploadBtn: {
    backgroundColor: 'rgba(138,43,226,0.1)',
    borderRadius: 12, paddingVertical: 28, alignItems: 'center',
    borderWidth: 2, borderColor: '#8A2BE2', borderStyle: 'dashed',
  },
  uploadBtnIcon: { fontSize: 32, marginBottom: 8 },
  uploadBtnText: { color: '#8A2BE2', fontSize: 16, fontWeight: '700' },

  // File info
  fileInfo: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(138,43,226,0.08)', borderRadius: 12, padding: 12,
    marginBottom: 12,
  },
  fileIcon: { fontSize: 24, marginRight: 12 },
  fileDetails: { flex: 1 },
  fileNameText: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  fileMetaText: { color: '#999', fontSize: 12, marginTop: 2 },
  resetBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(255,59,48,0.12)', justifyContent: 'center', alignItems: 'center',
  },
  resetBtnText: { color: '#FF3B30', fontSize: 14, fontWeight: '700' },

  // Columns
  columnsInfo: {
    backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 10,
    marginBottom: 12,
  },
  columnsTitle: { color: '#777', fontSize: 11, fontWeight: '600', marginBottom: 4 },
  columnsText: { color: '#999', fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },

  // Preview
  previewSection: { marginBottom: 12 },
  previewTitle: { color: '#777', fontSize: 12, fontWeight: '600', marginBottom: 8 },
  previewCard: {
    backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 12,
    marginBottom: 8, borderLeftWidth: 3, borderLeftColor: '#8A2BE2',
  },
  previewCategory: {
    color: '#8A2BE2', fontSize: 10, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4,
  },
  previewQuestion: { color: '#FFF', fontSize: 14, fontWeight: '600' },

  // Errors
  errorsSection: {
    backgroundColor: 'rgba(255,59,48,0.06)', borderRadius: 10, padding: 12,
    marginBottom: 12,
  },
  errorsTitle: { color: '#FF8A80', fontSize: 13, fontWeight: '700', marginBottom: 6 },
  errorText: { color: '#FF8A80', fontSize: 11, lineHeight: 18 },

  // Import button
  importBtn: {
    backgroundColor: '#00C853', borderRadius: 12, paddingVertical: 16,
    alignItems: 'center',
  },
  importBtnDanger: {
    backgroundColor: '#FF6B35', borderRadius: 12, paddingVertical: 16,
    alignItems: 'center',
  },
  importBtnDisabled: { opacity: 0.4 },
  importBtnText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  importingRow: { flexDirection: 'row', alignItems: 'center' },

  // Results
  resultCard: { borderColor: 'rgba(0,200,83,0.2)' },
  resultTitle: { color: '#FFF', fontSize: 18, fontWeight: '800', textAlign: 'center', marginBottom: 16 },
  resultStats: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 16 },
  resultStatItem: { alignItems: 'center' },
  resultStatNum: { color: '#00C853', fontSize: 28, fontWeight: '900' },
  resultStatLabel: { color: '#777', fontSize: 12, marginTop: 2 },

  // Result banner
  resultBanner: {
    backgroundColor: 'rgba(0,200,83,0.1)', borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: 'rgba(0,200,83,0.2)',
  },
  resultBannerText: { color: '#00C853', fontSize: 14, fontWeight: '700', textAlign: 'center' },

  // Totals row
  totalsRow: {
    flexDirection: 'row', justifyContent: 'space-around', marginBottom: 20,
    paddingVertical: 12, backgroundColor: 'rgba(138,43,226,0.06)', borderRadius: 12,
  },
  totalItem: { alignItems: 'center' },
  totalNum: { color: '#8A2BE2', fontSize: 24, fontWeight: '900' },
  totalLabel: { color: '#888', fontSize: 10, fontWeight: '600', marginTop: 2 },

  // Super Category
  scContainer: { marginBottom: 4 },
  scHeader: {
    flexDirection: 'row', alignItems: 'center', padding: 14,
    backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 12,
    borderLeftWidth: 4, marginBottom: 4,
  },
  scIcon: { fontSize: 22, marginRight: 12 },
  scHeaderInfo: { flex: 1 },
  scName: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  scMeta: { color: '#888', fontSize: 11, marginTop: 2 },
  scArrow: { color: '#666', fontSize: 16, fontWeight: '700' },

  // Cluster
  clContainer: { marginLeft: 16, marginBottom: 4 },
  clHeader: {
    flexDirection: 'row', alignItems: 'center', padding: 12,
    backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 10,
    marginBottom: 2,
  },
  clIcon: { fontSize: 18, marginRight: 10 },
  clHeaderInfo: { flex: 1 },
  clName: { color: '#DDD', fontSize: 14, fontWeight: '600' },
  clMeta: { color: '#777', fontSize: 10, marginTop: 1 },
  clArrow: { color: '#555', fontSize: 14, fontWeight: '700' },

  // Theme row
  themeRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 8,
    paddingHorizontal: 12, marginLeft: 28,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.03)',
  },
  themeRowSelected: {
    backgroundColor: 'rgba(255,59,48,0.08)',
  },
  themeIdBadge: {
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginRight: 10,
  },
  themeIdText: { fontSize: 10, fontWeight: '800', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  themeInfo: { flex: 1 },
  themeName: { color: '#CCC', fontSize: 13, fontWeight: '500' },
  themeQCount: { color: '#8A2BE2', fontSize: 13, fontWeight: '700' },

  // Match Stats
  matchStatRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  matchStatRank: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(138,43,226,0.15)',
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  matchStatRankText: { color: '#8A2BE2', fontSize: 12, fontWeight: '800' },
  matchStatInfo: { flex: 1 },
  matchStatHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  matchStatName: { color: '#DDD', fontSize: 14, fontWeight: '600', flex: 1, marginRight: 8 },
  matchStatCount: { color: '#00C853', fontSize: 16, fontWeight: '800' },
  matchStatBarBg: {
    height: 6, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 3,
    overflow: 'hidden', marginBottom: 4,
  },
  matchStatBar: { height: 6, backgroundColor: '#8A2BE2', borderRadius: 3 },
  matchStatId: { color: '#555', fontSize: 10, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },

  // Reports
  reportFilterRow: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  reportFilterBtn: {
    flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  reportFilterBtnActive: { backgroundColor: 'rgba(138,43,226,0.15)', borderColor: '#8A2BE2' },
  reportFilterText: { color: '#777', fontSize: 11, fontWeight: '600' },
  reportFilterTextActive: { color: '#8A2BE2' },

  reportCountsRow: { flexDirection: 'row', gap: 8 },
  reportCountBadge: { flex: 1, borderRadius: 10, padding: 10, alignItems: 'center' },
  reportCountNum: { fontSize: 20, fontWeight: '900' },
  reportCountLabel: { color: '#888', fontSize: 9, fontWeight: '600', marginTop: 2 },

  // Report card
  reportCard: {
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 16, marginBottom: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  reportCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  reportStatusBadge: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  reportStatusText: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  reportDate: { color: '#666', fontSize: 10 },
  reportQuestionText: { color: '#EEE', fontSize: 14, fontWeight: '600', lineHeight: 20, marginBottom: 10 },
  reportMetaRow: { flexDirection: 'row', paddingVertical: 2 },
  reportMetaLabel: { color: '#777', fontSize: 12, width: 80 },
  reportMetaValue: { color: '#BBB', fontSize: 12, fontWeight: '500', flex: 1 },
  reportDescBox: {
    backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 10, marginTop: 8,
    borderLeftWidth: 3, borderLeftColor: '#FFA500',
  },
  reportDescText: { color: '#BBB', fontSize: 12, lineHeight: 18, fontStyle: 'italic' },
  reportActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  reportActionBtn: { flex: 1, borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  reportActionText: { fontSize: 11, fontWeight: '700' },

  // Empty state
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { color: '#666', fontSize: 14, fontWeight: '500' },

  // Checkbox
  checkbox: {
    width: 20, height: 20, borderRadius: 4, borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)', marginRight: 10,
    justifyContent: 'center', alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#FF3B30', borderColor: '#FF3B30',
  },
  checkboxPartial: {
    borderColor: '#FF3B30',
  },
  checkMark: { color: '#FFF', fontSize: 12, fontWeight: '900', lineHeight: 14 },

  // Select all row
  selectAllRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 8,
    paddingHorizontal: 12, marginLeft: 28,
    backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 6, marginBottom: 4,
  },
  selectAllText: { color: '#999', fontSize: 11, fontWeight: '600' },

  // Delete bar
  deleteBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(255,59,48,0.12)', borderRadius: 12, padding: 14,
    marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,59,48,0.3)',
  },
  deleteBarText: { color: '#FF8A80', fontSize: 14, fontWeight: '600' },
  deleteBarBtn: {
    backgroundColor: '#FF3B30', borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10,
  },
  deleteBarBtnText: { color: '#FFF', fontSize: 14, fontWeight: '800' },
});
