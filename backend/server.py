from fastapi import FastAPI, APIRouter, Depends, HTTPException
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
from models import User, Question, Match, generate_uuid

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
    questions_data: Optional[list] = None

class MatchResponse(BaseModel):
    id: str
    player1_id: str
    player2_pseudo: Optional[str] = None
    player2_is_bot: bool
    category: str
    player1_score: int
    player2_score: int
    winner_id: Optional[str] = None
    created_at: str

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

XP_LEVELS = {
    1: 0, 2: 100, 3: 250, 4: 450, 5: 700, 6: 1000, 7: 1400, 8: 1900, 9: 2500, 10: 3200,
    15: 6000, 20: 10000, 30: 20000, 50: 50000, 75: 100000, 100: 200000
}

TITLES = [
    (0, "Novice"), (500, "Apprenti"), (1500, "Challenger"), (3000, "Expert"),
    (6000, "Maître"), (12000, "Grand Maître"), (25000, "Champion"), (50000, "Légende"),
    (100000, "Mythique"), (200000, "Divin")
]

def get_level(xp: int) -> int:
    level = 1
    for lvl, required in sorted(XP_LEVELS.items()):
        if xp >= required:
            level = lvl
    return level

def get_title(xp: int) -> str:
    title = "Novice"
    for required, t in TITLES:
        if xp >= required:
            title = t
    return title

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


@api_router.post("/game/matchmaking")
async def start_matchmaking(db: AsyncSession = Depends(get_db)):
    """Returns a bot opponent (real matchmaking would need websockets)"""
    bot_name = random.choice(BOT_NAMES)
    bot_seed = secrets.token_hex(4)
    return {
        "opponent": {
            "pseudo": bot_name,
            "avatar_seed": bot_seed,
            "is_bot": True
        }
    }


@api_router.post("/game/submit", response_model=MatchResponse)
async def submit_match(data: MatchSubmit, db: AsyncSession = Depends(get_db)):
    # Create match record
    match = Match(
        player1_id=data.player_id,
        player2_pseudo=data.opponent_pseudo,
        player2_is_bot=data.opponent_is_bot,
        category=data.category,
        player1_score=data.player_score,
        player2_score=data.opponent_score,
        winner_id=data.player_id if data.player_score > data.opponent_score else None,
        questions_data=data.questions_data
    )
    db.add(match)

    # Update user stats
    result = await db.execute(select(User).where(User.id == data.player_id))
    user = result.scalar_one_or_none()
    if user:
        user.matches_played += 1
        won = data.player_score > data.opponent_score

        # XP earned from match
        xp_earned = data.player_score * 2
        if won:
            xp_earned += 50  # Win bonus
            user.matches_won += 1
            user.current_streak += 1
            if user.current_streak > user.best_streak:
                user.best_streak = user.current_streak
        else:
            user.current_streak = 0

        # Update category XP
        xp_field = CATEGORY_XP_FIELD.get(data.category)
        if xp_field:
            current = getattr(user, xp_field, 0)
            setattr(user, xp_field, current + xp_earned)

        user.total_xp = user.xp_series_tv + user.xp_geographie + user.xp_histoire

    await db.commit()
    await db.refresh(match)

    return MatchResponse(
        id=match.id, player1_id=match.player1_id,
        player2_pseudo=match.player2_pseudo, player2_is_bot=match.player2_is_bot,
        category=match.category, player1_score=match.player1_score,
        player2_score=match.player2_score, winner_id=match.winner_id,
        created_at=match.created_at.isoformat()
    )


# ── Leaderboard ──

@api_router.get("/leaderboard")
async def get_leaderboard(
    scope: str = "world",
    category: Optional[str] = None,
    limit: int = 50,
    db: AsyncSession = Depends(get_db)
):
    query = select(User).order_by(User.total_xp.desc())

    if scope == "city" and category:
        # Would filter by city - for now return all
        pass
    elif scope == "region" and category:
        pass
    elif scope == "country" and category:
        pass

    query = query.limit(limit)
    result = await db.execute(query)
    users = result.scalars().all()

    entries = []
    for i, u in enumerate(users):
        entries.append(LeaderboardEntry(
            pseudo=u.pseudo, avatar_seed=u.avatar_seed,
            total_xp=u.total_xp, matches_won=u.matches_won,
            rank=i + 1
        ))
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

    return {
        "user": {
            "id": user.id, "pseudo": user.pseudo, "avatar_seed": user.avatar_seed,
            "is_guest": user.is_guest, "total_xp": user.total_xp,
            "xp_series_tv": user.xp_series_tv, "xp_geographie": user.xp_geographie,
            "xp_histoire": user.xp_histoire,
            "level": get_level(user.total_xp), "title": get_title(user.total_xp),
            "matches_played": user.matches_played, "matches_won": user.matches_won,
            "best_streak": user.best_streak, "current_streak": user.current_streak,
            "win_rate": round(user.matches_won / max(user.matches_played, 1) * 100),
        },
        "match_history": [
            {
                "id": m.id, "category": m.category,
                "player_score": m.player1_score, "opponent_score": m.player2_score,
                "opponent": m.player2_pseudo, "won": m.winner_id == user_id,
                "created_at": m.created_at.isoformat()
            } for m in matches
        ]
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


# ── App Setup ──

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
