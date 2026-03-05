"""
Backend API Tests for Duelo Quiz App
Tests: Health, Categories, Auth (guest registration, pseudo check), 
Game (questions, matchmaking, submit), Leaderboard, Profile, Admin (verify, import)
"""
import pytest
import requests
import os
import json
from pathlib import Path
from dotenv import load_dotenv

# Load frontend .env to get EXPO_PUBLIC_BACKEND_URL
frontend_env = Path(__file__).parent.parent.parent / 'frontend' / '.env'
load_dotenv(frontend_env)

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL')
if not BASE_URL:
    raise ValueError("EXPO_PUBLIC_BACKEND_URL not found")

class TestHealth:
    """API health check"""

    def test_health_check(self, api_client):
        response = api_client.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["database"] == "connected"


class TestCategories:
    """Categories endpoint tests"""

    def test_get_categories(self, api_client):
        response = api_client.get(f"{BASE_URL}/api/categories")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 3
        
        # Verify all expected categories present
        category_ids = [cat["id"] for cat in data]
        assert "series_tv" in category_ids
        assert "geographie" in category_ids
        assert "histoire" in category_ids
        
        # Verify structure
        for cat in data:
            assert "id" in cat
            assert "name" in cat
            assert "question_count" in cat
            assert cat["question_count"] >= 0


