"""
Test Profile Redesign API Endpoints - Iteration 3
Tests for QuizUp-style profile page redesign features.

Features tested:
- /api/profile/{user_id} returns followers_count, following_count, country, country_flag
- /api/player/{user_id}/profile returns all required fields for public profile
- Follow/unfollow functionality affects follower counts
"""

import pytest
import requests
import os
import random
import string

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://theme-stats-hub-1.preview.emergentagent.com').rstrip('/')


def random_pseudo(prefix="T3_"):
    """Generate unique pseudo for test users"""
    return f"{prefix}{''.join(random.choices(string.ascii_lowercase + string.digits, k=8))}"


@pytest.fixture(scope="module")
def test_user():
    """Create a test user for profile testing"""
    pseudo = random_pseudo("ProfileTest_")
    response = requests.post(
        f"{BASE_URL}/api/auth/register-guest",
        json={"pseudo": pseudo}
    )
    assert response.status_code == 200
    data = response.json()
    return {
        "id": data["id"],
        "pseudo": data["pseudo"],
        "country": data.get("country"),
    }


@pytest.fixture(scope="module")
def second_user():
    """Create a second test user for follow tests"""
    pseudo = random_pseudo("FollowTest_")
    response = requests.post(
        f"{BASE_URL}/api/auth/register-guest",
        json={"pseudo": pseudo}
    )
    assert response.status_code == 200
    data = response.json()
    return {
        "id": data["id"],
        "pseudo": data["pseudo"],
    }


class TestProfileEndpoint:
    """Tests for /api/profile/{user_id} endpoint"""

    def test_profile_returns_followers_count(self, test_user):
        """Profile endpoint should return followers_count"""
        response = requests.get(f"{BASE_URL}/api/profile/{test_user['id']}")
        assert response.status_code == 200
        
        data = response.json()
        user = data.get("user", {})
        
        assert "followers_count" in user, "followers_count field missing from profile response"
        assert isinstance(user["followers_count"], int), "followers_count should be integer"

    def test_profile_returns_following_count(self, test_user):
        """Profile endpoint should return following_count"""
        response = requests.get(f"{BASE_URL}/api/profile/{test_user['id']}")
        assert response.status_code == 200
        
        data = response.json()
        user = data.get("user", {})
        
        assert "following_count" in user, "following_count field missing from profile response"
        assert isinstance(user["following_count"], int), "following_count should be integer"

    def test_profile_returns_country(self, test_user):
        """Profile endpoint should return country"""
        response = requests.get(f"{BASE_URL}/api/profile/{test_user['id']}")
        assert response.status_code == 200
        
        data = response.json()
        user = data.get("user", {})
        
        assert "country" in user, "country field missing from profile response"

    def test_profile_returns_country_flag(self, test_user):
        """Profile endpoint should return country_flag"""
        response = requests.get(f"{BASE_URL}/api/profile/{test_user['id']}")
        assert response.status_code == 200
        
        data = response.json()
        user = data.get("user", {})
        
        assert "country_flag" in user, "country_flag field missing from profile response"

    def test_profile_returns_categories_data(self, test_user):
        """Profile endpoint should return per-category stats with level and XP progress"""
        response = requests.get(f"{BASE_URL}/api/profile/{test_user['id']}")
        assert response.status_code == 200
        
        data = response.json()
        user = data.get("user", {})
        categories = user.get("categories", {})
        
        expected_categories = ["series_tv", "geographie", "histoire"]
        for cat in expected_categories:
            assert cat in categories, f"{cat} missing from categories"
            cat_data = categories[cat]
            assert "level" in cat_data, f"{cat} missing level"
            assert "xp" in cat_data, f"{cat} missing xp"
            assert "xp_progress" in cat_data, f"{cat} missing xp_progress"
            assert "progress" in cat_data["xp_progress"], f"{cat} xp_progress missing progress"

    def test_profile_returns_win_rate(self, test_user):
        """Profile endpoint should return win_rate"""
        response = requests.get(f"{BASE_URL}/api/profile/{test_user['id']}")
        assert response.status_code == 200
        
        data = response.json()
        user = data.get("user", {})
        
        assert "win_rate" in user, "win_rate field missing"
        assert isinstance(user["win_rate"], int), "win_rate should be integer"

    def test_profile_not_found(self):
        """Profile endpoint should return 404 for non-existent user"""
        response = requests.get(f"{BASE_URL}/api/profile/nonexistent-uuid-12345")
        assert response.status_code == 404


