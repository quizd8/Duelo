# Duelo - Product Requirements Document

## Overview
Duelo is a competitive real-time quiz mobile app built with Expo (React Native) and FastAPI backend.

## Architecture
- **Frontend**: Expo (React Native) with Expo Router
- **Backend**: FastAPI (Python) with SQLAlchemy
- **Platform**: Cross-platform (iOS, Android, Web)

## Completed Work

### Session 1 - Initial Bug Fixes
- Fixed page overlap bug on web preview
- Fixed cosmic background not appearing on all pages
- Fixed background being overly zoomed on web
- Fixed profile page crash on Expo Go (null safety)

### Session 2 - Icons & Overlap Fix (March 2026)
- **Footer icons**: Replaced 5 tab bar icons with custom .webp images (castle, heart, swords, cards, silhouette)
- **Header icons**: Replaced 4 header icons with custom .webp images (search, DUELO logo, message, notification)  
- **Footer label**: Corrected "MESSAGE" → "Social"
- **Custom Tab Bar**: Created fully custom tab bar bypassing React Navigation's dual-rendering system that caused icon brightness issues
- **Profile page crash**: Backend auto-recreates users that don't exist in DB (prevents 404 → redirect loop)
- **Page overlap fix (WEB)**: 
  - Root cause: React Navigation doesn't properly hide inactive tab screens on web
  - Fix: Removed all transparent background CSS hacks. CosmicBackground now renders its own opaque Image background per screen on web, covering inactive screens
  - Removed broken `useIsFocused` approach (crashes outside NavigationContainer)

## Key Files
- `frontend/app/(tabs)/_layout.tsx` - Custom tab bar (bypasses React Navigation icons)
- `frontend/app/_layout.tsx` - Root stack navigator (clean, no CSS hacks)
- `frontend/components/CosmicBackground.tsx` - Platform-aware background (Image on web, ImageBackground on native)
- `frontend/assets/tabs/` - Custom tab icons (.webp)
- `frontend/assets/header/` - Custom header icons (.webp)
- `backend/server.py` - FastAPI backend (profile-v2 auto-creates missing users)

## Backlog
- P2: Review redundancy of accueil.tsx vs home.tsx
- P3: Verify icon brightness on Expo Go mobile