class TestAuth:
    """Authentication endpoint tests"""

    def test_check_pseudo_available(self, api_client):
        response = api_client.post(
            f"{BASE_URL}/api/auth/check-pseudo",
            json={"pseudo": "TEST_UniqueUser_12345"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "available" in data
        assert data["available"] is True

    def test_check_pseudo_taken(self, api_client):
        # First create a user
        pseudo = "TEST_TakenUser_999"
        api_client.post(
            f"{BASE_URL}/api/auth/register-guest",
            json={"pseudo": pseudo}
        )
        
        # Now check if taken
        response = api_client.post(
            f"{BASE_URL}/api/auth/check-pseudo",
            json={"pseudo": pseudo}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["available"] is False

    def test_register_guest_success(self, api_client):
        response = api_client.post(
            f"{BASE_URL}/api/auth/register-guest",
            json={"pseudo": "TEST_GuestUser_123"}
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "id" in data
        assert data["pseudo"] == "TEST_GuestUser_123"
        assert data["is_guest"] is True
        assert "avatar_seed" in data
        assert data["total_xp"] == 0
        assert data["matches_played"] == 0

    def test_register_guest_duplicate_fails(self, api_client):
        pseudo = "TEST_DupeGuest_456"
        # First registration
        api_client.post(
            f"{BASE_URL}/api/auth/register-guest",
            json={"pseudo": pseudo}
        )
        
        # Second registration should fail
        response = api_client.post(
            f"{BASE_URL}/api/auth/register-guest",
            json={"pseudo": pseudo}
        )
        assert response.status_code == 409
        data = response.json()
        assert "detail" in data

    def test_register_guest_short_pseudo(self, api_client):
        response = api_client.post(
            f"{BASE_URL}/api/auth/register-guest",
            json={"pseudo": "ab"}
        )
        assert response.status_code == 400


class TestGame:
    """Game-related endpoint tests"""

    def test_get_questions_series_tv(self, api_client):
        response = api_client.get(f"{BASE_URL}/api/game/questions?category=series_tv")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 1  # At least 1 question
        
        # Verify question structure
        if len(data) > 0:
            q = data[0]
            assert "id" in q
            assert "category" in q
            assert "question_text" in q
            assert "options" in q
            assert "correct_option" in q
            assert "difficulty" in q
            assert len(q["options"]) == 4

    def test_get_questions_geographie(self, api_client):
        response = api_client.get(f"{BASE_URL}/api/game/questions?category=geographie")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

    def test_get_questions_histoire(self, api_client):
        response = api_client.get(f"{BASE_URL}/api/game/questions?category=histoire")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)

    def test_matchmaking_returns_bot(self, api_client):
        response = api_client.post(f"{BASE_URL}/api/game/matchmaking")
        assert response.status_code == 200
        
        data = response.json()
        assert "opponent" in data
        opponent = data["opponent"]
        assert "pseudo" in opponent
        assert "avatar_seed" in opponent
        assert "is_bot" in opponent
        assert opponent["is_bot"] is True

    def test_submit_match_and_verify(self, api_client):
        # Create a test user first
        reg_response = api_client.post(
            f"{BASE_URL}/api/auth/register-guest",
            json={"pseudo": "TEST_MatchPlayer_789"}
        )
        user_data = reg_response.json()
        user_id = user_data["id"]
        
        # Submit match
        match_payload = {
            "player_id": user_id,
            "category": "series_tv",
            "player_score": 120,
            "opponent_score": 80,
            "opponent_pseudo": "BotOpponent",
            "opponent_is_bot": True
        }
        
        submit_response = api_client.post(
            f"{BASE_URL}/api/game/submit",
            json=match_payload
        )
        assert submit_response.status_code == 200
        
        match_data = submit_response.json()
        assert "id" in match_data
        assert match_data["player1_id"] == user_id
        assert match_data["player1_score"] == 120
        assert match_data["player2_score"] == 80
        assert match_data["winner_id"] == user_id
        
        # Verify data persisted by getting user profile
        profile_response = api_client.get(f"{BASE_URL}/api/profile/{user_id}")
        assert profile_response.status_code == 200
        
        profile_data = profile_response.json()
        assert profile_data["user"]["matches_played"] == 1
        assert profile_data["user"]["matches_won"] == 1
        assert profile_data["user"]["total_xp"] > 0


class TestLeaderboard:
    """Leaderboard endpoint tests"""

    def test_get_leaderboard_world(self, api_client):
        response = api_client.get(f"{BASE_URL}/api/leaderboard?scope=world&limit=50")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        
        # Verify leaderboard entry structure
        if len(data) > 0:
            entry = data[0]
            assert "pseudo" in entry
            assert "avatar_seed" in entry
            assert "total_xp" in entry
            assert "matches_won" in entry
            assert "rank" in entry


class TestProfile:
    """Profile endpoint tests"""

    def test_get_profile_success(self, api_client):
        # Create test user
        reg_response = api_client.post(
            f"{BASE_URL}/api/auth/register-guest",
            json={"pseudo": "TEST_ProfileUser_321"}
        )
        user_data = reg_response.json()
        user_id = user_data["id"]
        
        # Get profile
        response = api_client.get(f"{BASE_URL}/api/profile/{user_id}")
        assert response.status_code == 200
        
        data = response.json()
        assert "user" in data
        assert "match_history" in data
        
        user = data["user"]
        assert user["id"] == user_id
        assert user["pseudo"] == "TEST_ProfileUser_321"
        assert "total_xp" in user
        assert "level" in user
        assert "title" in user
        assert "matches_played" in user
        assert "matches_won" in user

    def test_get_profile_not_found(self, api_client):
        response = api_client.get(f"{BASE_URL}/api/profile/nonexistent-user-id-999")
        assert response.status_code == 404


class TestAdmin:
    """Admin endpoint tests"""

    def test_admin_verify_correct_password(self, api_client):
        response = api_client.post(
            f"{BASE_URL}/api/admin/verify",
            json={"password": "Temporaire1!"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["verified"] is True

    def test_admin_verify_wrong_password(self, api_client):
        response = api_client.post(
            f"{BASE_URL}/api/admin/verify",
            json={"password": "WrongPassword123"}
        )
        assert response.status_code == 403

    def test_admin_import_questions(self, api_client):
        # Test import with a new question
        import_payload = {
            "category": "series_tv",
            "questions": [
                {
                    "question_text": "TEST_QUESTION_Unique_12345: What is testing?",
                    "options": ["Option A", "Option B", "Option C", "Option D"],
                    "correct_option": 0,
                    "difficulty": "easy"
                }
            ]
        }
        
        response = api_client.post(
            f"{BASE_URL}/api/admin/import-questions",
            json=import_payload
        )
        assert response.status_code == 200
        
        data = response.json()
        assert "imported" in data
        assert "duplicates" in data
        assert "errors" in data
        assert "total_processed" in data
        assert data["total_processed"] == 1

    def test_admin_import_duplicate_detection(self, api_client):
        question_text = "TEST_DUPLICATE_Question_999: Unique question for duplicate test"
        import_payload = {
            "category": "histoire",
            "questions": [
                {
                    "question_text": question_text,
                    "options": ["A", "B", "C", "D"],
                    "correct_option": 0,
                    "difficulty": "medium"
                }
            ]
        }
        
        # First import
        response1 = api_client.post(
            f"{BASE_URL}/api/admin/import-questions",
            json=import_payload
        )
        data1 = response1.json()
        
        # Second import (should detect duplicate)
        response2 = api_client.post(
            f"{BASE_URL}/api/admin/import-questions",
            json=import_payload
        )
        assert response2.status_code == 200
        data2 = response2.json()
        assert data2["duplicates"] >= 1
