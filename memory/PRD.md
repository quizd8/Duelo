# DUELO - Quiz Compétitif en Temps Réel

## Description
Application mobile de quiz compétitif en temps réel construite avec Expo (React Native) + FastAPI + MongoDB.

## Architecture
- **Frontend**: Expo (React Native) avec expo-router
- **Backend**: FastAPI (Python)
- **Database**: MongoDB
- **Navigation**: Custom tab bar avec 5 onglets (Accueil, Social, Jouer, Thèmes, Profil)

## Structure des fichiers clés
```
/app
├── backend/
│   └── server.py
└── frontend/
    ├── app/
    │   ├── (tabs)/
    │   │   ├── _layout.tsx    # Tab navigator avec CustomTabBar + unmountOnBlur
    │   │   ├── accueil.tsx    # Page d'accueil (fil d'activité, duels)
    │   │   ├── play.tsx       # Page "Jouer" (sélection catégories) - renommé de home.tsx
    │   │   ├── players.tsx    # Page Social
    │   │   ├── profile.tsx    # Page Profil
    │   │   └── themes.tsx     # Page Thèmes
    │   ├── _layout.tsx
    │   ├── index.tsx          # Écran de login (redesigné)
    │   └── +html.tsx
    ├── assets/
    │   ├── header/            # duelo_logo.webp, search.webp, message.webp, notification.webp
    │   └── tabs/
    ├── components/
    │   ├── CosmicBackground.tsx
    │   ├── CustomTabBar.tsx
    │   ├── DueloHeader.tsx
    │   └── Header.tsx
    └── theme/
        └── glassTheme.ts
```

## Fonctionnalités implémentées
- Inscription/connexion invité
- Navigation par onglets avec icônes personnalisées
- Page d'accueil avec duels en attente et activité sociale
- Sélection de catégories de quiz (super catégories)
- Page profil avec auto-création backend
- Mur social par catégorie
- Matchmaking et quiz en temps réel

## Points techniques critiques
- **`unmountOnBlur: true`** dans `_layout.tsx` : NE PAS MODIFIER (empêche le bug de superposition des pages web)
- **CustomTabBar** : Toutes les modifications visuelles du tab bar se font dans `CustomTabBar.tsx`
- **Backend auto-create user** : Le endpoint `/api/profile-v2` crée automatiquement un profil si inexistant

## Historique des modifications
- **09/03/2026** : Redesign page d'accueil (index.tsx) - Logo Duelo, tagline neon-glow pill, suppression icône éclair et footer
- **09/03/2026** : Renommage `home.tsx` → `play.tsx` pour clarifier le rôle du fichier (page "Jouer")
- Sessions précédentes : Icônes personnalisées, fix superposition pages, fix boucle profil, fix couleurs icônes inactives
- **14/03/2026** : Ajout fonctionnalité "Signaler une erreur dans une question" après quiz (API backend + modal frontend sur écran résultats)
- **Session précédente** : Refonte admin (fond noir, onglets Questions/Thèmes/Stats/Signalements), upload CSV thèmes, vue hiérarchique, stats filtrées, gestion signalements
- **Session actuelle** : Mélange aléatoire des options de réponse (25% par position) sur les endpoints `/api/game/questions` et `/api/game/questions-v2` via `shuffle_question_options()`
