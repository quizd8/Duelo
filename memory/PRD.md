# Duelo - PRD (Product Requirements Document)

## Vision
Application de quiz multijoueur compétitive avec esthétique "Dark Mode Premium", inspirée de QuizUp (2014).

## Stack Technique
- **Frontend**: React Native Expo (SDK 54) avec Expo Router
- **Backend**: FastAPI (Python) avec SQLAlchemy + asyncpg
- **Base de données**: PostgreSQL (Supabase)
- **Migrations**: Alembic

## Fonctionnalités Implémentées

### 1. Authentification
- Mode Invité avec pseudo unique (vérification en temps réel)
- Détection automatique du pays via IP (ip-api.com)

### 2. Système de Jeu
- Matchmaking intelligent par catégorie (niveau +/- 5)
- Bot fallback après 5 secondes
- 7 questions par match, chronomètre 10s
- Scoring basé sur la vitesse

### 3. Catégories
- Séries TV Cultes, Géographie Mondiale, Histoire de France (10 questions chacune)

### 4. Progression Par Catégorie
- XP par catégorie (formule: 500 + (N-1)^2 * 10, cap niveau 50)
- Titres de maîtrise débloquables (niveaux 1, 10, 20, 35, 50)
- Sélection de titre à afficher
- Modal de célébration à chaque nouveau titre

### 5. Page Détail Catégorie + Mur Social
- Header catégorie (icône, nom, description)
- Boutons Jouer / Suivre / Classement
- Barre de progression questions complétées
- Stats: niveau, followers, total questions
- Classement par catégorie (modal) - lignes cliquables vers profil joueur
- Mur communautaire: posts texte + image
- Likes (toggle) + Commentaires
- Follow/Unfollow catégorie
- Noms d'auteurs cliquables vers profil joueur

### 6. Profil Personnel (Redesign QuizUp - Testé 2026-03-06)
- **Hero Card**: Avatar circulaire avec anneau violet, pseudo, titre badge éditable, pays + drapeau
- **Stats Row**: PARTIES / ABONNÉS / ABONNEMENTS (gros chiffres, séparateurs verticaux)
- **MES THÈMES**: Grille de cartes colorées (📺 Séries TV violet, 🌍 Géographie cyan, 🏛️ Histoire or) avec icône, nom, niveau, barre XP
- **STATISTIQUES**: Victoires, Win Rate, Best Streak, XP Total
- **MES TITRES**: Chips sélectionnables par catégorie
- **HISTORIQUE**: Cartes de matchs avec résultat et XP
- **Déconnexion**: Bouton logout

### 7. Profil Public Joueur (Redesign QuizUp - Testé 2026-03-06)
- Même style Hero Card que le profil personnel
- Titres de champion (#1 par catégorie) avec bannière dorée
- **Boutons d'action**: ⚡ Jouer / + Suivre / 💬 Message (cachés pour son propre profil)
- **SES THÈMES**: Grille catégories avec niveaux
- **PUBLICATIONS**: Mur de posts cross-catégories (lecture seule)
- Follow/Unfollow avec mise à jour optimiste

### 8. Système de Follow entre joueurs (Testé 2026-03-06)
- Follow/Unfollow toggle entre joueurs
- Protection self-follow
- Compteurs followers/following intégrés dans les profils

### 9. Chat Éphémère (Testé 2026-03-06)
- Messagerie 1-à-1 entre joueurs
- Messages auto-supprimés après 7 jours
- Bulles colorées, indicateur non-lus, polling 5s

### 10. Onglet Joueurs (Testé 2026-03-06)
- Recherche de joueurs par pseudo
- Filtres par catégorie
- Onglet Messages avec conversations

### 11. Admin Dashboard
- Import bulk de questions avec détection doublons

## Architecture Base de Données
- **users**: id, pseudo, email, country, xp_series_tv, xp_geographie, xp_histoire, selected_title, mmr, stats
- **questions**: id, category, question_text, options, correct_option, difficulty
- **matches**: id, player1_id, player2_pseudo, category, scores, xp_earned
- **category_follows**: id, user_id, category_id
- **wall_posts**: id, user_id, category_id, content, image_base64
- **post_likes**: id, user_id, post_id
- **post_comments**: id, user_id, post_id, content
- **player_follows**: id, follower_id, followed_id (UNIQUE)
- **chat_messages**: id, sender_id, receiver_id, content, read, created_at

## Architecture Frontend
```
frontend/app/
├── (tabs)/
│   ├── _layout.tsx      # Tab navigator (Jouer / Joueurs / Profil)
│   ├── home.tsx         # Écran principal, liste catégories
│   ├── players.tsx      # Recherche joueurs + Messages
│   └── profile.tsx      # Profil personnel (QuizUp style)
├── category-detail.tsx  # Page détail catégorie + mur social
├── player-profile.tsx   # Profil public joueur (QuizUp style)
├── chat.tsx             # Chat 1-à-1
├── matchmaking.tsx      # Écran matchmaking
├── results.tsx          # Résultats de match
└── index.tsx            # Écran d'inscription
```

## Prochaines Étapes (Backlog)
1. **P1** - Authentification Google/Apple (fournira l'âge)
2. **P2** - Filtre joueurs par âge (post-auth Google/Apple)
3. **P2** - Filtre joueurs par distance (géolocalisation IP déjà implémentée)
4. **P2** - Support vidéo dans les posts du mur
5. **P2** - Plus de catégories et questions
6. **P3** - Deep Links pour partage
7. **P3** - Matchmaking temps réel (WebSocket)
8. **P3** - Système de saisons et récompenses
9. **P3** - Notifications push
10. **P3** - Titres de championnat (événements temporels)
11. **Refactoring** - Découper server.py en modules
