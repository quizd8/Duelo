from fastapi import FastAPI, APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
import random
import hashlib
import secrets
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timezone
from sqlalchemy import select, func, text
from sqlalchemy.ext.asyncio import AsyncSession
from database import get_db
from models import User, Question, Match, CategoryFollow, WallPost, PostLike, PostComment, generate_uuid

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', 'Temporaire1!')
JWT_SECRET = os.environ.get('JWT_SECRET', 'duelo_secret')

app = FastAPI()
api_router = APIRouter(prefix="/api")

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
    """Calculate level from category XP. Cap at 50."""
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
    "histoire": "Histoire de France"
}

CATEGORY_XP_FIELD = {
    "series_tv": "xp_series_tv",
    "geographie": "xp_geographie",
    "histoire": "xp_histoire"
}

TOTAL_QUESTIONS = 7

# ── Auth Routes ──

@api_router.post("/auth/register-guest", response_model=UserResponse)
async def register_guest(data: GuestRegister, db: AsyncSession = Depends(get_db)):
    pseudo = data.pseudo.strip()
    if len(pseudo) < 3 or len(pseudo) > 20:
        raise HTTPException(status_code=400, detail="Le pseudo doit contenir entre 3 et 20 caractères")

    result = await db.execute(select(User).where(User.pseudo == pseudo))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Ce pseudo est déjà pris")

    user = User(pseudo=pseudo, is_guest=True)
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
        user.seasonal_total_xp = 0
        user.season_month = current


