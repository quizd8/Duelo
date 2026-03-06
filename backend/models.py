import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, Boolean, Float, DateTime, JSON, Text, UniqueConstraint
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

    # XP per category (All-Time)
    xp_series_tv = Column(Integer, default=0)
    xp_geographie = Column(Integer, default=0)
    xp_histoire = Column(Integer, default=0)
    total_xp = Column(Integer, default=0)

    # Seasonal XP (reset monthly)
    seasonal_xp_series_tv = Column(Integer, default=0)
    seasonal_xp_geographie = Column(Integer, default=0)
    seasonal_xp_histoire = Column(Integer, default=0)
    seasonal_total_xp = Column(Integer, default=0)
    season_month = Column(String(7), nullable=True)  # "2026-03"

    # Stats
    matches_played = Column(Integer, default=0)
    matches_won = Column(Integer, default=0)
    best_streak = Column(Integer, default=0)
    current_streak = Column(Integer, default=0)

    # MMR (hidden matchmaking rating)
    mmr = Column(Float, default=1000.0)

    # Selected title for display in duels
    selected_title = Column(String(100), nullable=True)

    created_at = Column(DateTime(timezone=True), default=utc_now)


class Question(Base):
    __tablename__ = 'questions'

    id = Column(String(36), primary_key=True, default=generate_uuid)
    category = Column(String(100), nullable=False, index=True)
    question_text = Column(Text, nullable=False)
    options = Column(JSON, nullable=False)
    correct_option = Column(Integer, nullable=False)
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
    player1_correct = Column(Integer, default=0)
    winner_id = Column(String(36), nullable=True)
    xp_earned = Column(Integer, default=0)
    xp_breakdown = Column(JSON, nullable=True)  # {base, victory, perfection, giant_slayer, streak}
    questions_data = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now)



class CategoryFollow(Base):
    __tablename__ = 'category_follows'

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), nullable=False, index=True)
    category_id = Column(String(100), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=utc_now)

    __table_args__ = (
        UniqueConstraint('user_id', 'category_id', name='uq_user_category_follow'),
    )


class WallPost(Base):
    __tablename__ = 'wall_posts'

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), nullable=False, index=True)
    category_id = Column(String(100), nullable=False, index=True)
    content = Column(Text, nullable=False)
    image_base64 = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now)


class PostLike(Base):
    __tablename__ = 'post_likes'

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), nullable=False, index=True)
    post_id = Column(String(36), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=utc_now)

    __table_args__ = (
        UniqueConstraint('user_id', 'post_id', name='uq_user_post_like'),
    )


class PostComment(Base):
    __tablename__ = 'post_comments'

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), nullable=False, index=True)
    post_id = Column(String(36), nullable=False, index=True)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now)


class PlayerFollow(Base):
    __tablename__ = 'player_follows'

    id = Column(String(36), primary_key=True, default=generate_uuid)
    follower_id = Column(String(36), nullable=False, index=True)
    followed_id = Column(String(36), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=utc_now)

    __table_args__ = (
        UniqueConstraint('follower_id', 'followed_id', name='uq_player_follow'),
    )


class ChatMessage(Base):
    __tablename__ = 'chat_messages'

    id = Column(String(36), primary_key=True, default=generate_uuid)
    sender_id = Column(String(36), nullable=False, index=True)
    receiver_id = Column(String(36), nullable=False, index=True)
    content = Column(Text, nullable=False)
    read = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=utc_now)
