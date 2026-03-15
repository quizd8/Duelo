from fastapi import FastAPI, APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse, FileResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
import random
import hashlib
import secrets
import httpx
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from sqlalchemy import select, func, text, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from models import User, Question, Match, CategoryFollow, WallPost, PostLike, PostComment, PlayerFollow, ChatMessage, Notification, NotificationSettings, Theme, UserThemeXP, QuestionReport, generate_uuid
import csv
import io

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', 'Temporaire1!')
JWT_SECRET = os.environ.get('JWT_SECRET', 'duelo_secret')

app = FastAPI()
api_router = APIRouter(prefix="/api")

@api_router.get("/static/fond_duelo.webp")
async def serve_bg():
    return FileResponse(ROOT_DIR / "static" / "fond_duelo.webp", media_type="image/webp")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ── Pydantic Models ──

class GuestRegister(BaseModel):
    pseudo: str

class EmailRegister(BaseModel):
    pseudo: str
    email: str
    password: str

class LoginRequest(BaseModel):
    email: str
    password: str

class UserResponse(BaseModel):
    id: str
    pseudo: str
    email: Optional[str] = None
    is_guest: bool
    avatar_seed: str
    city: Optional[str] = None
    region: Optional[str] = None
    country: Optional[str] = None
    continent: Optional[str] = None
    xp_series_tv: int = 0
    xp_geographie: int = 0
    xp_histoire: int = 0
    xp_cinema: int = 0
    xp_sport: int = 0
    xp_musique: int = 0
    xp_sciences: int = 0
    xp_gastronomie: int = 0
    total_xp: int = 0
    matches_played: int = 0
    matches_won: int = 0
    best_streak: int = 0
    current_streak: int = 0
    mmr: float = 1000.0

class QuestionOut(BaseModel):
    id: str
    category: str
    question_text: str
    options: list
    correct_option: int
    difficulty: str

class MatchSubmit(BaseModel):
    player_id: str
    category: str
    player_score: int
    opponent_score: int
    opponent_pseudo: str
    opponent_is_bot: bool
    correct_count: int = 0
    opponent_level: int = 1
    questions_data: Optional[list] = None

class MatchmakingRequest(BaseModel):
    category: str = "series_tv"
    player_id: Optional[str] = None

class MatchResponse(BaseModel):
    id: str
    player1_id: str
    player2_pseudo: Optional[str] = None
    player2_is_bot: bool
    category: str
    player1_score: int
    player2_score: int
    player1_correct: int = 0
    winner_id: Optional[str] = None
    xp_earned: int = 0
    xp_breakdown: Optional[dict] = None
    new_title: Optional[dict] = None
    new_level: Optional[int] = None
    created_at: str

class SelectTitleRequest(BaseModel):
    user_id: str
    title: str

class BulkImportRequest(BaseModel):
    category: str
    questions: list

class LeaderboardEntry(BaseModel):
    pseudo: str
    avatar_seed: str
    total_xp: int
    matches_won: int
    rank: int

class AdminVerify(BaseModel):
    password: str

# ── Helper Functions ──

def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    hashed = hashlib.sha256((password + salt).encode()).hexdigest()
    return f"{salt}:{hashed}"

def verify_password(password: str, stored: str) -> bool:
    salt, hashed = stored.split(':')
    return hashlib.sha256((password + salt).encode()).hexdigest() == hashed

# ── Per-Category Level System ──
# Formula: XP needed for level N → N+1 = 500 + (N-1)² × 10
# Cap: Level 50

MAX_LEVEL = 50

def xp_for_next_level(level: int) -> int:
    """XP needed to go from level to level+1."""
    return 500 + (level - 1) ** 2 * 10

def get_cumulative_xp(level: int) -> int:
    """Total XP needed to reach a specific level."""
    total = 0
    for l in range(1, level):
        total += xp_for_next_level(l)
    return total

def get_category_level(xp: int) -> int:
    """Calculate level from category XP. Cap at 50. Level 0 if no XP."""
    if xp <= 0:
        return 0
    level = 1
    cumulative = 0
    while level < MAX_LEVEL:
        needed = xp_for_next_level(level)
        if cumulative + needed > xp:
            break
        cumulative += needed
        level += 1
    return level

def get_xp_progress(xp: int, level: int) -> dict:
    """Get XP progress within current level."""
    if level >= MAX_LEVEL:
        return {"current": 0, "needed": 1, "progress": 1.0}
    if level == 0:
        # Level 0 → 1: need 500 XP (first level threshold)
        needed = xp_for_next_level(1)
        return {
            "current": xp,
            "needed": needed,
            "progress": round(min(xp / max(needed, 1), 1.0), 3)
        }
    current_level_xp = get_cumulative_xp(level)
    next_level_xp = get_cumulative_xp(level + 1)
    xp_in_level = xp - current_level_xp
    xp_needed = next_level_xp - current_level_xp
    return {
        "current": xp_in_level,
        "needed": xp_needed,
        "progress": round(min(xp_in_level / max(xp_needed, 1), 1.0), 3)
    }

# ── Category Titles (unlocked at levels 1, 10, 20, 35, 50) ──

TITLE_THRESHOLDS = [1, 10, 20, 35, 50]

CATEGORY_TITLES = {
    "series_tv": {
        1: "Téléspectateur",
        10: "Binge-watcher",
        20: "Critique",
        35: "Showrunner",
        50: "Légende du Petit Écran",
    },
    "geographie": {
        1: "Touriste",
        10: "Explorateur",
        20: "Globe-trotter",
        35: "Cartographe",
        50: "Maître du Monde",
    },
    "histoire": {
        1: "Élève",
        10: "Chroniqueur",
        20: "Historien",
        35: "Archiviste Royal",
        50: "Gardien du Temps",
    },
    "cinema": {
        1: "Spectateur",
        10: "Cinéphile",
        20: "Critique d'Art",
        35: "Réalisateur",
        50: "Légende du 7e Art",
    },
    "sport": {
        1: "Supporter",
        10: "Athlète",
        20: "Champion",
        35: "Coach Légendaire",
        50: "Hall of Fame",
    },
    "musique": {
        1: "Auditeur",
        10: "Mélomane",
        20: "Virtuose",
        35: "Compositeur",
        50: "Maestro Éternel",
    },
    "sciences": {
        1: "Curieux",
        10: "Laborantin",
        20: "Chercheur",
        35: "Professeur",
        50: "Prix Nobel",
    },
    "gastronomie": {
        1: "Gourmand",
        10: "Gourmet",
        20: "Chef Cuisinier",
        35: "Chef Étoilé",
        50: "Maître Culinaire",
    },
}

def get_category_title(category: str, level: int) -> str:
    """Get the highest unlocked title for a category at given level."""
    titles = CATEGORY_TITLES.get(category, {})
    current_title = ""
    for threshold in sorted(titles.keys()):
        if level >= threshold:
            current_title = titles[threshold]
    return current_title

def get_unlocked_titles_for_category(category: str, level: int) -> list:
    """Get all unlocked titles for a category at given level."""
    titles = CATEGORY_TITLES.get(category, {})
    unlocked = []
    for threshold in sorted(titles.keys()):
        if level >= threshold:
            unlocked.append({"level": threshold, "title": titles[threshold]})
    return unlocked

def get_all_unlocked_titles(user) -> list:
    """Get all unlocked titles across all categories for a user."""
    all_titles = []
    for cat_key, xp_field in CATEGORY_XP_FIELD.items():
        cat_xp = getattr(user, xp_field, 0)
        cat_level = get_category_level(cat_xp)
        for t in get_unlocked_titles_for_category(cat_key, cat_level):
            all_titles.append({**t, "category": cat_key})
    return all_titles

def check_new_title(category: str, level_before: int, level_after: int):
    """Check if a new title was unlocked. Return highest new one."""
    if level_before >= level_after:
        return None
    titles = CATEGORY_TITLES.get(category, {})
    new_title = None
    for threshold in TITLE_THRESHOLDS:
        if level_before < threshold <= level_after:
            title = titles.get(threshold)
            if title:
                new_title = {"level": threshold, "title": title, "category": category}
    return new_title

BOT_NAMES = [
    "NeoQuizzer", "BrainStorm_42", "QuizNinja_FR", "Le_Sage_77", "MindBlaster",
    "Trivia_King", "CyberBrain_X", "Le_Savant", "QuizMaster_Pro", "Flash_Quiz",
    "Enigma_99", "Le_Cerveau", "SmartFox_22", "Quiz_Phoenix", "Galaxy_Mind"
]

CATEGORY_MAP = {
    "series_tv": "Séries TV Cultes",
    "geographie": "Géographie Mondiale",
    "histoire": "Histoire de France",
    "cinema": "Cinéma",
    "sport": "Sport",
    "musique": "Musique",
    "sciences": "Sciences",
    "gastronomie": "Gastronomie",
}

CATEGORY_XP_FIELD = {
    "series_tv": "xp_series_tv",
    "geographie": "xp_geographie",
    "histoire": "xp_histoire",
    "cinema": "xp_cinema",
    "sport": "xp_sport",
    "musique": "xp_musique",
    "sciences": "xp_sciences",
    "gastronomie": "xp_gastronomie",
}

TOTAL_QUESTIONS = 7

# ── Auth Routes ──

@api_router.post("/auth/register-guest", response_model=UserResponse)
async def register_guest(data: GuestRegister, request: Request, db: AsyncSession = Depends(get_db)):
    pseudo = data.pseudo.strip()
    if len(pseudo) < 3 or len(pseudo) > 20:
        raise HTTPException(status_code=400, detail="Le pseudo doit contenir entre 3 et 20 caractères")

    result = await db.execute(select(User).where(User.pseudo == pseudo))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Ce pseudo est déjà pris")

    # Detect country from IP
    country = await detect_country_from_ip(request)

    user = User(pseudo=pseudo, is_guest=True, country=country)
    db.add(user)
    await db.commit()
    await db.refresh(user)

    return UserResponse(
        id=user.id, pseudo=user.pseudo, email=user.email,
        is_guest=user.is_guest, avatar_seed=user.avatar_seed,
        city=user.city, region=user.region, country=user.country,
        continent=user.continent, xp_series_tv=user.xp_series_tv,
        xp_geographie=user.xp_geographie, xp_histoire=user.xp_histoire,
        total_xp=user.total_xp, matches_played=user.matches_played,
        matches_won=user.matches_won, best_streak=user.best_streak,
        current_streak=user.current_streak
    )


