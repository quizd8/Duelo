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
    xp_cinema = Column(Integer, default=0)
    xp_sport = Column(Integer, default=0)
    xp_musique = Column(Integer, default=0)
    xp_sciences = Column(Integer, default=0)
    xp_gastronomie = Column(Integer, default=0)
    total_xp = Column(Integer, default=0)

    # Seasonal XP (reset monthly)
    seasonal_xp_series_tv = Column(Integer, default=0)
    seasonal_xp_geographie = Column(Integer, default=0)
    seasonal_xp_histoire = Column(Integer, default=0)
    seasonal_xp_cinema = Column(Integer, default=0)
    seasonal_xp_sport = Column(Integer, default=0)
    seasonal_xp_musique = Column(Integer, default=0)
    seasonal_xp_sciences = Column(Integer, default=0)
    seasonal_xp_gastronomie = Column(Integer, default=0)
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
        # Removed UniqueConstraint on question_text to allow same text across themes
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
    message_type = Column(String(20), default='text')  # text, image, game_card
    extra_data = Column(JSON, nullable=True)  # For image_url, game_card data, etc.
    read = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=utc_now)


class Notification(Base):
    __tablename__ = 'notifications'

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), nullable=False, index=True)
    type = Column(String(30), nullable=False, index=True)  # challenge, match_result, follow, message, like, comment, system
    title = Column(String(200), nullable=False)
    body = Column(Text, nullable=False)
    icon = Column(String(10), nullable=True)  # emoji icon
    data = Column(JSON, nullable=True)  # Deep link data: {screen, params}
    actor_id = Column(String(36), nullable=True, index=True)  # Who triggered the notification
    actor_pseudo = Column(String(50), nullable=True)
    actor_avatar_seed = Column(String(50), nullable=True)
    read = Column(Boolean, default=False, index=True)
    created_at = Column(DateTime(timezone=True), default=utc_now)


class NotificationSettings(Base):
    __tablename__ = 'notification_settings'

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), nullable=False, unique=True, index=True)
    challenges = Column(Boolean, default=True)
    match_results = Column(Boolean, default=True)
    follows = Column(Boolean, default=True)
    messages = Column(Boolean, default=True)
    likes = Column(Boolean, default=True)
    comments = Column(Boolean, default=True)
    system = Column(Boolean, default=True)
    updated_at = Column(DateTime(timezone=True), default=utc_now)


# ── New Hierarchical Theme System ──

class Theme(Base):
    __tablename__ = 'themes'

    id = Column(String(20), primary_key=True)  # e.g. "STV_BBAD"
    super_category = Column(String(50), nullable=False, index=True)  # e.g. "SCREEN"
    cluster = Column(String(100), nullable=False, index=True)  # e.g. "Séries TV"
    name = Column(String(200), nullable=False)  # e.g. "Breaking Bad"
    description = Column(Text, nullable=True)
    color_hex = Column(String(10), nullable=True)
    title_lv1 = Column(String(100), nullable=True)
    title_lv10 = Column(String(100), nullable=True)
    title_lv20 = Column(String(100), nullable=True)
    title_lv35 = Column(String(100), nullable=True)
    title_lv50 = Column(String(100), nullable=True)
    icon_url = Column(Text, nullable=True)
    question_count = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), default=utc_now)


class UserThemeXP(Base):
    __tablename__ = 'user_theme_xp'

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), nullable=False, index=True)
    theme_id = Column(String(20), nullable=False, index=True)
    xp = Column(Integer, default=0)

    __table_args__ = (
        UniqueConstraint('user_id', 'theme_id', name='uq_user_theme_xp'),
    )



class QuestionReport(Base):
    __tablename__ = 'question_reports'

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), nullable=False, index=True)
    question_id = Column(String(36), nullable=False, index=True)
    question_text = Column(Text, nullable=True)
    category = Column(String(100), nullable=True)
    reason_type = Column(String(30), nullable=False)  # wrong_answer, unclear_question, typo, outdated, other
    description = Column(Text, nullable=True)
    status = Column(String(20), default='pending')  # pending, reviewed, resolved
    created_at = Column(DateTime(timezone=True), default=utc_now)

    __table_args__ = (
        UniqueConstraint('user_id', 'question_id', name='uq_user_question_report'),
    )
