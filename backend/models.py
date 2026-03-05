import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, Boolean, Float, DateTime, JSON, Text, UniqueConstraint, Index
from database import Base


def generate_uuid():
    return str(uuid.uuid4())


def utc_now():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = 'users'

    id = Column(String(36), primary_key=True, default=generate_uuid)
    pseudo = Column(String(50), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=True, index=True)
    password_hash = Column(String(255), nullable=True)
    is_guest = Column(Boolean, default=True)
    avatar_seed = Column(String(50), default=lambda: str(uuid.uuid4())[:8])

    # Location
    city = Column(String(100), nullable=True)
    region = Column(String(100), nullable=True)
    country = Column(String(100), nullable=True)
    continent = Column(String(50), nullable=True)

    # XP per category
    xp_series_tv = Column(Integer, default=0)
    xp_geographie = Column(Integer, default=0)
    xp_histoire = Column(Integer, default=0)
    total_xp = Column(Integer, default=0)

    # Stats
    matches_played = Column(Integer, default=0)
    matches_won = Column(Integer, default=0)
    best_streak = Column(Integer, default=0)
    current_streak = Column(Integer, default=0)

    created_at = Column(DateTime(timezone=True), default=utc_now)


class Question(Base):
    __tablename__ = 'questions'

    id = Column(String(36), primary_key=True, default=generate_uuid)
    category = Column(String(100), nullable=False, index=True)
    question_text = Column(Text, nullable=False)
    options = Column(JSON, nullable=False)  # Array of 4 strings
    correct_option = Column(Integer, nullable=False)  # Index 0-3
    difficulty = Column(String(20), default='medium')
    created_at = Column(DateTime(timezone=True), default=utc_now)

    __table_args__ = (
        UniqueConstraint('question_text', name='uq_question_text'),
    )


class Match(Base):
    __tablename__ = 'matches'

    id = Column(String(36), primary_key=True, default=generate_uuid)
    player1_id = Column(String(36), nullable=False, index=True)
    player2_id = Column(String(36), nullable=True)
    player2_pseudo = Column(String(50), nullable=True)
    player2_is_bot = Column(Boolean, default=False)
    category = Column(String(100), nullable=False)
    player1_score = Column(Integer, default=0)
    player2_score = Column(Integer, default=0)
    winner_id = Column(String(36), nullable=True)
    questions_data = Column(JSON, nullable=True)  # Store question IDs + answers
    created_at = Column(DateTime(timezone=True), default=utc_now)