@api_router.post("/auth/register", response_model=UserResponse)
async def register_email(data: EmailRegister, db: AsyncSession = Depends(get_db)):
    pseudo = data.pseudo.strip()
    if len(pseudo) < 3:
        raise HTTPException(status_code=400, detail="Pseudo trop court")

    result = await db.execute(select(User).where(User.pseudo == pseudo))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Ce pseudo est déjà pris")

    result = await db.execute(select(User).where(User.email == data.email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Cet email est déjà utilisé")

    user = User(
        pseudo=pseudo, email=data.email,
        password_hash=hash_password(data.password), is_guest=False
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    return UserResponse(
        id=user.id, pseudo=user.pseudo, email=user.email,
        is_guest=user.is_guest, avatar_seed=user.avatar_seed,
        city=user.city, region=user.region, country=user.country,
        continent=user.continent, xp_series_tv=user.xp_series_tv,
        xp_geographie=user.xp_geographie, xp_histoire=user.xp_histoire,
        total_xp=user.total_xp, matches_played=user.matches_played,
        matches_won=user.matches_won, best_streak=user.best_streak,
        current_streak=user.current_streak
    )


@api_router.post("/auth/login", response_model=UserResponse)
async def login(data: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()
    if not user or not user.password_hash or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")

    return UserResponse(
        id=user.id, pseudo=user.pseudo, email=user.email,
        is_guest=user.is_guest, avatar_seed=user.avatar_seed,
        city=user.city, region=user.region, country=user.country,
        continent=user.continent, xp_series_tv=user.xp_series_tv,
        xp_geographie=user.xp_geographie, xp_histoire=user.xp_histoire,
        total_xp=user.total_xp, matches_played=user.matches_played,
        matches_won=user.matches_won, best_streak=user.best_streak,
        current_streak=user.current_streak
    )


@api_router.get("/auth/user/{user_id}", response_model=UserResponse)
async def get_user(user_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")

    return UserResponse(
        id=user.id, pseudo=user.pseudo, email=user.email,
        is_guest=user.is_guest, avatar_seed=user.avatar_seed,
        city=user.city, region=user.region, country=user.country,
        continent=user.continent, xp_series_tv=user.xp_series_tv,
        xp_geographie=user.xp_geographie, xp_histoire=user.xp_histoire,
        total_xp=user.total_xp, matches_played=user.matches_played,
        matches_won=user.matches_won, best_streak=user.best_streak,
        current_streak=user.current_streak
    )


@api_router.post("/auth/check-pseudo")
async def check_pseudo(data: GuestRegister, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.pseudo == data.pseudo.strip()))
    exists = result.scalar_one_or_none() is not None
    return {"available": not exists}


# ── Categories ──

@api_router.get("/categories")
async def get_categories(db: AsyncSession = Depends(get_db)):
    categories = []
    for key, name in CATEGORY_MAP.items():
        result = await db.execute(
            select(func.count()).select_from(Question).where(Question.category == key)
        )
        count = result.scalar()
        categories.append({"id": key, "name": name, "question_count": count})
    return categories


# ── Game Routes ──

@api_router.get("/game/questions")
async def get_game_questions(category: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Question).where(Question.category == category).order_by(func.random()).limit(7)
    )
    questions = result.scalars().all()
    if len(questions) < 7:
        # If not enough, get all available
        result = await db.execute(
            select(Question).where(Question.category == category).order_by(func.random())
        )
        questions = result.scalars().all()

    return [
        QuestionOut(
            id=q.id, category=q.category, question_text=q.question_text,
            options=q.options, correct_option=q.correct_option, difficulty=q.difficulty
        ) for q in questions
    ]


STREAK_BONUSES = {3: 10, 5: 25, 10: 50}  # streak_count: bonus_xp

def get_streak_bonus(streak: int) -> int:
    """Returns cumulative streak bonus XP."""
    if streak >= 10:
        return 50
    if streak >= 5:
        return 25
    if streak >= 3:
        return 10
    return 0

def get_streak_badge(streak: int) -> str:
    """Returns badge emoji based on streak."""
    if streak >= 10:
        return "glow"
    if streak >= 5:
        return "bolt"
    if streak >= 3:
        return "fire"
    return ""

def get_current_season() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")

def ensure_season(user):
    """Reset seasonal XP if we're in a new month."""
    current = get_current_season()
    if user.season_month != current:
        user.seasonal_xp_series_tv = 0
        user.seasonal_xp_geographie = 0
        user.seasonal_xp_histoire = 0
        user.seasonal_xp_cinema = 0
        user.seasonal_xp_sport = 0
        user.seasonal_xp_musique = 0
        user.seasonal_xp_sciences = 0
        user.seasonal_xp_gastronomie = 0
        user.seasonal_total_xp = 0
        user.season_month = current


@api_router.post("/game/matchmaking")
async def start_matchmaking(data: MatchmakingRequest, db: AsyncSession = Depends(get_db)):
    """Returns a bot opponent with category-matched level."""
    player_level = 0
    player_title = ""

    if data.player_id:
        result = await db.execute(select(User).where(User.id == data.player_id))
        user = result.scalar_one_or_none()
        if user:
            xp_field = CATEGORY_XP_FIELD.get(data.category)
            player_xp = getattr(user, xp_field, 0) if xp_field else 0
            player_level = get_category_level(player_xp)
            player_title = get_category_title(data.category, player_level)

    # Bot with similar category level (+/- 5)
    bot_level = max(0, min(MAX_LEVEL, player_level + random.randint(-5, 5)))
    bot_name = random.choice(BOT_NAMES)
    bot_seed = secrets.token_hex(4)
    bot_title = get_category_title(data.category, bot_level)
    bot_streak = random.choice([0, 0, 0, 1, 2, 3, 4, 5])

    return {
        "player": {
            "level": player_level,
            "title": player_title,
        },
        "opponent": {
            "pseudo": bot_name,
            "avatar_seed": bot_seed,
            "is_bot": True,
            "level": bot_level,
            "title": bot_title,
            "streak": bot_streak,
            "streak_badge": get_streak_badge(bot_streak),
        }
    }


@api_router.post("/game/submit", response_model=MatchResponse)
async def submit_match(data: MatchSubmit, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == data.player_id))
    user = result.scalar_one_or_none()

    won = data.player_score > data.opponent_score
    perfect = data.correct_count == TOTAL_QUESTIONS

    # ── Level BEFORE XP gain ──
    xp_field = CATEGORY_XP_FIELD.get(data.category)
    cat_xp_before = getattr(user, xp_field, 0) if (user and xp_field) else 0
    level_before = get_category_level(cat_xp_before)

    # ── XP Calculation ──
    base_xp = data.player_score * 2
    victory_bonus = 50 if won else 0
    perfection_bonus = 50 if perfect else 0

    # Giant Slayer: beat opponent 15+ levels higher
    giant_slayer_bonus = 100 if (won and data.opponent_level - level_before >= 15) else 0

    # Streak bonus (calculated AFTER updating streak)
    new_streak = (user.current_streak + 1) if (user and won) else 0
    streak_bonus = get_streak_bonus(new_streak) if won else 0

    total_xp = base_xp + victory_bonus + perfection_bonus + giant_slayer_bonus + streak_bonus

    xp_breakdown = {
        "base": base_xp,
        "victory": victory_bonus,
        "perfection": perfection_bonus,
        "giant_slayer": giant_slayer_bonus,
        "streak": streak_bonus,
        "total": total_xp,
    }

    # ── Create match record ──
    match = Match(
        player1_id=data.player_id,
        player2_pseudo=data.opponent_pseudo,
        player2_is_bot=data.opponent_is_bot,
        category=data.category,
        player1_score=data.player_score,
        player2_score=data.opponent_score,
        player1_correct=data.correct_count,
        winner_id=data.player_id if won else None,
        xp_earned=total_xp,
        xp_breakdown=xp_breakdown,
        questions_data=data.questions_data,
    )
    db.add(match)

    # ── Update user ──
    new_title_info = None
    new_level = None
    if user:
        user.matches_played += 1

        if won:
            user.matches_won += 1
            user.current_streak += 1
            if user.current_streak > user.best_streak:
                user.best_streak = user.current_streak
        else:
            user.current_streak = 0

        # All-Time XP
        if xp_field:
            setattr(user, xp_field, getattr(user, xp_field, 0) + total_xp)
        user.total_xp = user.xp_series_tv + user.xp_geographie + user.xp_histoire + user.xp_cinema + user.xp_sport + user.xp_musique + user.xp_sciences + user.xp_gastronomie

        # Seasonal XP
        ensure_season(user)
        seasonal_field = f"seasonal_{xp_field}" if xp_field else None
        if seasonal_field:
            setattr(user, seasonal_field, getattr(user, seasonal_field, 0) + total_xp)
        user.seasonal_total_xp = (
            user.seasonal_xp_series_tv + user.seasonal_xp_geographie + user.seasonal_xp_histoire +
            user.seasonal_xp_cinema + user.seasonal_xp_sport + user.seasonal_xp_musique +
            user.seasonal_xp_sciences + user.seasonal_xp_gastronomie
        )

        # MMR update (simplified Elo)
        expected = 1.0 / (1.0 + 10 ** ((1000 - user.mmr) / 400))
        k = 32
        if won:
            user.mmr += k * (1 - expected)
        else:
            user.mmr -= k * expected
        user.mmr = max(100, min(3000, user.mmr))

        # ── Check for new title ──
        cat_xp_after = getattr(user, xp_field, 0) if xp_field else 0
        level_after = get_category_level(cat_xp_after)
        new_title_info = check_new_title(data.category, level_before, level_after)
        if level_after > level_before:
            new_level = level_after

        # ── Create match result notification ──
        cat_name = CATEGORY_MAP.get(data.category, data.category)
        if won:
            notif_body = f"Victoire contre {data.opponent_pseudo} en {cat_name} ! +{total_xp} XP"
        else:
            notif_body = f"Défaite contre {data.opponent_pseudo} en {cat_name}. +{total_xp} XP"
        await create_notification(
            db, data.player_id, "match_result",
            "Résultat du match",
            notif_body,
            data={"screen": "results", "params": {"matchId": match.id}},
        )

    await db.commit()
    await db.refresh(match)

    return MatchResponse(
        id=match.id, player1_id=match.player1_id,
        player2_pseudo=match.player2_pseudo, player2_is_bot=match.player2_is_bot,
        category=match.category, player1_score=match.player1_score,
        player2_score=match.player2_score, player1_correct=match.player1_correct,
        winner_id=match.winner_id, xp_earned=match.xp_earned,
        xp_breakdown=match.xp_breakdown,
        new_title=new_title_info,
        new_level=new_level,
        created_at=match.created_at.isoformat(),
    )


# ── Leaderboard ──

@api_router.get("/leaderboard")
async def get_leaderboard(
    scope: str = "world",
    view: str = "alltime",
    category: Optional[str] = None,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
):
    if view == "seasonal":
        order_field = User.seasonal_total_xp
    else:
        order_field = User.total_xp

    query = select(User).order_by(order_field.desc()).limit(limit)
    result = await db.execute(query)
    users = result.scalars().all()

    entries = []
    for i, u in enumerate(users):
        xp = u.seasonal_total_xp if view == "seasonal" else u.total_xp
        entries.append({
            "pseudo": u.pseudo,
            "avatar_seed": u.avatar_seed,
            "total_xp": xp,
            "matches_won": u.matches_won,
            "current_streak": u.current_streak,
            "streak_badge": get_streak_badge(u.current_streak),
            "rank": i + 1,
        })
    return entries


# ── Profile ──

@api_router.get("/profile/{user_id}")
async def get_profile(user_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")

    # Get match history
    result = await db.execute(
        select(Match).where(Match.player1_id == user_id).order_by(Match.created_at.desc()).limit(10)
    )
    matches = result.scalars().all()

    # Per-category stats
    categories_data = {}
    for cat_key, xp_field in CATEGORY_XP_FIELD.items():
        cat_xp = getattr(user, xp_field, 0)
        cat_level = get_category_level(cat_xp)
        cat_title = get_category_title(cat_key, cat_level)
        cat_progress = get_xp_progress(cat_xp, cat_level)
        unlocked = get_unlocked_titles_for_category(cat_key, cat_level)
        categories_data[cat_key] = {
            "xp": cat_xp,
            "level": cat_level,
            "title": cat_title,
            "xp_progress": cat_progress,
            "unlocked_titles": unlocked,
        }

    all_titles = get_all_unlocked_titles(user)

    # Followers / Following counts
    followers_count_res = await db.execute(
        select(func.count(PlayerFollow.id)).where(PlayerFollow.followed_id == user_id)
    )
    followers_count = followers_count_res.scalar() or 0

    following_count_res = await db.execute(
        select(func.count(PlayerFollow.id)).where(PlayerFollow.follower_id == user_id)
    )
    following_count = following_count_res.scalar() or 0

    country_flag = COUNTRY_FLAGS.get(user.country or "", "")

    return {
        "user": {
            "id": user.id, "pseudo": user.pseudo, "avatar_seed": user.avatar_seed,
            "is_guest": user.is_guest, "total_xp": user.total_xp,
            "selected_title": user.selected_title,
            "country": user.country,
            "country_flag": country_flag,
            "categories": categories_data,
            "matches_played": user.matches_played, "matches_won": user.matches_won,
            "best_streak": user.best_streak, "current_streak": user.current_streak,
            "streak_badge": get_streak_badge(user.current_streak),
            "win_rate": round(user.matches_won / max(user.matches_played, 1) * 100),
            "mmr": round(user.mmr or 1000),
            "followers_count": followers_count,
            "following_count": following_count,
        },
        "all_unlocked_titles": all_titles,
        "match_history": [
            {
                "id": m.id, "category": m.category,
                "player_score": m.player1_score, "opponent_score": m.player2_score,
                "opponent": m.player2_pseudo, "won": m.winner_id == user_id,
                "xp_earned": m.xp_earned or 0,
                "xp_breakdown": m.xp_breakdown,
                "correct_count": m.player1_correct or 0,
                "created_at": m.created_at.isoformat()
            } for m in matches
        ]
    }


# ── Select Title ──

@api_router.post("/user/select-title")
async def select_title(data: SelectTitleRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.id == data.user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")

    # Verify title is actually unlocked
    all_titles = get_all_unlocked_titles(user)
    unlocked_names = [t["title"] for t in all_titles]
    if data.title not in unlocked_names:
        raise HTTPException(status_code=400, detail="Ce titre n'est pas encore débloqué")

    user.selected_title = data.title
    await db.commit()
    return {"success": True, "selected_title": data.title}


# ── Category Detail & Social Wall ──

CATEGORY_DESCRIPTIONS = {
    "series_tv": "Les plus grandes séries TV de tous les temps",
    "geographie": "Capitales, pays et merveilles du monde",
    "histoire": "Les grands événements qui ont façonné le monde",
    "cinema": "Le meilleur du 7e art, d'Hollywood à Cannes",
    "sport": "Football, tennis, JO et toutes les disciplines",
    "musique": "Rock, pop, rap, classique et tous les genres",
    "sciences": "Physique, chimie, biologie et l'univers",
    "gastronomie": "Recettes, chefs étoilés et terroirs du monde",
}

class WallPostCreate(BaseModel):
    user_id: str
    content: str
    image_base64: Optional[str] = None

class CommentCreate(BaseModel):
    user_id: str
    content: str

class FollowToggle(BaseModel):
    user_id: str


@api_router.get("/category/{category_id}/detail")
async def get_category_detail(category_id: str, user_id: Optional[str] = None, db: AsyncSession = Depends(get_db)):
    """Full category detail with user-specific data."""
    # Validate category
    if category_id not in CATEGORY_MAP:
        raise HTTPException(status_code=404, detail="Catégorie introuvable")

    # Total questions in category
    q_count = await db.execute(select(func.count(Question.id)).where(Question.category == category_id))
    total_questions = q_count.scalar() or 0

    # Followers count
    f_count = await db.execute(select(func.count(CategoryFollow.id)).where(CategoryFollow.category_id == category_id))
    followers_count = f_count.scalar() or 0

    # User-specific data
    user_level = 0
    user_title = ""
    user_xp = 0
    is_following = False
    completion_pct = 0
    xp_progress = get_xp_progress(0, 0)

    if user_id:
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if user:
            xp_field = CATEGORY_XP_FIELD.get(category_id)
            user_xp = getattr(user, xp_field, 0) if xp_field else 0
            user_level = get_category_level(user_xp)
            user_title = get_category_title(category_id, user_level)
            xp_progress = get_xp_progress(user_xp, user_level)

            # Check if following
            follow_check = await db.execute(
                select(CategoryFollow).where(
                    CategoryFollow.user_id == user_id,
                    CategoryFollow.category_id == category_id
                )
            )
            is_following = follow_check.scalar_one_or_none() is not None

            # Completion: matches in category * 7 (unique estimate) / total questions
            m_count = await db.execute(
                select(func.count(Match.id)).where(
                    Match.player1_id == user_id,
                    Match.category == category_id
                )
            )
            matches_in_cat = m_count.scalar() or 0
            if total_questions > 0:
                completion_pct = min(100, round(matches_in_cat * 7 / total_questions * 100))

    return {
        "id": category_id,
        "name": CATEGORY_MAP[category_id],
        "description": CATEGORY_DESCRIPTIONS.get(category_id, ""),
        "total_questions": total_questions,
        "followers_count": followers_count,
        "user_level": user_level,
        "user_title": user_title,
        "user_xp": user_xp,
        "xp_progress": xp_progress,
        "is_following": is_following,
        "completion_pct": completion_pct,
    }


@api_router.post("/category/{category_id}/follow")
async def toggle_follow(category_id: str, data: FollowToggle, db: AsyncSession = Depends(get_db)):
    """Toggle follow/unfollow a category."""
    existing = await db.execute(
        select(CategoryFollow).where(
            CategoryFollow.user_id == data.user_id,
            CategoryFollow.category_id == category_id
        )
    )
    follow = existing.scalar_one_or_none()

    if follow:
        await db.delete(follow)
        await db.commit()
        return {"following": False}
    else:
        new_follow = CategoryFollow(user_id=data.user_id, category_id=category_id)
        db.add(new_follow)
        await db.commit()
        return {"following": True}


@api_router.get("/category/{category_id}/leaderboard")
async def category_leaderboard(category_id: str, limit: int = 20, db: AsyncSession = Depends(get_db)):
    """Per-category leaderboard."""
    xp_field = CATEGORY_XP_FIELD.get(category_id)
    if not xp_field:
        raise HTTPException(status_code=400, detail="Catégorie invalide")

    order_col = getattr(User, xp_field)
    result = await db.execute(
        select(User).where(order_col > 0).order_by(order_col.desc()).limit(limit)
    )
    users = result.scalars().all()

    entries = []
    for i, u in enumerate(users):
        cat_xp = getattr(u, xp_field, 0)
        lvl = get_category_level(cat_xp)
        entries.append({
            "id": u.id,
            "rank": i + 1,
            "pseudo": u.pseudo,
            "avatar_seed": u.avatar_seed,
            "level": lvl,
            "title": get_category_title(category_id, lvl),
            "xp": cat_xp,
        })
    return entries


@api_router.get("/category/{category_id}/wall")
async def get_wall_posts(category_id: str, user_id: Optional[str] = None, limit: int = 20, offset: int = 0, db: AsyncSession = Depends(get_db)):
    """Get wall posts for a category with likes/comments counts."""
    result = await db.execute(
        select(WallPost)
        .where(WallPost.category_id == category_id)
        .order_by(WallPost.created_at.desc())
        .limit(limit).offset(offset)
    )
    posts = result.scalars().all()

    posts_data = []
    for p in posts:
        # Get user info
        u_res = await db.execute(select(User).where(User.id == p.user_id))
        post_user = u_res.scalar_one_or_none()

        # Likes count
        lk_count = await db.execute(select(func.count(PostLike.id)).where(PostLike.post_id == p.id))
        likes = lk_count.scalar() or 0

        # Comments count
        cm_count = await db.execute(select(func.count(PostComment.id)).where(PostComment.post_id == p.id))
        comments = cm_count.scalar() or 0

        # Is liked by current user
        is_liked = False
        if user_id:
            lk_check = await db.execute(
                select(PostLike).where(PostLike.post_id == p.id, PostLike.user_id == user_id)
            )
            is_liked = lk_check.scalar_one_or_none() is not None

        posts_data.append({
            "id": p.id,
            "user": {
                "id": post_user.id if post_user else "",
                "pseudo": post_user.pseudo if post_user else "Inconnu",
                "avatar_seed": post_user.avatar_seed if post_user else "",
            },
            "content": p.content,
            "image_base64": p.image_base64,
            "likes_count": likes,
            "comments_count": comments,
            "is_liked": is_liked,
            "created_at": p.created_at.isoformat(),
        })

    return posts_data


@api_router.post("/category/{category_id}/wall")
async def create_wall_post(category_id: str, data: WallPostCreate, db: AsyncSession = Depends(get_db)):
    """Create a new wall post."""
    if not data.content.strip():
        raise HTTPException(status_code=400, detail="Le contenu ne peut pas être vide")

    # Limit image size (500KB base64)
    if data.image_base64 and len(data.image_base64) > 700000:
        raise HTTPException(status_code=400, detail="Image trop volumineuse (max 500KB)")

    post = WallPost(
        user_id=data.user_id,
        category_id=category_id,
        content=data.content.strip(),
        image_base64=data.image_base64,
    )
    db.add(post)
    await db.commit()
    await db.refresh(post)

    # Get user info
    u_res = await db.execute(select(User).where(User.id == data.user_id))
    post_user = u_res.scalar_one_or_none()

    return {
        "id": post.id,
        "user": {
            "id": post_user.id if post_user else "",
            "pseudo": post_user.pseudo if post_user else "Inconnu",
            "avatar_seed": post_user.avatar_seed if post_user else "",
        },
        "content": post.content,
        "image_base64": post.image_base64,
        "likes_count": 0,
        "comments_count": 0,
        "is_liked": False,
        "created_at": post.created_at.isoformat(),
    }


@api_router.post("/wall/{post_id}/like")
async def toggle_like(post_id: str, data: FollowToggle, db: AsyncSession = Depends(get_db)):
    """Toggle like on a wall post."""
    existing = await db.execute(
        select(PostLike).where(PostLike.post_id == post_id, PostLike.user_id == data.user_id)
    )
    like = existing.scalar_one_or_none()

    if like:
        await db.delete(like)
        await db.commit()
        return {"liked": False}
    else:
        new_like = PostLike(user_id=data.user_id, post_id=post_id)
        db.add(new_like)
        # Get post owner to notify
        post_res = await db.execute(select(WallPost).where(WallPost.id == post_id))
        post = post_res.scalar_one_or_none()
        if post and post.user_id != data.user_id:
            liker_res = await db.execute(select(User).where(User.id == data.user_id))
            liker = liker_res.scalar_one_or_none()
            liker_name = liker.pseudo if liker else "Quelqu'un"
            await create_notification(
                db, post.user_id, "like",
                "Nouveau like",
                f"{liker_name} a aimé ta publication",
                actor_id=data.user_id,
                data={"screen": "category-detail", "params": {"id": post.category_id}},
            )
        await db.commit()
        return {"liked": True}


@api_router.post("/wall/{post_id}/comment")
async def add_comment(post_id: str, data: CommentCreate, db: AsyncSession = Depends(get_db)):
    """Add a comment to a wall post."""
    if not data.content.strip():
        raise HTTPException(status_code=400, detail="Le commentaire ne peut pas être vide")

    comment = PostComment(user_id=data.user_id, post_id=post_id, content=data.content.strip())
    db.add(comment)

    # Notify post owner about the comment
    post_res = await db.execute(select(WallPost).where(WallPost.id == post_id))
    post = post_res.scalar_one_or_none()
    if post and post.user_id != data.user_id:
        commenter_res = await db.execute(select(User).where(User.id == data.user_id))
        commenter = commenter_res.scalar_one_or_none()
        commenter_name = commenter.pseudo if commenter else "Quelqu'un"
        await create_notification(
            db, post.user_id, "comment",
            "Nouveau commentaire",
            f"{commenter_name} a commenté ta publication",
            actor_id=data.user_id,
            data={"screen": "category-detail", "params": {"id": post.category_id}},
        )

    await db.commit()
    await db.refresh(comment)

    u_res = await db.execute(select(User).where(User.id == data.user_id))
    user = u_res.scalar_one_or_none()

    return {
        "id": comment.id,
        "user": {
            "id": user.id if user else "",
            "pseudo": user.pseudo if user else "Inconnu",
            "avatar_seed": user.avatar_seed if user else "",
        },
        "content": comment.content,
        "created_at": comment.created_at.isoformat(),
    }


@api_router.get("/wall/{post_id}/comments")
async def get_comments(post_id: str, db: AsyncSession = Depends(get_db)):
    """Get all comments for a wall post."""
    result = await db.execute(
        select(PostComment).where(PostComment.post_id == post_id).order_by(PostComment.created_at.asc())
    )
    comments = result.scalars().all()

    comments_data = []
    for c in comments:
        u_res = await db.execute(select(User).where(User.id == c.user_id))
        user = u_res.scalar_one_or_none()
        comments_data.append({
            "id": c.id,
            "user": {
                "id": user.id if user else "",
                "pseudo": user.pseudo if user else "Inconnu",
                "avatar_seed": user.avatar_seed if user else "",
            },
            "content": c.content,
            "created_at": c.created_at.isoformat(),
        })
    return comments_data


# ── Country Flag Mapping ──

COUNTRY_FLAGS = {
    "France": "🇫🇷", "Germany": "🇩🇪", "Spain": "🇪🇸", "Italy": "🇮🇹", "United Kingdom": "🇬🇧",
    "United States": "🇺🇸", "Canada": "🇨🇦", "Brazil": "🇧🇷", "Japan": "🇯🇵", "China": "🇨🇳",
    "Australia": "🇦🇺", "India": "🇮🇳", "Mexico": "🇲🇽", "Russia": "🇷🇺", "South Korea": "🇰🇷",
    "Netherlands": "🇳🇱", "Belgium": "🇧🇪", "Switzerland": "🇨🇭", "Portugal": "🇵🇹", "Sweden": "🇸🇪",
    "Norway": "🇳🇴", "Denmark": "🇩🇰", "Finland": "🇫🇮", "Poland": "🇵🇱", "Austria": "🇦🇹",
    "Ireland": "🇮🇪", "Argentina": "🇦🇷", "Colombia": "🇨🇴", "Chile": "🇨🇱", "Morocco": "🇲🇦",
    "Algeria": "🇩🇿", "Tunisia": "🇹🇳", "Egypt": "🇪🇬", "Turkey": "🇹🇷", "Saudi Arabia": "🇸🇦",
    "South Africa": "🇿🇦", "Nigeria": "🇳🇬", "Indonesia": "🇮🇩", "Thailand": "🇹🇭", "Vietnam": "🇻🇳",
    "Philippines": "🇵🇭", "Malaysia": "🇲🇾", "Singapore": "🇸🇬", "New Zealand": "🇳🇿",
    "Israel": "🇮🇱", "Greece": "🇬🇷", "Czech Republic": "🇨🇿", "Romania": "🇷🇴", "Hungary": "🇭🇺",
    "Ukraine": "🇺🇦", "Croatia": "🇭🇷", "Peru": "🇵🇪", "Venezuela": "🇻🇪", "Ecuador": "🇪🇨",
}


async def detect_country_from_ip(request: Request) -> Optional[str]:
    """Detect country from IP using ip-api.com."""
    try:
        forwarded = request.headers.get("x-forwarded-for", "")
        client_ip = forwarded.split(",")[0].strip() if forwarded else (request.client.host if request.client else None)
        if not client_ip or client_ip in ("127.0.0.1", "::1", "localhost"):
            return None
        async with httpx.AsyncClient(timeout=3) as client:
            resp = await client.get(f"http://ip-api.com/json/{client_ip}?fields=status,country,countryCode,city,regionName")
            if resp.status_code == 200:
                data = resp.json()
                if data.get("status") == "success":
                    return data.get("country")
    except Exception:
        pass
    return None


# ── Player Profile & Follow Pydantic Models ──

class PlayerFollowToggle(BaseModel):
    follower_id: str

class ChatSend(BaseModel):
    sender_id: str
    receiver_id: str
    content: str
    message_type: str = "text"  # text, image, game_card
    extra_data: Optional[dict] = None  # For image data, game card data

class PlayerSearchRequest(BaseModel):
    query: Optional[str] = None
    category: Optional[str] = None
    country: Optional[str] = None
    limit: int = 20


# ── Player Public Profile ──

@api_router.get("/player/{user_id}/profile")
async def get_player_profile(user_id: str, viewer_id: Optional[str] = None, db: AsyncSession = Depends(get_db)):
    """Full public profile of a player."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Joueur non trouvé")

    # Per-category stats
    categories_data = {}
    for cat_key, xp_field in CATEGORY_XP_FIELD.items():
        cat_xp = getattr(user, xp_field, 0)
        cat_level = get_category_level(cat_xp)
        cat_title = get_category_title(cat_key, cat_level)
        categories_data[cat_key] = {
            "xp": cat_xp,
            "level": cat_level,
            "title": cat_title,
        }

    # Champion titles (rank #1 per category)
    champion_titles = []
    for cat_key, xp_field in CATEGORY_XP_FIELD.items():
        cat_xp = getattr(user, xp_field, 0)
        if cat_xp > 0:
            top_result = await db.execute(
                select(User).where(getattr(User, xp_field) > 0)
                .order_by(getattr(User, xp_field).desc()).limit(1)
            )
            top_user = top_result.scalar_one_or_none()
            if top_user and top_user.id == user.id:
                champion_titles.append({
                    "category": cat_key,
                    "category_name": CATEGORY_MAP.get(cat_key, cat_key),
                    "scope": "Monde",
                    "date": datetime.now(timezone.utc).strftime("%B %Y").capitalize(),
                })

    # Followers / Following counts
    followers_count_res = await db.execute(
        select(func.count(PlayerFollow.id)).where(PlayerFollow.followed_id == user_id)
    )
    followers_count = followers_count_res.scalar() or 0

    following_count_res = await db.execute(
        select(func.count(PlayerFollow.id)).where(PlayerFollow.follower_id == user_id)
    )
    following_count = following_count_res.scalar() or 0

    # Is viewer following this player?
    is_following = False
    if viewer_id and viewer_id != user_id:
        f_check = await db.execute(
            select(PlayerFollow).where(
                PlayerFollow.follower_id == viewer_id,
                PlayerFollow.followed_id == user_id
            )
        )
        is_following = f_check.scalar_one_or_none() is not None

    # Wall posts by this user across all categories
    posts_result = await db.execute(
        select(WallPost).where(WallPost.user_id == user_id)
        .order_by(WallPost.created_at.desc()).limit(20)
    )
    user_posts = posts_result.scalars().all()

    posts_data = []
    for p in user_posts:
        lk_count = await db.execute(select(func.count(PostLike.id)).where(PostLike.post_id == p.id))
        likes = lk_count.scalar() or 0
        cm_count = await db.execute(select(func.count(PostComment.id)).where(PostComment.post_id == p.id))
        comments = cm_count.scalar() or 0

        is_liked = False
        if viewer_id:
            lk_check = await db.execute(
                select(PostLike).where(PostLike.post_id == p.id, PostLike.user_id == viewer_id)
            )
            is_liked = lk_check.scalar_one_or_none() is not None

        posts_data.append({
            "id": p.id,
            "category_id": p.category_id,
            "category_name": CATEGORY_MAP.get(p.category_id, p.category_id),
            "content": p.content,
            "image_base64": p.image_base64,
            "likes_count": likes,
            "comments_count": comments,
            "is_liked": is_liked,
            "created_at": p.created_at.isoformat(),
        })

    country_flag = COUNTRY_FLAGS.get(user.country or "", "🌍")

    return {
        "id": user.id,
        "pseudo": user.pseudo,
        "avatar_seed": user.avatar_seed,
        "selected_title": user.selected_title or get_category_title("series_tv", 1),
        "country": user.country,
        "country_flag": country_flag,
        "matches_played": user.matches_played,
        "matches_won": user.matches_won,
        "win_rate": round(user.matches_won / max(user.matches_played, 1) * 100),
        "current_streak": user.current_streak,
        "best_streak": user.best_streak,
        "total_xp": user.total_xp,
        "categories": categories_data,
        "champion_titles": champion_titles,
        "followers_count": followers_count,
        "following_count": following_count,
        "is_following": is_following,
        "posts": posts_data,
    }


# ── Player Follow / Unfollow ──

@api_router.post("/player/{user_id}/follow")
async def toggle_player_follow(user_id: str, data: PlayerFollowToggle, db: AsyncSession = Depends(get_db)):
    """Toggle follow/unfollow a player."""
    if data.follower_id == user_id:
        raise HTTPException(status_code=400, detail="Vous ne pouvez pas vous suivre vous-même")

    existing = await db.execute(
        select(PlayerFollow).where(
            PlayerFollow.follower_id == data.follower_id,
            PlayerFollow.followed_id == user_id
        )
    )
    follow = existing.scalar_one_or_none()

    if follow:
        await db.delete(follow)
        await db.commit()
        return {"following": False}
    else:
        new_follow = PlayerFollow(follower_id=data.follower_id, followed_id=user_id)
        db.add(new_follow)
        # Create notification for followed user
        follower_res = await db.execute(select(User).where(User.id == data.follower_id))
        follower_user = follower_res.scalar_one_or_none()
        follower_name = follower_user.pseudo if follower_user else "Quelqu'un"
        await create_notification(
            db, user_id, "follow",
            "Nouveau follower",
            f"{follower_name} a commencé à te suivre",
            actor_id=data.follower_id,
            data={"screen": "player-profile", "params": {"id": data.follower_id}},
        )
        await db.commit()
        return {"following": True}


# ── Player Search ──

@api_router.get("/players/search")
async def search_players(
    q: Optional[str] = None,
    category: Optional[str] = None,
    country: Optional[str] = None,
    limit: int = 20,
    db: AsyncSession = Depends(get_db)
):
    """Search players with filters."""
    query = select(User)
    
    if q and q.strip():
        query = query.where(User.pseudo.ilike(f"%{q.strip()}%"))
    
    if country and country.strip():
        query = query.where(User.country == country.strip())
    
    if category and category in CATEGORY_XP_FIELD:
        xp_field = CATEGORY_XP_FIELD[category]
        query = query.where(getattr(User, xp_field) > 0).order_by(getattr(User, xp_field).desc())
    else:
        query = query.order_by(User.total_xp.desc())
    
    query = query.limit(limit)
    result = await db.execute(query)
    users = result.scalars().all()

    players = []
    for u in users:
        best_cat = None
        best_level = 0
        for cat_key, xp_f in CATEGORY_XP_FIELD.items():
            lvl = get_category_level(getattr(u, xp_f, 0))
            if lvl > best_level:
                best_level = lvl
                best_cat = cat_key

        players.append({
            "id": u.id,
            "pseudo": u.pseudo,
            "avatar_seed": u.avatar_seed,
            "country": u.country,
            "country_flag": COUNTRY_FLAGS.get(u.country or "", "🌍"),
            "total_xp": u.total_xp,
            "matches_played": u.matches_played,
            "selected_title": u.selected_title or (get_category_title(best_cat, best_level) if best_cat else "Novice"),
            "best_category": best_cat,
            "best_level": best_level,
        })
    return players


# ── Chat System ──

@api_router.post("/chat/send")
async def send_message(data: ChatSend, db: AsyncSession = Depends(get_db)):
    """Send a chat message (text, image, or game_card)."""
    if data.message_type == "text":
        if not data.content.strip():
            raise HTTPException(status_code=400, detail="Le message ne peut pas être vide")
        if len(data.content) > 500:
            raise HTTPException(status_code=400, detail="Message trop long (max 500 caractères)")
    if data.sender_id == data.receiver_id:
        raise HTTPException(status_code=400, detail="Vous ne pouvez pas vous envoyer un message")
    if data.message_type not in ("text", "image", "game_card"):
        raise HTTPException(status_code=400, detail="Type de message invalide")

    msg = ChatMessage(
        sender_id=data.sender_id,
        receiver_id=data.receiver_id,
        content=data.content.strip() if data.content else "",
        message_type=data.message_type,
        extra_data=data.extra_data,
    )
    db.add(msg)
    await db.commit()
    await db.refresh(msg)

    # Get sender info
    s_res = await db.execute(select(User).where(User.id == data.sender_id))
    sender = s_res.scalar_one_or_none()

    # Create notification for receiver
    sender_name = sender.pseudo if sender else "Quelqu'un"
    if data.message_type == "text":
        notif_body = f"{sender_name}: {data.content[:80]}{'...' if len(data.content) > 80 else ''}"
    elif data.message_type == "image":
        notif_body = f"{sender_name} t'a envoyé une image"
    elif data.message_type == "game_card":
        notif_body = f"{sender_name} t'a envoyé un résultat de match"
    else:
        notif_body = f"{sender_name} t'a envoyé un message"

    await create_notification(
        db, data.receiver_id, "message",
        "Nouveau message",
        notif_body,
        actor_id=data.sender_id,
        data={"screen": "chat", "params": {"userId": data.sender_id, "pseudo": sender_name}},
    )
    await db.commit()

    return {
        "id": msg.id,
        "sender_id": msg.sender_id,
        "receiver_id": msg.receiver_id,
        "sender_pseudo": sender.pseudo if sender else "Inconnu",
        "content": msg.content,
        "message_type": msg.message_type,
        "extra_data": msg.extra_data,
        "read": msg.read,
        "created_at": msg.created_at.isoformat(),
    }


@api_router.get("/chat/conversations/{user_id}")
async def get_conversations(user_id: str, db: AsyncSession = Depends(get_db)):
    """Get list of conversations for a user, with last message preview."""
    # Clean up old messages (> 7 days)
    cutoff = datetime.now(timezone.utc) - timedelta(days=7)
    await db.execute(
        text("DELETE FROM chat_messages WHERE created_at < :cutoff"),
        {"cutoff": cutoff}
    )
    await db.commit()

    # Get all unique conversation partners
    sent_result = await db.execute(
        select(ChatMessage.receiver_id).where(ChatMessage.sender_id == user_id).distinct()
    )
    received_result = await db.execute(
        select(ChatMessage.sender_id).where(ChatMessage.receiver_id == user_id).distinct()
    )

    partner_ids = set()
    for row in sent_result:
        partner_ids.add(row[0])
    for row in received_result:
        partner_ids.add(row[0])

    conversations = []
    for pid in partner_ids:
        # Get last message in conversation
        last_msg_res = await db.execute(
            select(ChatMessage).where(
                or_(
                    and_(ChatMessage.sender_id == user_id, ChatMessage.receiver_id == pid),
                    and_(ChatMessage.sender_id == pid, ChatMessage.receiver_id == user_id),
                )
            ).order_by(ChatMessage.created_at.desc()).limit(1)
        )
        last_msg = last_msg_res.scalar_one_or_none()
        if not last_msg:
            continue

        # Unread count
        unread_res = await db.execute(
            select(func.count(ChatMessage.id)).where(
                ChatMessage.sender_id == pid,
                ChatMessage.receiver_id == user_id,
                ChatMessage.read == False,
            )
        )
        unread = unread_res.scalar() or 0

        # Partner info
        p_res = await db.execute(select(User).where(User.id == pid))
        partner = p_res.scalar_one_or_none()
        if not partner:
            continue

        # Get last message preview text
        last_msg_preview = last_msg.content[:100]
        if last_msg.message_type == "image":
            last_msg_preview = "📷 Image"
        elif last_msg.message_type == "game_card":
            last_msg_preview = "🎮 Résultat de match"

        conversations.append({
            "partner_id": pid,
            "partner_pseudo": partner.pseudo,
            "partner_avatar_seed": partner.avatar_seed,
            "last_message": last_msg_preview,
            "last_message_type": last_msg.message_type or "text",
            "last_message_time": last_msg.created_at.isoformat(),
            "is_sender": last_msg.sender_id == user_id,
            "unread_count": unread,
        })

    # Sort by last message time
    conversations.sort(key=lambda x: x["last_message_time"], reverse=True)
    return conversations


@api_router.get("/chat/{user_id}/messages")
async def get_chat_messages(user_id: str, with_user: str, limit: int = 50, db: AsyncSession = Depends(get_db)):
    """Get messages between two users."""
    result = await db.execute(
        select(ChatMessage).where(
            or_(
                and_(ChatMessage.sender_id == user_id, ChatMessage.receiver_id == with_user),
                and_(ChatMessage.sender_id == with_user, ChatMessage.receiver_id == user_id),
            )
        ).order_by(ChatMessage.created_at.asc()).limit(limit)
    )
    messages = result.scalars().all()

    # Mark received messages as read
    for m in messages:
        if m.receiver_id == user_id and not m.read:
            m.read = True
    await db.commit()

    return [{
        "id": m.id,
        "sender_id": m.sender_id,
        "receiver_id": m.receiver_id,
        "content": m.content,
        "message_type": m.message_type or "text",
        "extra_data": m.extra_data,
        "read": m.read,
        "created_at": m.created_at.isoformat(),
    } for m in messages]


@api_router.get("/chat/unread-count/{user_id}")
async def get_unread_count(user_id: str, db: AsyncSession = Depends(get_db)):
    """Get total unread message count for a user."""
    result = await db.execute(
        select(func.count(ChatMessage.id)).where(
            ChatMessage.receiver_id == user_id,
            ChatMessage.read == False,
        )
    )
    return {"unread_count": result.scalar() or 0}


# ── Search System ──

# Theme tags: broad keyword associations for each category
CATEGORY_TAGS = {
    "series_tv": ["séries", "tv", "télé", "netflix", "streaming", "saison", "épisode", "acteur", "actrice", "binge", "sitcom", "drama", "thriller", "horror", "comédie", "game of thrones", "breaking bad", "stranger things", "squid game", "friends", "walking dead", "house of the dragon", "la casa de papel", "naruto", "anime", "manga", "one piece", "disney+", "hbo", "amazon", "prime"],
    "geographie": ["géo", "pays", "capitale", "continent", "océan", "montagne", "fleuve", "rivière", "carte", "monde", "terre", "espace", "planète", "atlas", "drapeau", "frontière", "île", "désert", "forêt", "ville", "europe", "asie", "afrique", "amérique", "voyage", "tourisme", "climat", "population", "nature", "nasa"],
    "histoire": ["histoire", "guerre", "roi", "reine", "empire", "révolution", "moyen-âge", "antiquité", "pharaon", "rome", "grèce", "égypte", "napoléon", "louis", "renaissance", "bataille", "conquête", "civilisation", "archéologie", "château", "chevalier", "croisade", "découverte", "exploration", "viking", "samurai", "cleopatre", "césar"],
    "cinema": ["cinéma", "film", "réalisateur", "oscar", "cannes", "hollywood", "bollywood", "acteur", "actrice", "scénario", "box office", "marvel", "dc", "star wars", "lord of the rings", "harry potter", "james bond", "tarantino", "spielberg", "nolan", "animation", "pixar", "studio ghibli", "horreur", "comédie", "action", "science-fiction", "fantastique"],
    "sport": ["sport", "football", "foot", "tennis", "basket", "nba", "rugby", "f1", "formule 1", "jeux olympiques", "jo", "coupe du monde", "ligue", "champion", "athlète", "compétition", "match", "marathon", "cyclisme", "natation", "boxe", "mma", "ufc", "messi", "ronaldo", "mbappé", "psg", "real madrid", "fifa"],
    "musique": ["musique", "chanson", "chanteur", "chanteuse", "concert", "album", "groupe", "rock", "pop", "rap", "hip-hop", "jazz", "classique", "electro", "techno", "reggae", "r&b", "soul", "metal", "punk", "guitare", "piano", "batterie", "festival", "grammy", "eurovision", "beyoncé", "drake", "taylor swift", "k-pop", "bts"],
    "sciences": ["sciences", "science", "physique", "chimie", "biologie", "mathématiques", "maths", "espace", "astronomie", "planète", "étoile", "galaxie", "nasa", "einstein", "darwin", "newton", "atome", "molécule", "adn", "génétique", "intelligence artificielle", "ia", "robot", "technologie", "invention", "découverte", "médecine", "virus", "vaccin", "quantique"],
    "gastronomie": ["gastronomie", "cuisine", "recette", "chef", "restaurant", "étoilé", "michelin", "pâtisserie", "dessert", "fromage", "vin", "boulangerie", "chocolat", "saveur", "épice", "ingrédient", "top chef", "cauchemar en cuisine", "meilleur pâtissier", "sushi", "pizza", "burger", "vegan", "bio", "terroir", "tradition", "brasserie"],
}

# Difficulty mapping based on level thresholds
DIFFICULTY_LEVELS = {
    "debutant": {"min": 0, "max": 5, "label": "Débutant"},
    "intermediaire": {"min": 6, "max": 19, "label": "Intermédiaire"},
    "avance": {"min": 20, "max": 34, "label": "Avancé"},
    "expert": {"min": 35, "max": 50, "label": "Expert"},
}


@api_router.get("/search/themes")
async def search_themes(
    q: Optional[str] = None,
    difficulty: Optional[str] = None,
    user_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    """Search themes by keyword with tag matching and difficulty filter."""
    results = []
    query_lower = (q or "").strip().lower()

    # Get user data if available
    user = None
    if user_id:
        u_res = await db.execute(select(User).where(User.id == user_id))
        user = u_res.scalar_one_or_none()

    for cat_id, cat_name in CATEGORY_MAP.items():
        # Calculate relevance score
        score = 0

        if query_lower:
            # Exact category name match
            if query_lower in cat_name.lower():
                score += 100
            # Category id match
            if query_lower in cat_id.replace("_", " "):
                score += 80
            # Tag matching
            tags = CATEGORY_TAGS.get(cat_id, [])
            for tag in tags:
                if query_lower in tag or tag in query_lower:
                    score += 30
                # Partial match
                elif any(word in tag for word in query_lower.split()):
                    score += 10
        else:
            score = 50  # Default score when no query

        if score == 0 and query_lower:
            continue  # Skip non-matching categories

        # Get category stats
        xp_field = CATEGORY_XP_FIELD.get(cat_id)
        user_level = 0
        user_xp = 0
        user_title = ""
        is_following = False

        if user and xp_field:
            user_xp = getattr(user, xp_field, 0)
            user_level = get_category_level(user_xp)
            user_title = get_category_title(cat_id, user_level)
            # Check follow
            f_res = await db.execute(
                select(CategoryFollow).where(
                    CategoryFollow.user_id == user_id,
                    CategoryFollow.category_id == cat_id
                )
            )
            is_following = f_res.scalar_one_or_none() is not None

        # Difficulty filter
        if difficulty and difficulty in DIFFICULTY_LEVELS:
            d = DIFFICULTY_LEVELS[difficulty]
            if user_level < d["min"] or user_level > d["max"]:
                continue

        # Question count
        q_count = await db.execute(
            select(func.count(Question.id)).where(Question.category == cat_id)
        )
        total_questions = q_count.scalar() or 0

        # Player count (users who played this category)
        player_count_res = await db.execute(
            select(func.count(User.id)).where(getattr(User, xp_field) > 0)
        ) if xp_field else None
        player_count = player_count_res.scalar() if player_count_res else 0

        # Followers count
        f_count = await db.execute(
            select(func.count(CategoryFollow.id)).where(CategoryFollow.category_id == cat_id)
        )
        followers_count = f_count.scalar() or 0

        # Get difficulty label based on user level
        difficulty_label = "Nouveau"
        for d_key, d_val in DIFFICULTY_LEVELS.items():
            if d_val["min"] <= user_level <= d_val["max"]:
                difficulty_label = d_val["label"]
                break

        results.append({
            "id": cat_id,
            "name": cat_name,
            "description": CATEGORY_DESCRIPTIONS.get(cat_id, ""),
            "total_questions": total_questions,
            "player_count": player_count,
            "followers_count": followers_count,
            "user_level": user_level,
            "user_title": user_title,
            "is_following": is_following,
            "difficulty_label": difficulty_label,
            "relevance_score": score,
        })

    # Sort by relevance
    results.sort(key=lambda x: x["relevance_score"], reverse=True)
    return results


@api_router.get("/search/players")
async def search_players_enhanced(
    q: Optional[str] = None,
    title: Optional[str] = None,
    category: Optional[str] = None,
    country: Optional[str] = None,
    min_level: Optional[int] = None,
    limit: int = 20,
    db: AsyncSession = Depends(get_db)
):
    """Enhanced player search: by pseudo, title, category, country, and level."""
    query = select(User)

    # Pseudo search (supports @pseudo exact match)
    if q and q.strip():
        search_term = q.strip()
        if search_term.startswith("@"):
            # Exact pseudo match
            query = query.where(User.pseudo == search_term[1:])
        else:
            query = query.where(User.pseudo.ilike(f"%{search_term}%"))

    # Country filter
    if country and country.strip():
        query = query.where(User.country.ilike(f"%{country.strip()}%"))

    # Category XP filter
    if category and category in CATEGORY_XP_FIELD:
        xp_field = CATEGORY_XP_FIELD[category]
        if min_level and min_level > 0:
            min_xp = get_cumulative_xp(min_level)
            query = query.where(getattr(User, xp_field) >= min_xp)
        query = query.order_by(getattr(User, xp_field).desc())
    else:
        query = query.order_by(User.total_xp.desc())

    result = await db.execute(query.limit(limit))
    users = result.scalars().all()

    players = []
    for u in users:
        best_cat = None
        best_level = 0
        for cat_key, xp_f in CATEGORY_XP_FIELD.items():
            lvl = get_category_level(getattr(u, xp_f, 0))
            if lvl > best_level:
                best_level = lvl
                best_cat = cat_key

        player_title = u.selected_title or (get_category_title(best_cat, best_level) if best_cat else "Novice")

        # Filter by title if specified
        if title and title.strip():
            title_lower = title.strip().lower()
            if title_lower not in player_title.lower():
                # Also check all unlocked titles
                all_titles = get_all_unlocked_titles(u)
                title_names = [t["title"].lower() for t in all_titles]
                if not any(title_lower in tn for tn in title_names):
                    continue

        # Category-specific level if category filter is active
        cat_level = 0
        cat_title = ""
        if category and category in CATEGORY_XP_FIELD:
            cat_xp = getattr(u, CATEGORY_XP_FIELD[category], 0)
            cat_level = get_category_level(cat_xp)
            cat_title = get_category_title(category, cat_level)

        players.append({
            "id": u.id,
            "pseudo": u.pseudo,
            "avatar_seed": u.avatar_seed,
            "country": u.country,
            "country_flag": COUNTRY_FLAGS.get(u.country or "", "🌍"),
            "total_xp": u.total_xp,
            "matches_played": u.matches_played,
            "selected_title": player_title,
            "best_category": best_cat,
            "best_level": best_level,
            "cat_level": cat_level,
            "cat_title": cat_title,
        })

    return players


@api_router.get("/search/content")
async def search_content(
    q: str,
    category: Optional[str] = None,
    user_id: Optional[str] = None,
    limit: int = 20,
    db: AsyncSession = Depends(get_db)
):
    """Search wall posts and comments by content."""
    if not q or not q.strip():
        return {"posts": [], "comments": []}

    search_term = q.strip()

    # Search in wall posts
    post_query = select(WallPost).where(WallPost.content.ilike(f"%{search_term}%"))
    if category:
        post_query = post_query.where(WallPost.category_id == category)
    post_query = post_query.order_by(WallPost.created_at.desc()).limit(limit)
    post_result = await db.execute(post_query)
    posts = post_result.scalars().all()

    post_data = []
    for p in posts:
        # Get author info
        u_res = await db.execute(select(User).where(User.id == p.user_id))
        author = u_res.scalar_one_or_none()

        # Likes count
        likes_res = await db.execute(
            select(func.count(PostLike.id)).where(PostLike.post_id == p.id)
        )
        likes_count = likes_res.scalar() or 0

        # Comments count
        comments_res = await db.execute(
            select(func.count(PostComment.id)).where(PostComment.post_id == p.id)
        )
        comments_count = comments_res.scalar() or 0

        # Is liked by user
        is_liked = False
        if user_id:
            like_check = await db.execute(
                select(PostLike).where(PostLike.user_id == user_id, PostLike.post_id == p.id)
            )
            is_liked = like_check.scalar_one_or_none() is not None

        post_data.append({
            "id": p.id,
            "category_id": p.category_id,
            "category_name": CATEGORY_MAP.get(p.category_id, p.category_id),
            "user": {
                "id": author.id if author else "",
                "pseudo": author.pseudo if author else "Inconnu",
                "avatar_seed": author.avatar_seed if author else "",
            },
            "content": p.content,
            "has_image": bool(p.image_base64),
            "likes_count": likes_count,
            "comments_count": comments_count,
            "is_liked": is_liked,
            "created_at": p.created_at.isoformat(),
        })

    # Search in comments
    comment_query = select(PostComment).where(PostComment.content.ilike(f"%{search_term}%"))
    comment_query = comment_query.order_by(PostComment.created_at.desc()).limit(limit)
    comment_result = await db.execute(comment_query)
    comments = comment_result.scalars().all()

    comment_data = []
    for c in comments:
        u_res = await db.execute(select(User).where(User.id == c.user_id))
        author = u_res.scalar_one_or_none()

        # Get parent post info
        p_res = await db.execute(select(WallPost).where(WallPost.id == c.post_id))
        parent_post = p_res.scalar_one_or_none()

        comment_data.append({
            "id": c.id,
            "post_id": c.post_id,
            "category_id": parent_post.category_id if parent_post else "",
            "category_name": CATEGORY_MAP.get(parent_post.category_id, "") if parent_post else "",
            "user": {
                "id": author.id if author else "",
                "pseudo": author.pseudo if author else "Inconnu",
                "avatar_seed": author.avatar_seed if author else "",
            },
            "content": c.content,
            "created_at": c.created_at.isoformat(),
        })

    return {"posts": post_data, "comments": comment_data}


@api_router.get("/search/trending")
async def get_trending(db: AsyncSession = Depends(get_db)):
    """Get trending tags and popular categories."""
    # Most played categories (by total matches)
    popular_cats = []
    for cat_id, cat_name in CATEGORY_MAP.items():
        m_count = await db.execute(
            select(func.count(Match.id)).where(Match.category == cat_id)
        )
        count = m_count.scalar() or 0
        popular_cats.append({"id": cat_id, "name": cat_name, "match_count": count})

    popular_cats.sort(key=lambda x: x["match_count"], reverse=True)

    # Most followed categories
    popular_follows = []
    for cat_id, cat_name in CATEGORY_MAP.items():
        f_count = await db.execute(
            select(func.count(CategoryFollow.id)).where(CategoryFollow.category_id == cat_id)
        )
        count = f_count.scalar() or 0
        popular_follows.append({"id": cat_id, "name": cat_name, "followers": count})

    popular_follows.sort(key=lambda x: x["followers"], reverse=True)

    # Trending tags (hardcoded + dynamic)
    trending_tags = [
        {"tag": "Squid Game 3", "icon": "🦑", "type": "hot"},
        {"tag": "Champions League", "icon": "⚽", "type": "hot"},
        {"tag": "IA & Robots", "icon": "🤖", "type": "trend"},
        {"tag": "Star Wars", "icon": "⭐", "type": "classic"},
        {"tag": "Gastronomie française", "icon": "🥐", "type": "trend"},
        {"tag": "Histoire de France", "icon": "🏰", "type": "classic"},
        {"tag": "K-Pop", "icon": "🎤", "type": "trend"},
        {"tag": "Astronomie", "icon": "🔭", "type": "hot"},
    ]

    # Top players (most active recently)
    top_players_res = await db.execute(
        select(User).order_by(User.total_xp.desc()).limit(5)
    )
    top_players = top_players_res.scalars().all()
    top_players_data = [{
        "id": u.id,
        "pseudo": u.pseudo,
        "avatar_seed": u.avatar_seed,
        "total_xp": u.total_xp,
        "country_flag": COUNTRY_FLAGS.get(u.country or "", "🌍"),
    } for u in top_players]

    return {
        "popular_categories": popular_cats[:5],
        "trending_tags": trending_tags,
        "top_players": top_players_data,
    }


# ── Admin Routes ──

@api_router.post("/admin/verify")
async def verify_admin(data: AdminVerify):
    if data.password == ADMIN_PASSWORD:
        return {"verified": True}
    raise HTTPException(status_code=403, detail="Mot de passe incorrect")


@api_router.post("/admin/import-questions")
async def import_questions(data: BulkImportRequest, db: AsyncSession = Depends(get_db)):
    imported = 0
    duplicates = 0
    errors = []

    for i, q in enumerate(data.questions):
        try:
            q_text = q.get("question_text", "").strip()
            options = q.get("options", [])
            correct = q.get("correct_option", 0)
            difficulty = q.get("difficulty", "medium")

            if not q_text or len(options) != 4:
                errors.append(f"Question {i+1}: format invalide")
                continue

            # Check duplicate
            result = await db.execute(
                select(Question).where(Question.question_text == q_text)
            )
            if result.scalar_one_or_none():
                duplicates += 1
                continue

            question = Question(
                category=data.category,
                question_text=q_text,
                options=options,
                correct_option=correct,
                difficulty=difficulty
            )
            db.add(question)
            imported += 1
        except Exception as e:
            errors.append(f"Question {i+1}: {str(e)}")

    await db.commit()
    return {
        "imported": imported,
        "duplicates": duplicates,
        "errors": errors,
        "total_processed": len(data.questions)
    }


# ── Seed Data ──

# ── Seed endpoint removed ──
# Questions are now imported dynamically via CSV upload at POST /api/admin/upload-csv
# The old /admin/seed endpoint with ~80 hardcoded questions has been removed.


# ── Notifications System ──

NOTIFICATION_TYPE_MAP = {
    "challenge": {"icon": "⚔️", "priority": 1},
    "match_result": {"icon": "🏆", "priority": 2},
    "follow": {"icon": "👤", "priority": 3},
    "message": {"icon": "💬", "priority": 3},
    "like": {"icon": "❤️", "priority": 4},
    "comment": {"icon": "💬", "priority": 4},
    "system": {"icon": "🔔", "priority": 5},
}


async def create_notification(
    db: AsyncSession,
    user_id: str,
    notif_type: str,
    title: str,
    body: str,
    actor_id: str = None,
    data: dict = None,
):
    """Create a notification for a user, respecting their settings."""
    # Check user notification settings
    settings_res = await db.execute(
        select(NotificationSettings).where(NotificationSettings.user_id == user_id)
    )
    settings = settings_res.scalar_one_or_none()

    if settings:
        type_to_field = {
            "challenge": "challenges",
            "match_result": "match_results",
            "follow": "follows",
            "message": "messages",
            "like": "likes",
            "comment": "comments",
            "system": "system",
        }
        field = type_to_field.get(notif_type)
        if field and not getattr(settings, field, True):
            return None  # User disabled this notification type

    # Get actor info
    actor_pseudo = None
    actor_avatar_seed = None
    if actor_id:
        actor_res = await db.execute(select(User).where(User.id == actor_id))
        actor = actor_res.scalar_one_or_none()
        if actor:
            actor_pseudo = actor.pseudo
            actor_avatar_seed = actor.avatar_seed

    icon = NOTIFICATION_TYPE_MAP.get(notif_type, {}).get("icon", "🔔")

    notif = Notification(
        user_id=user_id,
        type=notif_type,
        title=title,
        body=body,
        icon=icon,
        data=data,
        actor_id=actor_id,
        actor_pseudo=actor_pseudo,
        actor_avatar_seed=actor_avatar_seed,
    )
    db.add(notif)
    return notif


class NotifReadRequest(BaseModel):
    user_id: str

class NotifSettingsUpdate(BaseModel):
    user_id: str
    challenges: Optional[bool] = None
    match_results: Optional[bool] = None
    follows: Optional[bool] = None
    messages: Optional[bool] = None
    likes: Optional[bool] = None
    comments: Optional[bool] = None
    system: Optional[bool] = None


@api_router.get("/notifications/{user_id}")
async def get_notifications(user_id: str, limit: int = 50, offset: int = 0, db: AsyncSession = Depends(get_db)):
    """Get all notifications for a user, newest first."""
    result = await db.execute(
        select(Notification)
        .where(Notification.user_id == user_id)
        .order_by(Notification.created_at.desc())
        .limit(limit).offset(offset)
    )
    notifications = result.scalars().all()

    return [{
        "id": n.id,
        "type": n.type,
        "title": n.title,
        "body": n.body,
        "icon": n.icon,
        "data": n.data,
        "actor_id": n.actor_id,
        "actor_pseudo": n.actor_pseudo,
        "actor_avatar_seed": n.actor_avatar_seed,
        "read": n.read,
        "created_at": n.created_at.isoformat(),
    } for n in notifications]


@api_router.get("/notifications/{user_id}/unread-count")
async def get_notification_unread_count(user_id: str, db: AsyncSession = Depends(get_db)):
    """Get unread notification count."""
    result = await db.execute(
        select(func.count(Notification.id)).where(
            Notification.user_id == user_id,
            Notification.read == False,
        )
    )
    return {"unread_count": result.scalar() or 0}


@api_router.post("/notifications/{notification_id}/read")
async def mark_notification_read(notification_id: str, data: NotifReadRequest, db: AsyncSession = Depends(get_db)):
    """Mark a single notification as read."""
    result = await db.execute(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == data.user_id,
        )
    )
    notif = result.scalar_one_or_none()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification non trouvée")

    notif.read = True
    await db.commit()
    return {"success": True}


@api_router.post("/notifications/read-all")
async def mark_all_notifications_read(data: NotifReadRequest, db: AsyncSession = Depends(get_db)):
    """Mark all notifications as read for a user."""
    await db.execute(
        text("UPDATE notifications SET read = true WHERE user_id = :user_id AND read = false"),
        {"user_id": data.user_id}
    )
    await db.commit()
    return {"success": True}


@api_router.get("/notifications/{user_id}/settings")
async def get_notification_settings(user_id: str, db: AsyncSession = Depends(get_db)):
    """Get notification preferences for a user."""
    result = await db.execute(
        select(NotificationSettings).where(NotificationSettings.user_id == user_id)
    )
    settings = result.scalar_one_or_none()

    if not settings:
        # Return defaults
        return {
            "challenges": True,
            "match_results": True,
            "follows": True,
            "messages": True,
            "likes": True,
            "comments": True,
            "system": True,
        }

    return {
        "challenges": settings.challenges,
        "match_results": settings.match_results,
        "follows": settings.follows,
        "messages": settings.messages,
        "likes": settings.likes,
        "comments": settings.comments,
        "system": settings.system,
    }


@api_router.post("/notifications/{user_id}/settings")
async def update_notification_settings(user_id: str, data: NotifSettingsUpdate, db: AsyncSession = Depends(get_db)):
    """Update notification preferences."""
    result = await db.execute(
        select(NotificationSettings).where(NotificationSettings.user_id == user_id)
    )
    settings = result.scalar_one_or_none()

    if not settings:
        settings = NotificationSettings(user_id=user_id)
        db.add(settings)

    # Update only provided fields
    if data.challenges is not None:
        settings.challenges = data.challenges
    if data.match_results is not None:
        settings.match_results = data.match_results
    if data.follows is not None:
        settings.follows = data.follows
    if data.messages is not None:
        settings.messages = data.messages
    if data.likes is not None:
        settings.likes = data.likes
    if data.comments is not None:
        settings.comments = data.comments
    if data.system is not None:
        settings.system = data.system

    await db.commit()
    return {
        "challenges": settings.challenges,
        "match_results": settings.match_results,
        "follows": settings.follows,
        "messages": settings.messages,
        "likes": settings.likes,
        "comments": settings.comments,
        "system": settings.system,
    }


# ── Home Feed ──

CATEGORY_COLORS = {
    "series_tv": "#E040FB",
    "geographie": "#00FFFF",
    "histoire": "#FFD700",
    "cinema": "#FF6B6B",
    "sport": "#00FF9D",
    "musique": "#FF8C00",
    "sciences": "#7B68EE",
    "gastronomie": "#FF69B4",
}

@api_router.get("/feed/home/{user_id}")
async def get_home_feed(user_id: str, db: AsyncSession = Depends(get_db)):
    """Get home feed data: pending duels, social wall, user stats."""
    # Get user
    u_res = await db.execute(select(User).where(User.id == user_id))
    user = u_res.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")

    # ── Pending Duels (recent matches as rematches) ──
    recent_matches = await db.execute(
        select(Match).where(Match.player1_id == user_id)
        .order_by(Match.created_at.desc()).limit(5)
    )
    matches = recent_matches.scalars().all()

    pending_duels = []
    for m in matches:
        cat_color = CATEGORY_COLORS.get(m.category, "#8A2BE2")
        cat_name = CATEGORY_MAP.get(m.category, m.category)
        pending_duels.append({
            "id": m.id,
            "opponent_pseudo": m.player2_pseudo,
            "opponent_avatar_seed": secrets.token_hex(4),  # Bot avatar
            "category": m.category,
            "category_name": cat_name,
            "category_color": cat_color,
            "player_score": m.player1_score,
            "opponent_score": m.player2_score,
            "won": m.winner_id == user_id,
            "created_at": m.created_at.isoformat(),
        })

    # ── Social Feed (mix of records, posts, events) ──
    social_feed = []

    # 1. Recent records (perfect scores, high streaks, new titles)
    perfect_matches = await db.execute(
        select(Match, User).join(User, User.id == Match.player1_id)
        .where(Match.player1_correct == 7)
        .order_by(Match.created_at.desc()).limit(5)
    )
    for match_row in perfect_matches:
        m = match_row[0]
        u = match_row[1]
        cat_name = CATEGORY_MAP.get(m.category, m.category)
        cat_color = CATEGORY_COLORS.get(m.category, "#8A2BE2")
        social_feed.append({
            "type": "record",
            "id": f"record_{m.id}",
            "user_pseudo": u.pseudo,
            "user_avatar_seed": u.avatar_seed,
            "category": m.category,
            "category_name": cat_name,
            "category_color": cat_color,
            "title": "Score parfait !",
            "body": f"@{u.pseudo} a réalisé un 7/7 en {cat_name} !",
            "score": f"{m.player1_score} - {m.player2_score}",
            "icon": "🏆",
            "xp_earned": m.xp_earned or 0,
            "created_at": m.created_at.isoformat(),
        })

    # 2. Community posts (recent wall posts across all categories)
    recent_posts = await db.execute(
        select(WallPost).order_by(WallPost.created_at.desc()).limit(8)
    )
    posts = recent_posts.scalars().all()

    for p in posts:
        p_user_res = await db.execute(select(User).where(User.id == p.user_id))
        p_user = p_user_res.scalar_one_or_none()

        lk_count = await db.execute(select(func.count(PostLike.id)).where(PostLike.post_id == p.id))
        likes = lk_count.scalar() or 0
        cm_count = await db.execute(select(func.count(PostComment.id)).where(PostComment.post_id == p.id))
        comments = cm_count.scalar() or 0

        is_liked = False
        lk_check = await db.execute(
            select(PostLike).where(PostLike.post_id == p.id, PostLike.user_id == user_id)
        )
        is_liked = lk_check.scalar_one_or_none() is not None

        cat_color = CATEGORY_COLORS.get(p.category_id, "#8A2BE2")
        cat_name = CATEGORY_MAP.get(p.category_id, p.category_id)

        social_feed.append({
            "type": "community",
            "id": f"post_{p.id}",
            "post_id": p.id,
            "user_id": p.user_id,
            "user_pseudo": p_user.pseudo if p_user else "Inconnu",
            "user_avatar_seed": p_user.avatar_seed if p_user else "",
            "category": p.category_id,
            "category_name": cat_name,
            "category_color": cat_color,
            "content": p.content,
            "has_image": bool(p.image_base64),
            "likes_count": likes,
            "comments_count": comments,
            "is_liked": is_liked,
            "created_at": p.created_at.isoformat(),
        })

    # 3. Events (XP boosts, announcements - generated dynamically)
    import random as rnd
    event_categories = rnd.sample(list(CATEGORY_MAP.keys()), min(2, len(CATEGORY_MAP)))
    for ec in event_categories:
        cat_name = CATEGORY_MAP[ec]
        cat_color = CATEGORY_COLORS.get(ec, "#8A2BE2")
        social_feed.append({
            "type": "event",
            "id": f"event_{ec}",
            "category": ec,
            "category_name": cat_name,
            "category_color": cat_color,
            "title": f"XP x2 en {cat_name}",
            "body": f"Double XP sur le thème {cat_name} pendant 1h !",
            "icon": "⚡",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

    # Sort social feed by created_at
    social_feed.sort(key=lambda x: x.get("created_at", ""), reverse=True)

    # User greeting stats
    country_flag = COUNTRY_FLAGS.get(user.country or "", "🌍")

    return {
        "user": {
            "pseudo": user.pseudo,
            "avatar_seed": user.avatar_seed,
            "total_xp": user.total_xp,
            "current_streak": user.current_streak,
            "streak_badge": get_streak_badge(user.current_streak),
            "matches_played": user.matches_played,
            "matches_won": user.matches_won,
            "country_flag": country_flag,
            "selected_title": user.selected_title or "Novice",
        },
        "pending_duels": pending_duels[:5],
        "social_feed": social_feed[:20],
    }


# ── Health ──

@api_router.get("/")
async def root():
    return {"message": "Duelo API v1.0", "status": "running"}


@api_router.get("/health")
async def health(db: AsyncSession = Depends(get_db)):
    try:
        await db.execute(text("SELECT 1"))
        return {"status": "healthy", "database": "connected"}
    except Exception as e:
        return {"status": "unhealthy", "database": str(e)}


# ── Themes Explore (Pillars) ──

PILLARS_DATA = [
    {
        "id": "screen", "name": "SCREEN", "label": "Cinéma & Séries", "color": "#8B5CF6",
        "icon": "🎬", "themes": [
            {"id": "series_tv", "name": "Séries TV Cultes", "icon": "📺", "playable": True, "topics": [
                {"id": "breaking_bad", "name": "Breaking Bad", "icon_url": "https://customer-assets.emergentagent.com/job_duelo-quiz-1/artifacts/1hmg9970_BBAD.png", "icon": "🧪"},
            ]},
            {"id": "cinema", "name": "Cinéma", "icon": "🎬", "playable": True, "topics": []},
            {"id": "animation", "name": "Animation", "icon": "🎨", "playable": False, "topics": []},
        ]
    },
    {
        "id": "sound", "name": "SOUND", "label": "Musique & Audio", "color": "#6366F1",
        "icon": "🎵", "themes": [
            {"id": "musique", "name": "Musique", "icon": "🎵", "playable": True, "topics": []},
            {"id": "rap_hiphop", "name": "Rap & Hip-Hop", "icon": "🎤", "playable": False, "topics": []},
            {"id": "classique", "name": "Musique Classique", "icon": "🎻", "playable": False, "topics": []},
        ]
    },
    {
        "id": "lab", "name": "LAB", "label": "Sciences & Espace", "color": "#06B6D4",
        "icon": "🔬", "themes": [
            {"id": "sciences", "name": "Sciences", "icon": "🔬", "playable": True, "topics": []},
            {"id": "espace", "name": "Espace", "icon": "🚀", "playable": False, "topics": []},
            {"id": "technologie", "name": "Technologie", "icon": "💻", "playable": False, "topics": []},
        ]
    },
    {
        "id": "arena", "name": "ARENA", "label": "Sports & Gaming", "color": "#84CC16",
        "icon": "⚽", "themes": [
            {"id": "sport", "name": "Sport", "icon": "⚽", "playable": True, "topics": []},
            {"id": "gaming", "name": "🎮 Gaming", "icon": "🎮", "playable": False, "topics": []},
            {"id": "jeux_olympiques", "name": "Jeux Olympiques", "icon": "🏅", "playable": False, "topics": []},
        ]
    },
    {
        "id": "legends", "name": "LEGENDS", "label": "Histoire & Mythes", "color": "#F59E0B",
        "icon": "🏛️", "themes": [
            {"id": "histoire", "name": "Histoire de France", "icon": "🏛️", "playable": True, "topics": []},
            {"id": "antiquite", "name": "Antiquité", "icon": "⚔️", "playable": False, "topics": []},
            {"id": "mythologie", "name": "Mythologie", "icon": "🐉", "playable": False, "topics": []},
        ]
    },
    {
        "id": "globe", "name": "GLOBE", "label": "Voyage & Géo", "color": "#F97316",
        "icon": "🌍", "themes": [
            {"id": "geographie", "name": "Géographie Mondiale", "icon": "🌍", "playable": True, "topics": []},
            {"id": "capitales", "name": "Capitales du Monde", "icon": "🏙️", "playable": False, "topics": []},
            {"id": "drapeaux", "name": "Drapeaux", "icon": "🏳️", "playable": False, "topics": []},
        ]
    },
    {
        "id": "art", "name": "ART", "label": "Mode & Design", "color": "#D946EF",
        "icon": "🎨", "themes": [
            {"id": "mode", "name": "Mode", "icon": "👗", "playable": False, "topics": []},
            {"id": "art_peinture", "name": "Art & Peinture", "icon": "🖼️", "playable": False, "topics": []},
            {"id": "architecture", "name": "Architecture", "icon": "🏗️", "playable": False, "topics": []},
        ]
    },
    {
        "id": "mind", "name": "MIND", "label": "Culture & Savoir", "color": "#3B82F6",
        "icon": "📖", "themes": [
            {"id": "litterature", "name": "Littérature", "icon": "📚", "playable": False, "topics": []},
            {"id": "philosophie", "name": "Philosophie", "icon": "🤔", "playable": False, "topics": []},
            {"id": "langue_fr", "name": "Langue Française", "icon": "🇫🇷", "playable": False, "topics": []},
        ]
    },
    {
        "id": "life", "name": "LIFE", "label": "Nature & Animaux", "color": "#10B981",
        "icon": "🌿", "themes": [
            {"id": "gastronomie", "name": "Gastronomie", "icon": "🍽️", "playable": True, "topics": []},
            {"id": "animaux", "name": "Animaux", "icon": "🐾", "playable": False, "topics": []},
            {"id": "nature", "name": "Nature", "icon": "🌳", "playable": False, "topics": []},
        ]
    },
]

@api_router.get("/themes/explore")
async def themes_explore(user_id: Optional[str] = None, db: AsyncSession = Depends(get_db)):
    """Return pillar structure from new Theme table for the themes page.
    Pillars = Super Categories, Themes = Clusters, Topics = Real Themes."""

    # Get all themes from DB
    result = await db.execute(select(Theme).order_by(Theme.super_category, Theme.cluster, Theme.name))
    all_themes = result.scalars().all()

    if not all_themes:
        return {"pillars": []}

    # Get user theme XP if logged in
    user_xp_map = {}
    if user_id:
        xp_res = await db.execute(select(UserThemeXP).where(UserThemeXP.user_id == user_id))
        for uxp in xp_res.scalars().all():
            user_xp_map[uxp.theme_id] = uxp.xp

    # Group by super_category → cluster → themes
    sc_map = {}  # super_category → {cluster → [themes]}
    for t in all_themes:
        if t.super_category not in sc_map:
            sc_map[t.super_category] = {}
        if t.cluster not in sc_map[t.super_category]:
            sc_map[t.super_category][t.cluster] = []
        sc_map[t.super_category][t.cluster].append(t)

    pillars = []
    for sc_name, clusters in sc_map.items():
        meta = SUPER_CATEGORY_META.get(sc_name, {"icon": "❓", "color": "#8A2BE2", "label": sc_name})

        # Build cluster "themes" for the carousel
        cluster_themes = []
        for cluster_name, theme_list in clusters.items():
            cluster_icon = CLUSTER_ICONS.get(cluster_name, "📁")

            # Aggregate cluster stats
            total_q = sum(t.question_count or 0 for t in theme_list)
            cluster_xp = sum(user_xp_map.get(t.id, 0) for t in theme_list)
            cluster_level = get_category_level(cluster_xp)

            # Build topics (real individual themes) for each cluster
            topics = []
            for t in theme_list:
                t_xp = user_xp_map.get(t.id, 0)
                t_level = get_category_level(t_xp)
                topics.append({
                    "id": t.id,
                    "name": t.name,
                    "icon": t.name[0].upper() if t.name else "?",
                    "icon_url": t.icon_url or "",
                    "category_id": t.id,
                    "level": t_level,
                    "description": t.description or "",
                })

            cluster_themes.append({
                "id": f"cluster_{sc_name}_{cluster_name}".replace(" ", "_"),
                "name": cluster_name,
                "icon": cluster_icon,
                "playable": True,
                "level": cluster_level,
                "xp": cluster_xp,
                "title": "",
                "title_lvl50": "",
                "xp_progress": get_xp_progress(cluster_xp, cluster_level),
                "total_questions": total_q,
                "topics": topics,
            })

        pillars.append({
            "id": sc_name.lower(),
            "name": meta["label"].upper(),
            "label": ", ".join(clusters.keys()),
            "color": meta["color"],
            "icon": meta["icon"],
            "themes": cluster_themes,
        })

    return {"pillars": pillars}


# ── Social & Forge APIs ──

# Tribes = 27 clusters (9 pillars × 3 sub-cats)
TRIBES_DATA = []
for p in PILLARS_DATA:
    for t in p["themes"]:
        TRIBES_DATA.append({
            "id": t["id"],
            "name": t["name"],
            "icon": t["icon"],
            "pillar_id": p["id"],
            "pillar_name": p["name"],
            "pillar_color": p["color"],
            "playable": t["playable"],
        })


@api_router.get("/social/pulse/{user_id}")
async def social_pulse(user_id: str, db: AsyncSession = Depends(get_db)):
    """Activity feed: exploits, records, level-ups with DÉFIER data."""
    u_res = await db.execute(select(User).where(User.id == user_id))
    user = u_res.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    feed = []

    # 1. Recent matches across ALL players (exploit cards)
    recent = await db.execute(
        select(Match, User).join(User, User.id == Match.player1_id)
        .order_by(Match.created_at.desc()).limit(20)
    )
    for row in recent:
        m, u = row[0], row[1]
        cat_color = CATEGORY_COLORS.get(m.category, "#8A2BE2")
        cat_name = CATEGORY_MAP.get(m.category, m.category)
        is_perfect = m.player1_correct == 7
        is_self = u.id == user_id

        exploit_type = "victory" if m.winner_id == m.player1_id else "defeat"
        if is_perfect:
            exploit_type = "perfect"

        feed.append({
            "type": exploit_type,
            "id": f"match_{m.id}",
            "user_id": u.id,
            "user_pseudo": u.pseudo,
            "user_avatar_seed": u.avatar_seed,
            "user_level": get_category_level(getattr(u, CATEGORY_XP_FIELD.get(m.category, "xp_series_tv"), 0)),
            "category": m.category,
            "category_name": cat_name,
            "category_color": cat_color,
            "pillar_color": cat_color,
            "score": f"{m.player1_score} - {m.player2_score}",
            "correct": m.player1_correct,
            "opponent_pseudo": m.player2_pseudo,
            "xp_earned": m.xp_earned or 0,
            "is_self": is_self,
            "can_challenge": not is_self,
            "icon": "🏆" if is_perfect else ("⚔️" if exploit_type == "victory" else "💀"),
            "title": "Score Parfait 7/7 !" if is_perfect else (
                f"Victoire en {cat_name}" if exploit_type == "victory" else f"Match en {cat_name}"
            ),
            "created_at": m.created_at.isoformat(),
        })

    # 2. High streak players
    streak_res = await db.execute(
        select(User).where(User.current_streak >= 3).order_by(User.current_streak.desc()).limit(5)
    )
    for u in streak_res.scalars().all():
        if u.id == user_id:
            continue
        feed.append({
            "type": "streak",
            "id": f"streak_{u.id}",
            "user_id": u.id,
            "user_pseudo": u.pseudo,
            "user_avatar_seed": u.avatar_seed,
            "user_level": get_category_level(u.total_xp // max(len(CATEGORY_XP_FIELD), 1)),
            "category": "",
            "category_name": "",
            "category_color": "#FFD700",
            "pillar_color": "#FFD700",
            "title": f"Série de {u.current_streak} victoires !",
            "icon": "🔥",
            "can_challenge": True,
            "is_self": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

    feed.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return {"feed": feed[:30]}


@api_router.get("/social/tribes")
async def social_tribes(user_id: Optional[str] = None, db: AsyncSession = Depends(get_db)):
    """Get 27 tribes (clusters) with throne holders (top player per category)."""
    tribes = []
    for tribe in TRIBES_DATA:
        xp_field = CATEGORY_XP_FIELD.get(tribe["id"])
        throne = None
        member_count = 0

        if xp_field:
            # Get throne holder (top XP player in this category)
            top_res = await db.execute(
                select(User).where(getattr(User, xp_field) > 0)
                .order_by(getattr(User, xp_field).desc()).limit(1)
            )
            top_user = top_res.scalar_one_or_none()
            if top_user:
                throne = {
                    "id": top_user.id,
                    "pseudo": top_user.pseudo,
                    "avatar_seed": top_user.avatar_seed,
                    "level": get_category_level(getattr(top_user, xp_field, 0)),
                    "title": get_category_title(tribe["id"], get_category_level(getattr(top_user, xp_field, 0))),
                    "xp": getattr(top_user, xp_field, 0),
                }

            # Count members (players with XP > 0)
            count_res = await db.execute(
                select(func.count(User.id)).where(getattr(User, xp_field) > 0)
            )
            member_count = count_res.scalar() or 0

        tribes.append({
            **tribe,
            "throne": throne,
            "member_count": member_count,
        })

    return {"tribes": tribes}


@api_router.get("/social/coach/{user_id}")
async def social_coach(user_id: str, db: AsyncSession = Depends(get_db)):
    """AI Coach: rivalry-based suggestions and challenges."""
    u_res = await db.execute(select(User).where(User.id == user_id))
    user = u_res.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    suggestions = []

    # Find rivals (players with similar XP who recently played)
    xp_range = max(user.total_xp - 500, 0), user.total_xp + 500
    rivals_res = await db.execute(
        select(User).where(
            User.id != user_id,
            User.total_xp.between(xp_range[0], xp_range[1])
        ).order_by(func.random()).limit(3)
    )
    rivals = rivals_res.scalars().all()

    for rival in rivals:
        # Find where rival is ahead
        for cat_key, xp_field in CATEGORY_XP_FIELD.items():
            my_xp = getattr(user, xp_field, 0)
            rival_xp = getattr(rival, xp_field, 0)
            if rival_xp > my_xp and rival_xp > 0:
                cat_name = CATEGORY_MAP.get(cat_key, cat_key)
                cat_color = CATEGORY_COLORS.get(cat_key, "#8A2BE2")
                suggestions.append({
                    "type": "rivalry",
                    "rival_id": rival.id,
                    "rival_pseudo": rival.pseudo,
                    "rival_avatar_seed": rival.avatar_seed,
                    "category": cat_key,
                    "category_name": cat_name,
                    "category_color": cat_color,
                    "rival_level": get_category_level(rival_xp),
                    "my_level": get_category_level(my_xp),
                    "message": f"@{rival.pseudo} te devance en {cat_name} ! Reprends ton trône !",
                    "icon": "⚡",
                })
                break  # One suggestion per rival

    # Weak category suggestion
    weakest_cat = None
    lowest_xp = float('inf')
    for cat_key, xp_field in CATEGORY_XP_FIELD.items():
        xp = getattr(user, xp_field, 0)
        if xp < lowest_xp:
            lowest_xp = xp
            weakest_cat = cat_key

    if weakest_cat:
        cat_name = CATEGORY_MAP.get(weakest_cat, weakest_cat)
        suggestions.append({
            "type": "improve",
            "category": weakest_cat,
            "category_name": cat_name,
            "category_color": CATEGORY_COLORS.get(weakest_cat, "#8A2BE2"),
            "message": f"Tu n'as que {int(lowest_xp)} XP en {cat_name}. Lance un match pour progresser !",
            "icon": "📈",
        })

    return {"suggestions": suggestions[:5]}


# ── Admin Dashboard (Desktop Web) ──

@api_router.get("/admin/dashboard", response_class=HTMLResponse)
async def admin_dashboard():
    html_path = ROOT_DIR / "admin_dashboard.html"
    return HTMLResponse(content=html_path.read_text(encoding="utf-8"))


# ══════════════════════════════════════════════════════════════
# ── NEW THEME HIERARCHY SYSTEM ──
# Super Category → Cluster (3) → Theme (20) → Questions (~500)
# ══════════════════════════════════════════════════════════════

# ── Default icon emojis for super categories ──
SUPER_CATEGORY_META = {
    "SCREEN": {"icon": "🎬", "color": "#8A2BE2", "label": "Screen"},
    "SOUND": {"icon": "🎵", "color": "#FF6B35", "label": "Sound"},
    "ARENA": {"icon": "⚽", "color": "#00FF9D", "label": "Arena"},
    "LEGENDS": {"icon": "🏛️", "color": "#FFD700", "label": "Legends"},
    "LAB": {"icon": "🔬", "color": "#00FFFF", "label": "Lab"},
    "TASTE": {"icon": "🍽️", "color": "#FF69B4", "label": "Taste"},
    "GLOBE": {"icon": "🌍", "color": "#4ECDC4", "label": "Globe"},
    "PIXEL": {"icon": "🎮", "color": "#FF3B5C", "label": "Pixel"},
    "STYLE": {"icon": "✨", "color": "#E040FB", "label": "Style"},
}

# ── Default cluster emojis ──
CLUSTER_ICONS = {
    "Séries TV": "📺",
    "Cinéma": "🎬",
    "Animation & Anime": "🎌",
    "Rock & Pop": "🎸",
    "Rap & Hip-Hop": "🎤",
    "Classique & Jazz": "🎻",
    "Football": "⚽",
    "Sports US": "🏈",
    "Sports Individuels": "🎾",
    "Histoire": "🏛️",
    "Mythologie": "⚡",
    "Personnalités": "👑",
    "Sciences": "🔬",
    "Technologie": "💻",
    "Nature": "🌿",
}


def get_theme_title(theme, level: int) -> str:
    """Get highest unlocked title for a theme at given level."""
    titles = {1: theme.title_lv1, 10: theme.title_lv10, 20: theme.title_lv20, 35: theme.title_lv35, 50: theme.title_lv50}
    current = ""
    for threshold in TITLE_THRESHOLDS:
        if level >= threshold and titles.get(threshold):
            current = titles[threshold]
    return current


def get_theme_unlocked_titles(theme, level: int) -> list:
    """Get all unlocked titles for a theme at given level."""
    titles = {1: theme.title_lv1, 10: theme.title_lv10, 20: theme.title_lv20, 35: theme.title_lv35, 50: theme.title_lv50}
    unlocked = []
    for threshold in TITLE_THRESHOLDS:
        if level >= threshold and titles.get(threshold):
            unlocked.append({"level": threshold, "title": titles[threshold]})
    return unlocked


# ── Import CSV Endpoint ──

@api_router.post("/admin/import-csv")
async def import_csv_data(request: Request, db: AsyncSession = Depends(get_db)):
    """Import themes and questions from CSV data.
    Expects JSON body: { themes_csv: str, questions_csv: str }
    """
    body = await request.json()
    themes_csv_text = body.get("themes_csv", "")
    questions_csv_text = body.get("questions_csv", "")

    if not themes_csv_text or not questions_csv_text:
        raise HTTPException(status_code=400, detail="Both themes_csv and questions_csv required")

    # ── Parse and import themes ──
    themes_reader = csv.DictReader(io.StringIO(themes_csv_text))
    themes_imported = 0
    for row in themes_reader:
        theme_id = row.get("ID_Theme", "").strip()
        if not theme_id:
            continue

        # Check if theme already exists
        existing = await db.execute(select(Theme).where(Theme.id == theme_id))
        if existing.scalar_one_or_none():
            # Update existing
            await db.execute(
                text("""UPDATE themes SET super_category=:sc, cluster=:cl, name=:nm, description=:desc,
                         color_hex=:ch, title_lv1=:t1, title_lv10=:t10, title_lv20=:t20,
                         title_lv35=:t35, title_lv50=:t50, icon_url=:iu
                         WHERE id=:id"""),
                {
                    "id": theme_id, "sc": row.get("Super_Categorie", "").strip(),
                    "cl": row.get("Cluster", "").strip(), "nm": row.get("Nom_Public", "").strip(),
                    "desc": row.get("Description", "").strip(), "ch": row.get("Couleur_Hex", "").strip(),
                    "t1": row.get("Titre_Niv_1", "").strip(), "t10": row.get("Titre_Niv_10", "").strip(),
                    "t20": row.get("Titre_Niv_20", "").strip(), "t35": row.get("Titre_Niv_35", "").strip(),
                    "t50": row.get("Titre_Niv_50", "").strip(), "iu": row.get("URL_Icone", "").strip(),
                }
            )
        else:
            theme = Theme(
                id=theme_id,
                super_category=row.get("Super_Categorie", "").strip(),
                cluster=row.get("Cluster", "").strip(),
                name=row.get("Nom_Public", "").strip(),
                description=row.get("Description", "").strip(),
                color_hex=row.get("Couleur_Hex", "").strip(),
                title_lv1=row.get("Titre_Niv_1", "").strip(),
                title_lv10=row.get("Titre_Niv_10", "").strip(),
                title_lv20=row.get("Titre_Niv_20", "").strip(),
                title_lv35=row.get("Titre_Niv_35", "").strip(),
                title_lv50=row.get("Titre_Niv_50", "").strip(),
                icon_url=row.get("URL_Icone", "").strip(),
            )
            db.add(theme)
        themes_imported += 1

    await db.commit()

    # ── Parse and import questions ──
    ANSWER_MAP = {"A": 0, "B": 1, "C": 2, "D": 3}
    questions_reader = csv.DictReader(io.StringIO(questions_csv_text))
    questions_imported = 0
    batch = []

    for row in questions_reader:
        q_id = row.get("ID", "").strip()
        theme_id = row.get("Catégorie", row.get("Categorie", "")).strip()
        question_text = row.get("Question", "").strip()
        if not q_id or not question_text:
            continue

        rep_a = row.get("Rep A", "").strip()
        rep_b = row.get(" Rep B", row.get("Rep B", "")).strip()
        rep_c = row.get("Rep C", "").strip()
        rep_d = row.get("Rep D", "").strip()
        bonne_rep = row.get("Bonne rep", "").strip().upper()
        difficulte = row.get("Difficulté", row.get("Difficulte", "")).strip()
        angle = row.get("Angle", "").strip()
        angle_num_str = row.get("Angle Num", "").strip()

        correct_option = ANSWER_MAP.get(bonne_rep, 0)
        options = [rep_a, rep_b, rep_c, rep_d]

        try:
            angle_num = int(angle_num_str)
        except (ValueError, TypeError):
            angle_num = 0

        # Check for existing question
        existing_q = await db.execute(select(Question).where(Question.id == q_id))
        if existing_q.scalar_one_or_none():
            continue  # Skip duplicates

        q = Question(
            id=q_id,
            category=theme_id,
            question_text=question_text,
            options=options,
            correct_option=correct_option,
            difficulty=difficulte,
        )
        db.add(q)
        questions_imported += 1

        # Commit in batches of 500
        if questions_imported % 500 == 0:
            await db.commit()

    await db.commit()

    # ── Update question counts per theme ──
    result = await db.execute(select(Theme))
    themes_list = result.scalars().all()
    for t in themes_list:
        count_res = await db.execute(
            select(func.count(Question.id)).where(Question.category == t.id)
        )
        t.question_count = count_res.scalar() or 0
    await db.commit()

    # Also update angle/angle_num columns for questions that don't have them yet
    # We need to do this via raw SQL since the ORM model doesn't have these columns
    questions_reader2 = csv.DictReader(io.StringIO(questions_csv_text))
    for row in questions_reader2:
        q_id = row.get("ID", "").strip()
        angle = row.get("Angle", "").strip()
        angle_num_str = row.get("Angle Num", "").strip()
        if q_id and angle:
            try:
                angle_num = int(angle_num_str) if angle_num_str else 0
                await db.execute(
                    text("UPDATE questions SET angle=:angle, angle_num=:anum WHERE id=:qid"),
                    {"angle": angle, "anum": angle_num, "qid": q_id}
                )
            except:
                pass
    await db.commit()

    return {
        "success": True,
        "themes_imported": themes_imported,
        "questions_imported": questions_imported,
    }


# ── CSV Upload Import (New clean endpoint) ──

class CSVQuestionRow(BaseModel):
    id: Optional[str] = None
    category: str
    question_text: str
    option_a: str
    option_b: str
    option_c: str
    option_d: str
    correct_option: str  # "A", "B", "C", "D"
    difficulty: Optional[str] = "medium"
    angle: Optional[str] = ""
    batch: Optional[str] = ""

class CSVUploadRequest(BaseModel):
    password: str
    questions: List[dict]

CORRECT_OPTION_MAP = {"A": 0, "B": 1, "C": 2, "D": 3}

@api_router.post("/admin/upload-csv")
async def upload_csv_questions(data: CSVUploadRequest, db: AsyncSession = Depends(get_db)):
    """Import questions from parsed CSV data (parsed client-side with PapaParse).
    Each row should have: id, category, question_text, option_a, option_b, option_c, option_d, correct_option, difficulty, angle, batch.
    correct_option should be A, B, C or D.
    """
    # Verify admin password
    if data.password != ADMIN_PASSWORD:
        raise HTTPException(status_code=403, detail="Mot de passe administrateur incorrect")

    imported = 0
    duplicates = 0
    errors = []

    for i, row in enumerate(data.questions):
        try:
            q_id = str(row.get("id", "")).strip()
            category = str(row.get("category", "")).strip()
            question_text = str(row.get("question_text", "")).strip()
            opt_a = str(row.get("option_a", "")).strip()
            opt_b = str(row.get("option_b", "")).strip()
            opt_c = str(row.get("option_c", "")).strip()
            opt_d = str(row.get("option_d", "")).strip()
            correct_str = str(row.get("correct_option", "")).strip().upper()
            difficulty = str(row.get("difficulty", "medium")).strip() or "medium"
            angle = str(row.get("angle", "")).strip()
            batch = str(row.get("batch", "")).strip()

            # Validate required fields
            if not question_text:
                errors.append(f"Ligne {i+1}: question_text manquant")
                continue
            if not category:
                errors.append(f"Ligne {i+1}: category manquant")
                continue
            if not opt_a or not opt_b or not opt_c or not opt_d:
                errors.append(f"Ligne {i+1}: une ou plusieurs options manquantes")
                continue
            if correct_str not in CORRECT_OPTION_MAP:
                errors.append(f"Ligne {i+1}: correct_option invalide '{correct_str}' (attendu: A, B, C ou D)")
                continue

            correct_int = CORRECT_OPTION_MAP[correct_str]
            options_json = [opt_a, opt_b, opt_c, opt_d]

            # Generate ID if not provided
            if not q_id:
                q_id = generate_uuid()

            # Check duplicate by ID
            existing = await db.execute(select(Question).where(Question.id == q_id))
            if existing.scalar_one_or_none():
                duplicates += 1
                continue

            question = Question(
                id=q_id,
                category=category,
                question_text=question_text,
                options=options_json,
                correct_option=correct_int,
                difficulty=difficulty,
                option_a=opt_a,
                option_b=opt_b,
                option_c=opt_c,
                option_d=opt_d,
                angle=angle,
                batch=batch,
            )
            db.add(question)
            imported += 1

            # Commit in batches of 200
            if imported % 200 == 0:
                await db.commit()

        except Exception as e:
            errors.append(f"Ligne {i+1}: {str(e)}")

    await db.commit()

    # Update question counts per theme
    try:
        result = await db.execute(select(Theme))
        themes_list = result.scalars().all()
        for t in themes_list:
            count_res = await db.execute(
                select(func.count(Question.id)).where(Question.category == t.id)
            )
            t.question_count = count_res.scalar() or 0
        await db.commit()
    except Exception:
        pass

    return {
        "success": True,
        "imported": imported,
        "duplicates": duplicates,
        "errors": errors[:50],  # Limit error list to 50
        "total_processed": len(data.questions),
    }


@api_router.get("/admin/questions-stats")
async def get_questions_stats(db: AsyncSession = Depends(get_db)):
    """Get stats about questions in the database."""
    # Total questions
    total_res = await db.execute(select(func.count(Question.id)))
    total = total_res.scalar() or 0

    # Per category
    cat_stats = []
    categories_res = await db.execute(
        select(Question.category, func.count(Question.id).label("count"))
        .group_by(Question.category)
        .order_by(func.count(Question.id).desc())
    )
    for row in categories_res:
        cat_stats.append({"category": row[0], "count": row[1]})

    # Per batch
    batch_stats = []
    batch_res = await db.execute(
        select(Question.batch, func.count(Question.id).label("count"))
        .where(Question.batch.isnot(None))
        .where(Question.batch != "")
        .group_by(Question.batch)
        .order_by(func.count(Question.id).desc())
    )
    for row in batch_res:
        batch_stats.append({"batch": row[0], "count": row[1]})

    return {
        "total_questions": total,
        "categories": cat_stats,
        "batches": batch_stats,
    }


# ── Explore: Super Categories & Clusters ──

@api_router.get("/explore/super-categories")
async def get_super_categories(db: AsyncSession = Depends(get_db)):
    """Return all super categories with their clusters and theme counts."""
    result = await db.execute(
        select(Theme.super_category, Theme.cluster, func.count(Theme.id).label("theme_count"))
        .group_by(Theme.super_category, Theme.cluster)
        .order_by(Theme.super_category, Theme.cluster)
    )
    rows = result.all()

    super_cats = {}
    for sc, cluster, count in rows:
        if sc not in super_cats:
            meta = SUPER_CATEGORY_META.get(sc, {"icon": "❓", "color": "#8A2BE2", "label": sc})
            super_cats[sc] = {
                "id": sc,
                "label": meta["label"],
                "icon": meta["icon"],
                "color": meta["color"],
                "clusters": [],
                "total_themes": 0,
            }
        cluster_icon = CLUSTER_ICONS.get(cluster, "📁")
        super_cats[sc]["clusters"].append({
            "name": cluster,
            "icon": cluster_icon,
            "theme_count": count,
        })
        super_cats[sc]["total_themes"] += count

    return list(super_cats.values())


@api_router.get("/explore/{super_category}/clusters")
async def get_clusters(super_category: str, user_id: Optional[str] = None, db: AsyncSession = Depends(get_db)):
    """Return clusters for a super category with their themes."""
    result = await db.execute(
        select(Theme)
        .where(Theme.super_category == super_category.upper())
        .order_by(Theme.cluster, Theme.name)
    )
    themes = result.scalars().all()

    if not themes:
        raise HTTPException(status_code=404, detail="Super catégorie introuvable")

    # Get user XP if provided
    user_xp_map = {}
    if user_id:
        xp_result = await db.execute(
            select(UserThemeXP).where(UserThemeXP.user_id == user_id)
        )
        for uxp in xp_result.scalars().all():
            user_xp_map[uxp.theme_id] = uxp.xp

    clusters = {}
    for t in themes:
        if t.cluster not in clusters:
            clusters[t.cluster] = {
                "name": t.cluster,
                "icon": CLUSTER_ICONS.get(t.cluster, "📁"),
                "themes": [],
            }

        theme_xp = user_xp_map.get(t.id, 0)
        theme_level = get_category_level(theme_xp)

        clusters[t.cluster]["themes"].append({
            "id": t.id,
            "name": t.name,
            "description": t.description or "",
            "icon_url": t.icon_url or "",
            "color_hex": t.color_hex or "#8A2BE2",
            "question_count": t.question_count or 0,
            "user_level": theme_level,
            "user_title": get_theme_title(t, theme_level) if theme_level > 0 else "",
        })

    meta = SUPER_CATEGORY_META.get(super_category.upper(), {"icon": "❓", "color": "#8A2BE2", "label": super_category})
    return {
        "super_category": super_category.upper(),
        "label": meta["label"],
        "icon": meta["icon"],
        "color": meta["color"],
        "clusters": list(clusters.values()),
    }


# ── Theme Detail ──

@api_router.get("/theme/{theme_id}/detail")
async def get_theme_detail(theme_id: str, user_id: Optional[str] = None, db: AsyncSession = Depends(get_db)):
    """Full theme detail with user-specific data."""
    result = await db.execute(select(Theme).where(Theme.id == theme_id))
    theme = result.scalar_one_or_none()
    if not theme:
        raise HTTPException(status_code=404, detail="Thème introuvable")

    # User data
    user_xp = 0
    user_level = 0
    user_title = ""
    is_following = False

    if user_id:
        xp_result = await db.execute(
            select(UserThemeXP).where(UserThemeXP.user_id == user_id, UserThemeXP.theme_id == theme_id)
        )
        uxp = xp_result.scalar_one_or_none()
        if uxp:
            user_xp = uxp.xp
            user_level = get_category_level(user_xp)
            user_title = get_theme_title(theme, user_level)

        # Check follow
        follow_check = await db.execute(
            select(CategoryFollow).where(
                CategoryFollow.user_id == user_id,
                CategoryFollow.category_id == theme_id
            )
        )
        is_following = follow_check.scalar_one_or_none() is not None

    # Followers count
    f_count = await db.execute(
        select(func.count(CategoryFollow.id)).where(CategoryFollow.category_id == theme_id)
    )
    followers_count = f_count.scalar() or 0

    xp_progress = get_xp_progress(user_xp, user_level)
    unlocked_titles = get_theme_unlocked_titles(theme, user_level)

    return {
        "id": theme.id,
        "name": theme.name,
        "description": theme.description or "",
        "super_category": theme.super_category,
        "cluster": theme.cluster,
        "color_hex": theme.color_hex or "#8A2BE2",
        "icon_url": theme.icon_url or "",
        "question_count": theme.question_count or 0,
        "followers_count": followers_count,
        "user_level": user_level,
        "user_title": user_title,
        "user_xp": user_xp,
        "xp_progress": xp_progress,
        "is_following": is_following,
        "unlocked_titles": unlocked_titles,
        "all_titles": {
            1: theme.title_lv1 or "",
            10: theme.title_lv10 or "",
            20: theme.title_lv20 or "",
            35: theme.title_lv35 or "",
            50: theme.title_lv50 or "",
        },
    }


# ── Theme Leaderboard ──

@api_router.get("/theme/{theme_id}/leaderboard")
async def theme_leaderboard(theme_id: str, limit: int = 20, db: AsyncSession = Depends(get_db)):
    """Per-theme leaderboard based on UserThemeXP."""
    result = await db.execute(
        select(UserThemeXP)
        .where(UserThemeXP.theme_id == theme_id, UserThemeXP.xp > 0)
        .order_by(UserThemeXP.xp.desc())
        .limit(limit)
    )
    entries_xp = result.scalars().all()

    # Get theme for title resolution
    theme_res = await db.execute(select(Theme).where(Theme.id == theme_id))
    theme = theme_res.scalar_one_or_none()

    entries = []
    for i, uxp in enumerate(entries_xp):
        user_res = await db.execute(select(User).where(User.id == uxp.user_id))
        user = user_res.scalar_one_or_none()
        if not user:
            continue
        lvl = get_category_level(uxp.xp)
        entries.append({
            "id": user.id,
            "rank": i + 1,
            "pseudo": user.pseudo,
            "avatar_seed": user.avatar_seed,
            "level": lvl,
            "title": get_theme_title(theme, lvl) if theme else "",
            "xp": uxp.xp,
        })
    return entries


# ── Game Questions V2 (with difficulty & angle distribution) ──

@api_router.get("/game/questions-v2")
async def get_game_questions_v2(theme: str, db: AsyncSession = Depends(get_db)):
    """Get 7 questions: 2 Facile + 3 Moyen + 2 Difficile, all from different angles.
    Falls back to random selection if not enough variety."""

    # Try smart selection: 2F + 3M + 2D with unique angles
    selected = []
    used_angles = set()

    for difficulty, count in [("Facile", 2), ("Moyen", 3), ("Difficile", 2)]:
        result = await db.execute(
            select(Question)
            .where(Question.category == theme, Question.difficulty == difficulty)
            .order_by(func.random())
        )
        candidates = result.scalars().all()

        added = 0
        for q in candidates:
            # Get angle_num from raw SQL since it's an extra column
            angle_res = await db.execute(
                text("SELECT angle_num FROM questions WHERE id = :qid"),
                {"qid": q.id}
            )
            angle_row = angle_res.first()
            q_angle = angle_row[0] if angle_row and angle_row[0] else 0

            if q_angle not in used_angles or q_angle == 0:
                selected.append(q)
                if q_angle and q_angle > 0:
                    used_angles.add(q_angle)
                added += 1
                if added >= count:
                    break

        # If not enough, fill with any remaining
        if added < count:
            for q in candidates:
                if q not in selected:
                    selected.append(q)
                    added += 1
                    if added >= count:
                        break

    # If still not enough (< 7), fill with random from theme
    if len(selected) < 7:
        result = await db.execute(
            select(Question)
            .where(Question.category == theme)
            .order_by(func.random())
            .limit(7)
        )
        fallback = result.scalars().all()
        for q in fallback:
            if q not in selected and len(selected) < 7:
                selected.append(q)

    # Shuffle the final selection
    random.shuffle(selected)

    return [
        {
            "id": q.id,
            "category": q.category,
            "question_text": q.question_text,
            "options": q.options,
            "correct_option": q.correct_option,
            "difficulty": q.difficulty,
        }
        for q in selected
    ]


# ── Theme Matchmaking ──

@api_router.post("/game/matchmaking-v2")
async def start_matchmaking_v2(request: Request, db: AsyncSession = Depends(get_db)):
    """Matchmaking using theme_id instead of old category."""
    body = await request.json()
    theme_id = body.get("theme_id", "")
    player_id = body.get("player_id")

    # Get theme info
    theme_res = await db.execute(select(Theme).where(Theme.id == theme_id))
    theme = theme_res.scalar_one_or_none()
    if not theme:
        raise HTTPException(status_code=404, detail="Thème introuvable")

    player_level = 0
    player_title = ""

    if player_id:
        xp_res = await db.execute(
            select(UserThemeXP).where(UserThemeXP.user_id == player_id, UserThemeXP.theme_id == theme_id)
        )
        uxp = xp_res.scalar_one_or_none()
        if uxp:
            player_level = get_category_level(uxp.xp)
            player_title = get_theme_title(theme, player_level)

    # Bot with similar level
    bot_level = max(0, min(MAX_LEVEL, player_level + random.randint(-5, 5)))
    bot_name = random.choice(BOT_NAMES)
    bot_seed = secrets.token_hex(4)
    bot_title = get_theme_title(theme, bot_level)
    bot_streak = random.choice([0, 0, 0, 1, 2, 3, 4, 5])

    return {
        "theme": {
            "id": theme.id,
            "name": theme.name,
            "color_hex": theme.color_hex or "#8A2BE2",
            "icon_url": theme.icon_url or "",
        },
        "player": {
            "level": player_level,
            "title": player_title,
        },
        "opponent": {
            "pseudo": bot_name,
            "avatar_seed": bot_seed,
            "is_bot": True,
            "level": bot_level,
            "title": bot_title,
            "streak": bot_streak,
            "streak_badge": get_streak_badge(bot_streak),
        },
    }


# ── Theme Match Submit ──

@api_router.post("/game/submit-v2")
async def submit_match_v2(request: Request, db: AsyncSession = Depends(get_db)):
    """Submit match result using theme_id. XP tracked in UserThemeXP."""
    body = await request.json()
    player_id = body.get("player_id")
    theme_id = body.get("theme_id")
    player_score = body.get("player_score", 0)
    opponent_score = body.get("opponent_score", 0)
    opponent_pseudo = body.get("opponent_pseudo", "Bot")
    opponent_is_bot = body.get("opponent_is_bot", True)
    correct_count = body.get("correct_count", 0)
    opponent_level = body.get("opponent_level", 1)
    questions_data = body.get("questions_data")

    if not player_id or not theme_id:
        raise HTTPException(status_code=400, detail="player_id and theme_id required")

    # Get theme
    theme_res = await db.execute(select(Theme).where(Theme.id == theme_id))
    theme = theme_res.scalar_one_or_none()
    if not theme:
        raise HTTPException(status_code=404, detail="Thème introuvable")

    # Get user
    result = await db.execute(select(User).where(User.id == player_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur non trouvé")

    won = player_score > opponent_score
    perfect = correct_count == TOTAL_QUESTIONS

    # Get/create UserThemeXP
    xp_res = await db.execute(
        select(UserThemeXP).where(UserThemeXP.user_id == player_id, UserThemeXP.theme_id == theme_id)
    )
    uxp = xp_res.scalar_one_or_none()
    if not uxp:
        uxp = UserThemeXP(user_id=player_id, theme_id=theme_id, xp=0)
        db.add(uxp)
        await db.flush()

    level_before = get_category_level(uxp.xp)

    # XP Calculation (same formula)
    base_xp = player_score * 2
    victory_bonus = 50 if won else 0
    perfection_bonus = 50 if perfect else 0
    giant_slayer_bonus = 100 if (won and opponent_level - level_before >= 15) else 0

    new_streak = (user.current_streak + 1) if won else 0
    streak_bonus = get_streak_bonus(new_streak) if won else 0

    total_xp = base_xp + victory_bonus + perfection_bonus + giant_slayer_bonus + streak_bonus

    xp_breakdown = {
        "base": base_xp, "victory": victory_bonus, "perfection": perfection_bonus,
        "giant_slayer": giant_slayer_bonus, "streak": streak_bonus, "total": total_xp,
    }

    # Create match record
    match = Match(
        player1_id=player_id,
        player2_pseudo=opponent_pseudo,
        player2_is_bot=opponent_is_bot,
        category=theme_id,  # Store theme_id in category field
        player1_score=player_score,
        player2_score=opponent_score,
        player1_correct=correct_count,
        winner_id=player_id if won else None,
        xp_earned=total_xp,
        xp_breakdown=xp_breakdown,
        questions_data=questions_data,
    )
    db.add(match)

    # Update theme XP
    uxp.xp += total_xp
    level_after = get_category_level(uxp.xp)

    # Check new title
    new_title_info = None
    new_level = None
    titles = {1: theme.title_lv1, 10: theme.title_lv10, 20: theme.title_lv20, 35: theme.title_lv35, 50: theme.title_lv50}
    for threshold in TITLE_THRESHOLDS:
        if level_before < threshold <= level_after:
            title_text = titles.get(threshold)
            if title_text:
                new_title_info = {"level": threshold, "title": title_text, "category": theme_id, "theme_name": theme.name}
    if level_after > level_before:
        new_level = level_after

    # Update user stats
    user.matches_played += 1
    if won:
        user.matches_won += 1
        user.current_streak += 1
        if user.current_streak > user.best_streak:
            user.best_streak = user.current_streak
    else:
        user.current_streak = 0

    # Update total XP on user (sum of all theme XPs)
    all_xp_res = await db.execute(
        select(func.sum(UserThemeXP.xp)).where(UserThemeXP.user_id == player_id)
    )
    user.total_xp = all_xp_res.scalar() or 0

    # Notification
    if won:
        notif_body = f"Victoire en {theme.name} ! +{total_xp} XP"
    else:
        notif_body = f"Défaite en {theme.name}. +{total_xp} XP"
    await create_notification(
        db, player_id, "match_result", "Résultat du match", notif_body,
        data={"screen": "results", "params": {"matchId": match.id}},
    )

    await db.commit()
    await db.refresh(match)

    return {
        "id": match.id,
        "player1_id": match.player1_id,
        "player2_pseudo": match.player2_pseudo,
        "player2_is_bot": match.player2_is_bot,
        "category": match.category,
        "theme_name": theme.name,
        "player1_score": match.player1_score,
        "player2_score": match.player2_score,
        "player1_correct": match.player1_correct,
        "winner_id": match.winner_id,
        "xp_earned": match.xp_earned,
        "xp_breakdown": match.xp_breakdown,
        "new_title": new_title_info,
        "new_level": new_level,
        "created_at": match.created_at.isoformat(),
    }


# ── Theme-based Profile ──

@api_router.get("/profile-v2/{user_id}")
async def get_profile_v2(user_id: str, pseudo: Optional[str] = None, db: AsyncSession = Depends(get_db)):
    """Profile with theme-based XP system."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        # Auto-recreate user if they have a valid ID but were lost (e.g. DB reset)
        user = User(id=user_id, pseudo=pseudo or f"Joueur_{user_id[:6]}", is_guest=True)
        db.add(user)
        await db.commit()
        await db.refresh(user)

    # Get all theme XPs for this user
    xp_result = await db.execute(
        select(UserThemeXP).where(UserThemeXP.user_id == user_id)
    )
    user_xps = xp_result.scalars().all()
    xp_map = {uxp.theme_id: uxp.xp for uxp in user_xps}

    # Get themes for context
    theme_ids = list(xp_map.keys())
    themes_data = []
    all_unlocked_titles = []
    if theme_ids:
        themes_res = await db.execute(select(Theme).where(Theme.id.in_(theme_ids)))
        themes = {t.id: t for t in themes_res.scalars().all()}

        for tid, xp in sorted(xp_map.items(), key=lambda x: -x[1]):
            t = themes.get(tid)
            if not t:
                continue
            lvl = get_category_level(xp)
            title = get_theme_title(t, lvl)
            themes_data.append({
                "id": t.id,
                "name": t.name,
                "super_category": t.super_category,
                "cluster": t.cluster,
                "color_hex": t.color_hex or "#8A2BE2",
                "icon_url": t.icon_url or "",
                "xp": xp,
                "level": lvl,
                "title": title,
                "xp_progress": get_xp_progress(xp, lvl),
            })
            for ut in get_theme_unlocked_titles(t, lvl):
                all_unlocked_titles.append({**ut, "theme_id": t.id, "theme_name": t.name})

    # Match history
    matches_res = await db.execute(
        select(Match).where(Match.player1_id == user_id).order_by(Match.created_at.desc()).limit(10)
    )
    matches = matches_res.scalars().all()

    # Followers
    followers_count_res = await db.execute(
        select(func.count(PlayerFollow.id)).where(PlayerFollow.followed_id == user_id)
    )
    followers_count = followers_count_res.scalar() or 0
    following_count_res = await db.execute(
        select(func.count(PlayerFollow.id)).where(PlayerFollow.follower_id == user_id)
    )
    following_count = following_count_res.scalar() or 0

    country_flag = COUNTRY_FLAGS.get(user.country or "", "")

    return {
        "user": {
            "id": user.id, "pseudo": user.pseudo, "avatar_seed": user.avatar_seed,
            "is_guest": user.is_guest, "total_xp": user.total_xp,
            "selected_title": user.selected_title,
            "country": user.country, "country_flag": country_flag,
            "matches_played": user.matches_played, "matches_won": user.matches_won,
            "best_streak": user.best_streak, "current_streak": user.current_streak,
            "streak_badge": get_streak_badge(user.current_streak),
            "win_rate": round(user.matches_won / max(user.matches_played, 1) * 100),
            "followers_count": followers_count,
            "following_count": following_count,
        },
        "themes": themes_data,
        "all_unlocked_titles": all_unlocked_titles,
        "match_history": [
            {
                "id": m.id, "category": m.category,
                "player_score": m.player1_score, "opponent_score": m.player2_score,
                "opponent": m.player2_pseudo, "won": m.winner_id == user_id,
                "xp_earned": m.xp_earned or 0,
                "xp_breakdown": m.xp_breakdown,
                "correct_count": m.player1_correct or 0,
                "created_at": m.created_at.isoformat()
            } for m in matches
        ],
    }


# ── Question Report (Signal Error) ──

class QuestionReportRequest(BaseModel):
    user_id: str
    question_id: str
    question_text: Optional[str] = None
    category: Optional[str] = None
    reason_type: str  # wrong_answer, unclear_question, typo, outdated, other
    description: Optional[str] = None

@api_router.post("/questions/report")
async def report_question(req: QuestionReportRequest, db: AsyncSession = Depends(get_db)):
    """Report an error in a quiz question."""
    valid_reasons = ["wrong_answer", "unclear_question", "typo", "outdated", "other"]
    if req.reason_type not in valid_reasons:
        raise HTTPException(status_code=400, detail=f"reason_type must be one of: {', '.join(valid_reasons)}")

    if not req.user_id or not req.question_id:
        raise HTTPException(status_code=400, detail="user_id and question_id are required")

    # Check for duplicate report
    existing = await db.execute(
        select(QuestionReport).where(
            QuestionReport.user_id == req.user_id,
            QuestionReport.question_id == req.question_id,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Vous avez déjà signalé cette question")

    report = QuestionReport(
        user_id=req.user_id,
        question_id=req.question_id,
        question_text=req.question_text,
        category=req.category,
        reason_type=req.reason_type,
        description=req.description[:500] if req.description else None,
        status="pending",
    )
    db.add(report)
    await db.commit()
    await db.refresh(report)

    return {"success": True, "report_id": report.id}


# ══════════════════════════════════════════════════════════════
# ── ADMIN: Upload Themes CSV (replaces all existing themes) ──
# ══════════════════════════════════════════════════════════════

@api_router.post("/admin/upload-themes-csv")
async def upload_themes_csv(request: Request, db: AsyncSession = Depends(get_db)):
    """Upload a themes CSV that replaces all existing themes.
    Expects JSON body: { password: str, themes_csv: str }
    CSV columns: ID_Theme;Super_Categorie;Cluster;Nom_Public;Description;Couleur_Hex;Titre_Niv_1;Titre_Niv_10;Titre_Niv_20;Titre_Niv_35;Titre_Niv_50;URL_Icone
    """
    body = await request.json()
    password = body.get("password", "")
    themes_csv_text = body.get("themes_csv", "")

    if password != ADMIN_PASSWORD:
        raise HTTPException(status_code=403, detail="Mot de passe administrateur incorrect")

    if not themes_csv_text.strip():
        raise HTTPException(status_code=400, detail="CSV vide")

    # Delete all existing themes
    await db.execute(text("DELETE FROM themes"))
    await db.commit()

    # Parse and import new themes
    themes_reader = csv.DictReader(io.StringIO(themes_csv_text), delimiter=";")
    themes_imported = 0
    errors = []

    for i, row in enumerate(themes_reader):
        try:
            theme_id = row.get("ID_Theme", "").strip()
            if not theme_id:
                errors.append(f"Ligne {i+2}: ID_Theme vide")
                continue

            theme = Theme(
                id=theme_id,
                super_category=row.get("Super_Categorie", "").strip(),
                cluster=row.get("Cluster", "").strip(),
                name=row.get("Nom_Public", "").strip(),
                description=row.get("Description", "").strip(),
                color_hex=row.get("Couleur_Hex", "").strip(),
                title_lv1=row.get("Titre_Niv_1", "").strip(),
                title_lv10=row.get("Titre_Niv_10", "").strip(),
                title_lv20=row.get("Titre_Niv_20", "").strip(),
                title_lv35=row.get("Titre_Niv_35", "").strip(),
                title_lv50=row.get("Titre_Niv_50", "").strip(),
                icon_url=row.get("URL_Icone", "").strip(),
            )
            db.add(theme)
            themes_imported += 1
        except Exception as e:
            errors.append(f"Ligne {i+2}: {str(e)}")

    await db.commit()

    # Update question counts per theme
    try:
        result = await db.execute(select(Theme))
        themes_list = result.scalars().all()
        for t in themes_list:
            count_res = await db.execute(
                select(func.count(Question.id)).where(Question.category == t.id)
            )
            t.question_count = count_res.scalar() or 0
        await db.commit()
    except Exception:
        pass

    return {
        "success": True,
        "themes_imported": themes_imported,
        "errors": errors[:50],
    }


# ══════════════════════════════════════════════════════════════
# ── ADMIN: Themes Overview (Super Categories → Clusters → Themes) ──
# ══════════════════════════════════════════════════════════════

@api_router.get("/admin/themes-overview")
async def admin_themes_overview(db: AsyncSession = Depends(get_db)):
    """Return hierarchical view: super categories → clusters → themes with IDs and question counts."""
    result = await db.execute(
        select(Theme).order_by(Theme.super_category, Theme.cluster, Theme.name)
    )
    all_themes = result.scalars().all()

    # Build hierarchy
    sc_map = {}
    for t in all_themes:
        sc = t.super_category or "UNKNOWN"
        cl = t.cluster or "Sans cluster"
        if sc not in sc_map:
            meta = SUPER_CATEGORY_META.get(sc, {"icon": "?", "color": "#8A2BE2", "label": sc})
            sc_map[sc] = {
                "id": sc,
                "label": meta["label"],
                "icon": meta["icon"],
                "color": meta["color"],
                "clusters": {},
                "total_themes": 0,
                "total_questions": 0,
            }
        if cl not in sc_map[sc]["clusters"]:
            sc_map[sc]["clusters"][cl] = {
                "name": cl,
                "icon": CLUSTER_ICONS.get(cl, ""),
                "themes": [],
                "total_questions": 0,
            }
        q_count = t.question_count or 0
        sc_map[sc]["clusters"][cl]["themes"].append({
            "id": t.id,
            "name": t.name,
            "description": t.description or "",
            "question_count": q_count,
            "color_hex": t.color_hex or "",
        })
        sc_map[sc]["clusters"][cl]["total_questions"] += q_count
        sc_map[sc]["total_themes"] += 1
        sc_map[sc]["total_questions"] += q_count

    # Convert to list format
    result_list = []
    for sc_key, sc_data in sc_map.items():
        clusters_list = []
        for cl_name, cl_data in sc_data["clusters"].items():
            clusters_list.append(cl_data)
        sc_data["clusters"] = clusters_list
        result_list.append(sc_data)

    return {
        "super_categories": result_list,
        "totals": {
            "super_categories": len(result_list),
            "clusters": sum(len(sc["clusters"]) for sc in result_list),
            "themes": sum(sc["total_themes"] for sc in result_list),
            "questions": sum(sc["total_questions"] for sc in result_list),
        }
    }


# ══════════════════════════════════════════════════════════════
# ── ADMIN: Match Stats by Theme ──
# ══════════════════════════════════════════════════════════════

@api_router.get("/admin/match-stats-by-theme")
async def admin_match_stats_by_theme(db: AsyncSession = Depends(get_db)):
    """Return match counts per theme/category, ordered by popularity."""
    result = await db.execute(
        select(Match.category, func.count(Match.id).label("match_count"))
        .group_by(Match.category)
        .order_by(func.count(Match.id).desc())
    )
    rows = result.all()

    # Get theme names
    themes_res = await db.execute(select(Theme))
    themes_map = {t.id: t.name for t in themes_res.scalars().all()}

    stats = []
    total_matches = 0
    for cat, count in rows:
        theme_name = themes_map.get(cat, CATEGORY_MAP.get(cat, cat))
        stats.append({
            "theme_id": cat,
            "theme_name": theme_name,
            "match_count": count,
        })
        total_matches += count

    return {
        "stats": stats,
        "total_matches": total_matches,
    }


# ══════════════════════════════════════════════════════════════
# ── ADMIN: Question Reports ──
# ══════════════════════════════════════════════════════════════

@api_router.get("/admin/reports")
async def admin_get_reports(
    status: Optional[str] = None,
    limit: int = 100,
    db: AsyncSession = Depends(get_db)
):
    """Get all question reports for admin review."""
    query = select(QuestionReport).order_by(QuestionReport.created_at.desc())
    if status:
        query = query.where(QuestionReport.status == status)
    query = query.limit(limit)

    result = await db.execute(query)
    reports = result.scalars().all()

    # Get reporter pseudo
    reports_data = []
    for r in reports:
        user_res = await db.execute(select(User).where(User.id == r.user_id))
        user = user_res.scalar_one_or_none()
        reports_data.append({
            "id": r.id,
            "user_id": r.user_id,
            "user_pseudo": user.pseudo if user else "Inconnu",
            "question_id": r.question_id,
            "question_text": r.question_text or "",
            "category": r.category or "",
            "reason_type": r.reason_type,
            "description": r.description or "",
            "status": r.status,
            "created_at": r.created_at.isoformat() if r.created_at else "",
        })

    # Count by status
    pending_res = await db.execute(
        select(func.count(QuestionReport.id)).where(QuestionReport.status == "pending")
    )
    pending_count = pending_res.scalar() or 0

    reviewed_res = await db.execute(
        select(func.count(QuestionReport.id)).where(QuestionReport.status == "reviewed")
    )
    reviewed_count = reviewed_res.scalar() or 0

    resolved_res = await db.execute(
        select(func.count(QuestionReport.id)).where(QuestionReport.status == "resolved")
    )
    resolved_count = resolved_res.scalar() or 0

    return {
        "reports": reports_data,
        "counts": {
            "pending": pending_count,
            "reviewed": reviewed_count,
            "resolved": resolved_count,
            "total": pending_count + reviewed_count + resolved_count,
        }
    }


@api_router.post("/admin/reports/{report_id}/status")
async def admin_update_report_status(report_id: str, request: Request, db: AsyncSession = Depends(get_db)):
    """Update the status of a question report."""
    body = await request.json()
    new_status = body.get("status", "")
    if new_status not in ("pending", "reviewed", "resolved"):
        raise HTTPException(status_code=400, detail="Status invalide")

    result = await db.execute(select(QuestionReport).where(QuestionReport.id == report_id))
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="Signalement introuvable")

    report.status = new_status
    await db.commit()
    return {"success": True, "status": new_status}


# ── App Setup ──

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