class TestPlayerProfileEndpoint:
    """Tests for /api/player/{user_id}/profile endpoint (public profile)"""

    def test_player_profile_returns_basic_info(self, test_user):
        """Player profile should return basic user info"""
        response = requests.get(f"{BASE_URL}/api/player/{test_user['id']}/profile")
        assert response.status_code == 200
        
        data = response.json()
        
        assert data.get("id") == test_user["id"]
        assert data.get("pseudo") == test_user["pseudo"]
        assert "avatar_seed" in data
        assert "selected_title" in data

    def test_player_profile_returns_country_and_flag(self, test_user):
        """Player profile should return country and country_flag"""
        response = requests.get(f"{BASE_URL}/api/player/{test_user['id']}/profile")
        assert response.status_code == 200
        
        data = response.json()
        
        assert "country" in data, "country field missing"
        assert "country_flag" in data, "country_flag field missing"

    def test_player_profile_returns_follower_counts(self, test_user):
        """Player profile should return followers_count and following_count"""
        response = requests.get(f"{BASE_URL}/api/player/{test_user['id']}/profile")
        assert response.status_code == 200
        
        data = response.json()
        
        assert "followers_count" in data
        assert "following_count" in data
        assert isinstance(data["followers_count"], int)
        assert isinstance(data["following_count"], int)

    def test_player_profile_returns_is_following(self, test_user, second_user):
        """Player profile should return is_following when viewer_id is provided"""
        response = requests.get(
            f"{BASE_URL}/api/player/{test_user['id']}/profile",
            params={"viewer_id": second_user["id"]}
        )
        assert response.status_code == 200
        
        data = response.json()
        
        assert "is_following" in data, "is_following field missing"
        assert isinstance(data["is_following"], bool)

    def test_player_profile_returns_categories(self, test_user):
        """Player profile should return categories with levels"""
        response = requests.get(f"{BASE_URL}/api/player/{test_user['id']}/profile")
        assert response.status_code == 200
        
        data = response.json()
        categories = data.get("categories", {})
        
        expected_categories = ["series_tv", "geographie", "histoire"]
        for cat in expected_categories:
            assert cat in categories, f"{cat} missing from categories"
            cat_data = categories[cat]
            assert "level" in cat_data
            assert "xp" in cat_data

    def test_player_profile_returns_posts(self, test_user):
        """Player profile should return posts array"""
        response = requests.get(f"{BASE_URL}/api/player/{test_user['id']}/profile")
        assert response.status_code == 200
        
        data = response.json()
        
        assert "posts" in data
        assert isinstance(data["posts"], list)


class TestFollowCountsUpdate:
    """Tests for follower count updates after follow/unfollow"""

    def test_follow_increments_follower_count(self, test_user, second_user):
        """Following a user should increment their followers_count"""
        # Get initial count
        initial_response = requests.get(f"{BASE_URL}/api/player/{test_user['id']}/profile")
        initial_count = initial_response.json().get("followers_count", 0)
        
        # Follow the user
        follow_response = requests.post(
            f"{BASE_URL}/api/player/{test_user['id']}/follow",
            json={"follower_id": second_user["id"]}
        )
        assert follow_response.status_code == 200
        follow_data = follow_response.json()
        
        if follow_data.get("following"):
            # Verify count increased
            new_response = requests.get(f"{BASE_URL}/api/player/{test_user['id']}/profile")
            new_count = new_response.json().get("followers_count", 0)
            
            assert new_count == initial_count + 1, f"Expected followers_count to be {initial_count + 1}, got {new_count}"
            
            # Cleanup: unfollow
            requests.post(
                f"{BASE_URL}/api/player/{test_user['id']}/follow",
                json={"follower_id": second_user["id"]}
            )

    def test_unfollow_decrements_follower_count(self, test_user, second_user):
        """Unfollowing a user should decrement their followers_count"""
        # First follow
        requests.post(
            f"{BASE_URL}/api/player/{test_user['id']}/follow",
            json={"follower_id": second_user["id"]}
        )
        
        # Get count after follow
        after_follow = requests.get(f"{BASE_URL}/api/player/{test_user['id']}/profile")
        count_after_follow = after_follow.json().get("followers_count", 0)
        
        # Unfollow
        unfollow_response = requests.post(
            f"{BASE_URL}/api/player/{test_user['id']}/follow",
            json={"follower_id": second_user["id"]}
        )
        assert unfollow_response.status_code == 200
        
        # Verify count decreased
        after_unfollow = requests.get(f"{BASE_URL}/api/player/{test_user['id']}/profile")
        count_after_unfollow = after_unfollow.json().get("followers_count", 0)
        
        assert count_after_unfollow == count_after_follow - 1


class TestCountryFlag:
    """Tests for country flag functionality"""

    def test_known_country_has_correct_flag(self):
        """Users with known countries should have correct emoji flags"""
        # Create user - country detection depends on IP
        pseudo = random_pseudo("FlagTest_")
        response = requests.post(
            f"{BASE_URL}/api/auth/register-guest",
            json={"pseudo": pseudo}
        )
        assert response.status_code == 200
        
        user_id = response.json()["id"]
        
        # Get profile
        profile_response = requests.get(f"{BASE_URL}/api/profile/{user_id}")
        profile_data = profile_response.json()
        user = profile_data.get("user", {})
        
        country = user.get("country")
        flag = user.get("country_flag")
        
        # If country is detected, flag should be present
        if country:
            assert flag, f"Country {country} detected but no flag returned"
            # Common flags validation
            flag_map = {
                "United States": "🇺🇸",
                "France": "🇫🇷",
                "Germany": "🇩🇪",
                "United Kingdom": "🇬🇧",
            }
            if country in flag_map:
                assert flag == flag_map[country], f"Expected flag {flag_map[country]} for {country}, got {flag}"

    def test_player_profile_default_flag_for_unknown_country(self):
        """Player profile should return default flag for unknown/null country"""
        # Find or create user without country
        pseudo = random_pseudo("NoCountry_")
        response = requests.post(
            f"{BASE_URL}/api/auth/register-guest",
            json={"pseudo": pseudo}
        )
        user_id = response.json()["id"]
        
        # Get player profile
        profile_response = requests.get(f"{BASE_URL}/api/player/{user_id}/profile")
        profile_data = profile_response.json()
        
        # If no country, should have default flag
        if not profile_data.get("country"):
            assert profile_data.get("country_flag") == "🌍", "Default flag should be 🌍 for unknown country"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