@api_router.post("/game/matchmaking")
async def start_matchmaking(data: MatchmakingRequest, db: AsyncSession = Depends(get_db)):
    """Returns a bot opponent with category-matched level."""
    player_level = 1
    player_title = get_category_title(data.category, 1)

    if data.player_id:
        result = await db.execute(select(User).where(User.id == data.player_id))
        user = result.scalar_one_or_none()
        if user:
            xp_field = CATEGORY_XP_FIELD.get(data.category)
            player_xp = getattr(user, xp_field, 0) if xp_field else 0
            player_level = get_category_level(player_xp)
            player_title = get_category_title(data.category, player_level)

    # Bot with similar category level (+/- 5)
    bot_level = max(1, min(MAX_LEVEL, player_level + random.randint(-5, 5)))
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
        user.total_xp = user.xp_series_tv + user.xp_geographie + user.xp_histoire

        # Seasonal XP
        ensure_season(user)
        seasonal_field = f"seasonal_{xp_field}" if xp_field else None
        if seasonal_field:
            setattr(user, seasonal_field, getattr(user, seasonal_field, 0) + total_xp)
        user.seasonal_total_xp = (
            user.seasonal_xp_series_tv + user.seasonal_xp_geographie + user.seasonal_xp_histoire
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

    return {
        "user": {
            "id": user.id, "pseudo": user.pseudo, "avatar_seed": user.avatar_seed,
            "is_guest": user.is_guest, "total_xp": user.total_xp,
            "selected_title": user.selected_title,
            "categories": categories_data,
            "matches_played": user.matches_played, "matches_won": user.matches_won,
            "best_streak": user.best_streak, "current_streak": user.current_streak,
            "streak_badge": get_streak_badge(user.current_streak),
            "win_rate": round(user.matches_won / max(user.matches_played, 1) * 100),
            "mmr": round(user.mmr or 1000),
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
    cat_names = {"series_tv": "Séries TV Cultes", "geographie": "Géographie Mondiale", "histoire": "Histoire de France"}
    if category_id not in cat_names:
        raise HTTPException(status_code=404, detail="Catégorie introuvable")

    # Total questions in category
    q_count = await db.execute(select(func.count(Question.id)).where(Question.category == category_id))
    total_questions = q_count.scalar() or 0

    # Followers count
    f_count = await db.execute(select(func.count(CategoryFollow.id)).where(CategoryFollow.category_id == category_id))
    followers_count = f_count.scalar() or 0

    # User-specific data
    user_level = 1
    user_title = get_category_title(category_id, 1)
    user_xp = 0
    is_following = False
    completion_pct = 0
    xp_progress = get_xp_progress(0, 1)

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
        "name": cat_names[category_id],
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
        await db.commit()
        return {"liked": True}


@api_router.post("/wall/{post_id}/comment")
async def add_comment(post_id: str, data: CommentCreate, db: AsyncSession = Depends(get_db)):
    """Add a comment to a wall post."""
    if not data.content.strip():
        raise HTTPException(status_code=400, detail="Le commentaire ne peut pas être vide")

    comment = PostComment(user_id=data.user_id, post_id=post_id, content=data.content.strip())
    db.add(comment)
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

@api_router.post("/admin/seed")
async def seed_questions(db: AsyncSession = Depends(get_db)):
    seed_data = {
        "series_tv": [
            {"question_text": "Dans quelle série Walter White fabrique-t-il de la méthamphétamine ?", "options": ["Better Call Saul", "Breaking Bad", "Ozark", "Narcos"], "correct_option": 1, "difficulty": "easy"},
            {"question_text": "Quel est le nom du bar dans How I Met Your Mother ?", "options": ["Le Central Perk", "Le Paddy's Pub", "Le MacLaren's", "Le Moe's"], "correct_option": 2, "difficulty": "easy"},
            {"question_text": "Qui est le Roi du Nord dans Game of Thrones (Saison 1) ?", "options": ["Ned Stark", "Robb Stark", "Jon Snow", "Theon Greyjoy"], "correct_option": 1, "difficulty": "medium"},
            {"question_text": "Dans Friends, quel est le métier de Chandler Bing ?", "options": ["Acteur", "Chef cuisinier", "Analyse statistique et reconfiguration de données", "Professeur"], "correct_option": 2, "difficulty": "medium"},
            {"question_text": "Combien de saisons compte la série The Office (US) ?", "options": ["7", "8", "9", "10"], "correct_option": 2, "difficulty": "easy"},
            {"question_text": "Quel personnage dit 'Winter is Coming' dans Game of Thrones ?", "options": ["Tyrion Lannister", "Cersei Lannister", "Ned Stark", "Daenerys Targaryen"], "correct_option": 2, "difficulty": "easy"},
            {"question_text": "Dans Stranger Things, comment s'appelle le monde parallèle ?", "options": ["L'Upside Down", "Le Néant", "La Zone Fantôme", "L'Autre Côté"], "correct_option": 0, "difficulty": "easy"},
            {"question_text": "Qui joue le Docteur dans Dr House ?", "options": ["Robert Downey Jr.", "Hugh Laurie", "Benedict Cumberbatch", "Matt Smith"], "correct_option": 1, "difficulty": "easy"},
            {"question_text": "Dans La Casa de Papel, quel est le vrai nom du Professeur ?", "options": ["Sergio Marquina", "Andrés de Fonollosa", "Martín Berrote", "Agustín Ramos"], "correct_option": 0, "difficulty": "medium"},
            {"question_text": "Quelle série se déroule dans la prison de Litchfield ?", "options": ["Prison Break", "Oz", "Orange Is the New Black", "Wentworth"], "correct_option": 2, "difficulty": "easy"},
        ],
        "geographie": [
            {"question_text": "Quelle est la capitale de l'Australie ?", "options": ["Sydney", "Melbourne", "Canberra", "Brisbane"], "correct_option": 2, "difficulty": "medium"},
            {"question_text": "Quel est le plus long fleuve du monde ?", "options": ["Le Nil", "L'Amazone", "Le Yangtsé", "Le Mississippi"], "correct_option": 0, "difficulty": "easy"},
            {"question_text": "Dans quel pays se trouve le Machu Picchu ?", "options": ["Bolivie", "Pérou", "Colombie", "Équateur"], "correct_option": 1, "difficulty": "easy"},
            {"question_text": "Quel est le plus petit pays du monde ?", "options": ["Monaco", "San Marin", "Vatican", "Liechtenstein"], "correct_option": 2, "difficulty": "easy"},
            {"question_text": "Combien de continents y a-t-il ?", "options": ["5", "6", "7", "8"], "correct_option": 2, "difficulty": "easy"},
            {"question_text": "Quel détroit sépare l'Europe de l'Afrique ?", "options": ["Bosphore", "Gibraltar", "Ormuz", "Malacca"], "correct_option": 1, "difficulty": "medium"},
            {"question_text": "Quelle est la capitale du Canada ?", "options": ["Toronto", "Montréal", "Ottawa", "Vancouver"], "correct_option": 2, "difficulty": "easy"},
            {"question_text": "Quel pays a le plus de fuseaux horaires ?", "options": ["Russie", "États-Unis", "France", "Chine"], "correct_option": 2, "difficulty": "hard"},
            {"question_text": "Où se trouve le désert du Sahara ?", "options": ["Asie", "Amérique du Sud", "Afrique", "Océanie"], "correct_option": 2, "difficulty": "easy"},
            {"question_text": "Quelle est la montagne la plus haute du monde ?", "options": ["K2", "Kangchenjunga", "Mont Blanc", "Everest"], "correct_option": 3, "difficulty": "easy"},
        ],
        "histoire": [
            {"question_text": "En quelle année a eu lieu la prise de la Bastille ?", "options": ["1776", "1789", "1792", "1799"], "correct_option": 1, "difficulty": "easy"},
            {"question_text": "Qui était le Roi-Soleil ?", "options": ["Louis XIII", "Louis XIV", "Louis XV", "Louis XVI"], "correct_option": 1, "difficulty": "easy"},
            {"question_text": "Quelle bataille Napoléon a-t-il perdue en 1815 ?", "options": ["Austerlitz", "Trafalgar", "Waterloo", "Iéna"], "correct_option": 2, "difficulty": "easy"},
            {"question_text": "En quelle année la France est-elle devenue une République pour la première fois ?", "options": ["1789", "1792", "1804", "1848"], "correct_option": 1, "difficulty": "hard"},
            {"question_text": "Qui a été le premier président de la Ve République ?", "options": ["René Coty", "Charles de Gaulle", "Georges Pompidou", "Vincent Auriol"], "correct_option": 1, "difficulty": "easy"},
            {"question_text": "Quel traité a mis fin à la Première Guerre mondiale ?", "options": ["Traité de Paris", "Traité de Versailles", "Traité de Westphalie", "Traité de Rome"], "correct_option": 1, "difficulty": "medium"},
            {"question_text": "Jeanne d'Arc a été brûlée dans quelle ville ?", "options": ["Paris", "Orléans", "Rouen", "Reims"], "correct_option": 2, "difficulty": "medium"},
            {"question_text": "En quelle année le mur de Berlin est-il tombé ?", "options": ["1987", "1988", "1989", "1990"], "correct_option": 2, "difficulty": "easy"},
            {"question_text": "Qui a construit le château de Versailles ?", "options": ["François Ier", "Henri IV", "Louis XIII", "Louis XIV"], "correct_option": 3, "difficulty": "medium"},
            {"question_text": "Quel empereur a créé le Code civil français ?", "options": ["Charlemagne", "Napoléon Bonaparte", "Louis XIV", "Napoléon III"], "correct_option": 1, "difficulty": "easy"},
        ]
    }

    imported = 0
    for category, questions in seed_data.items():
        for q in questions:
            result = await db.execute(
                select(Question).where(Question.question_text == q["question_text"])
            )
            if not result.scalar_one_or_none():
                question = Question(category=category, **q)
                db.add(question)
                imported += 1

    await db.commit()
    return {"imported": imported, "message": f"{imported} questions importées avec succès"}


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


# ── Admin Dashboard (Desktop Web) ──

@api_router.get("/admin/dashboard", response_class=HTMLResponse)
async def admin_dashboard():
    html_path = ROOT_DIR / "admin_dashboard.html"
    return HTMLResponse(content=html_path.read_text(encoding="utf-8"))


# ── App Setup ──

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
