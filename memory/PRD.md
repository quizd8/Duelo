# Duelo - PRD (Product Requirements Document)

## Vision
Application de quiz multijoueur compétitive avec esthétique "Dark Mode Premium", inspirée de QuizUp (2014).

## Stack Technique
- **Frontend**: React Native Expo (SDK 54) avec Expo Router
- **Backend**: FastAPI (Python)
- **Base de données**: Supabase (PostgreSQL) via SQLAlchemy + asyncpg
- **Migrations**: Alembic

## Fonctionnalités Implémentées (MVP)

### 1. Authentification
- ✅ Mode Invité avec pseudo unique (vérification en temps réel)
- ⬜ Sign in with Google (à implémenter)
- ⬜ Sign in with Apple (à implémenter)
- ⬜ Email/Mot de passe (backend prêt, UI à implémenter)

### 2. Système de Jeu
- ✅ Matchmaking avec animation radar
- ✅ Bot fallback après 5 secondes (pseudos et avatars réalistes)
- ✅ 7 questions par match
- ✅ Chronomètre 10 secondes
- ✅ Scoring basé sur la vitesse (20pts max → 10pts min)
- ✅ Feedback haptique (vibration) sur réponse
- ✅ Feedback couleur (vert/rouge) sur bonne/mauvaise réponse

### 3. Catégories
- ✅ Séries TV Cultes (10 questions)
- ✅ Géographie Mondiale (10 questions)
- ✅ Histoire de France (10 questions)

### 4. Progression
- ✅ Système d'XP par catégorie
- ✅ Niveaux 1-100
- ✅ Titres débloquables (Novice → Divin)
- ✅ Statistiques (matchs joués, victoires, win rate, best streak)

### 5. Classements
- ✅ Leaderboard Monde
- ⬜ Classements par Ville/Région/Pays/Continent (IP geolocation à implémenter)

### 6. Partage
- ✅ Carte de score en fin de match
- ✅ Bouton "Défier un ami" (partage natif)
- ⬜ Deep Link (à implémenter)

### 7. Admin Dashboard
- ✅ Route /admin-dashboard protégée par mot de passe
- ✅ Sélecteur de catégorie
- ✅ Zone de texte JSON
- ✅ Bulk Import avec détection de doublons
- ✅ Validation du format JSON

## Architecture Base de Données
- **users**: id, pseudo (unique), email, password_hash, is_guest, city, region, country, continent, xp_series_tv, xp_geographie, xp_histoire, total_xp, matches_played, matches_won, best_streak, current_streak
- **questions**: id, category, question_text (unique constraint), options (JSON), correct_option, difficulty
- **matches**: id, player1_id, player2_pseudo, player2_is_bot, category, player1_score, player2_score, winner_id, questions_data (JSON)

## API Endpoints
- POST /api/auth/register-guest
- POST /api/auth/register
- POST /api/auth/login
- GET /api/auth/user/{id}
- POST /api/auth/check-pseudo
- GET /api/categories
- GET /api/game/questions?category=X
- POST /api/game/matchmaking
- POST /api/game/submit
- GET /api/leaderboard?scope=world
- GET /api/profile/{user_id}
- POST /api/admin/verify
- POST /api/admin/import-questions
- POST /api/admin/seed

## Prochaines Étapes
1. Authentification Google/Apple/Email
2. Géolocalisation IP pour classements multi-niveaux
3. Deep Links pour partage
4. Matchmaking temps réel (WebSocket)
5. Plus de catégories et questions
6. Système de saisons et récompenses
