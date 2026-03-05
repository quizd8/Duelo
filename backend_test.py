#!/usr/bin/env python3
"""
Comprehensive backend testing for Duelo quiz app.
Tests all high-priority APIs with XP calculations, profile stats, and leaderboard functionality.
"""

import asyncio
import aiohttp
import json
import time
import random
from typing import Dict, Any, Optional

# Base URL from frontend/.env
BASE_URL = "https://rapid-quiz-42.preview.emergentagent.com/api"

class DueloAPITester:
    def __init__(self):
        self.session = None
        self.test_user_id = None
        self.test_user_pseudo = None
        self.results = {
            "guest_registration": {"status": "pending", "details": None},
            "seed_questions": {"status": "pending", "details": None},
            "matchmaking": {"status": "pending", "details": None},
            "match_submit_xp": {"status": "pending", "details": None},
            "profile_advanced_stats": {"status": "pending", "details": None},
            "leaderboard_seasonal": {"status": "pending", "details": None}
        }

    async def __aenter__(self):
        self.session = aiohttp.ClientSession()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()

    async def log_result(self, test_name: str, success: bool, details: str, data: Any = None):
        """Log test result with detailed information."""
        self.results[test_name] = {
            "status": "passed" if success else "failed",
            "details": details,
            "data": data
        }
        status_icon = "✅" if success else "❌"
        print(f"{status_icon} {test_name}: {details}")
        if data and not success:
            print(f"   Response data: {json.dumps(data, indent=2)}")

    async def test_guest_registration(self):
        """Test guest user registration with unique pseudo."""
        print("\n=== Testing Guest Registration ===")
        
        # Generate unique pseudo
        timestamp = str(int(time.time()))[-6:]  # Last 6 digits of timestamp
        pseudo = f"TestPlayer_{timestamp}"
        
        try:
            async with self.session.post(f"{BASE_URL}/auth/register-guest", 
                                       json={"pseudo": pseudo}) as response:
                if response.status == 200:
                    data = await response.json()
                    self.test_user_id = data.get("id")
                    self.test_user_pseudo = data.get("pseudo")
                    
                    # Validate response structure
                    required_fields = ["id", "pseudo", "is_guest", "avatar_seed", "total_xp", "current_streak"]
                    missing_fields = [field for field in required_fields if field not in data]
                    
                    if missing_fields:
                        await self.log_result("guest_registration", False, 
                                            f"Missing fields: {missing_fields}", data)
                        return False
                    
                    if not data.get("is_guest"):
                        await self.log_result("guest_registration", False, 
                                            "User should be marked as guest", data)
                        return False
                    
                    await self.log_result("guest_registration", True, 
                                        f"Created guest user: {pseudo} (ID: {self.test_user_id})", data)
                    return True
                else:
                    error_data = await response.text()
                    await self.log_result("guest_registration", False, 
                                        f"HTTP {response.status}: {error_data}")
                    return False
                    
        except Exception as e:
            await self.log_result("guest_registration", False, f"Exception: {str(e)}")
            return False

    async def test_seed_questions(self):
        """Seed questions if needed for testing."""
        print("\n=== Testing Question Seeding ===")
        
        try:
            async with self.session.post(f"{BASE_URL}/admin/seed") as response:
                if response.status == 200:
                    data = await response.json()
                    imported_count = data.get("imported", 0)
                    await self.log_result("seed_questions", True, 
                                        f"Seeded {imported_count} questions", data)
                    return True
                else:
                    error_data = await response.text()
                    await self.log_result("seed_questions", False, 
                                        f"HTTP {response.status}: {error_data}")
                    return False
                    
        except Exception as e:
            await self.log_result("seed_questions", False, f"Exception: {str(e)}")
            return False

    async def test_matchmaking_api(self):
        """Test matchmaking API for bot opponent with required fields."""
        print("\n=== Testing Matchmaking API ===")
        
        try:
            async with self.session.post(f"{BASE_URL}/game/matchmaking") as response:
                if response.status == 200:
                    data = await response.json()
                    opponent = data.get("opponent", {})
                    
                    # Validate required fields
                    required_fields = ["pseudo", "avatar_seed", "is_bot", "level", "streak", "streak_badge"]
                    missing_fields = [field for field in required_fields if field not in opponent]
                    
                    if missing_fields:
                        await self.log_result("matchmaking", False, 
                                            f"Missing opponent fields: {missing_fields}", data)
                        return False
                    
                    if not opponent.get("is_bot"):
                        await self.log_result("matchmaking", False, 
                                            "Opponent should be marked as bot", data)
                        return False
                    
                    await self.log_result("matchmaking", True, 
                                        f"Found bot opponent: {opponent['pseudo']} (Level {opponent['level']}, Streak {opponent['streak']})", 
                                        data)
                    return True
                else:
                    error_data = await response.text()
                    await self.log_result("matchmaking", False, 
                                        f"HTTP {response.status}: {error_data}")
                    return False
                    
        except Exception as e:
            await self.log_result("matchmaking", False, f"Exception: {str(e)}")
            return False

    async def test_match_submit_xp_calculation(self):
        """Test match submission with comprehensive XP calculation."""
        print("\n=== Testing Match Submit with XP Calculation ===")
        
        if not self.test_user_id:
            await self.log_result("match_submit_xp", False, "No test user available - registration failed")
            return False
        
        # Test case: Perfect game (7/7 correct) with victory against higher level opponent
        match_data = {
            "player_id": self.test_user_id,
            "category": "series_tv",
            "player_score": 140,  # 7 questions * 20 points
            "opponent_score": 100,  # Bot lost
            "opponent_pseudo": "TestBot_Elite",
            "opponent_is_bot": True,
            "correct_count": 7,  # Perfect game
            "opponent_level": 20  # High level for giant slayer bonus
        }
        
        try:
            async with self.session.post(f"{BASE_URL}/game/submit", json=match_data) as response:
                if response.status == 200:
                    data = await response.json()
                    
                    # Validate response structure
                    required_fields = ["id", "xp_earned", "xp_breakdown", "winner_id"]
                    missing_fields = [field for field in required_fields if field not in data]
                    
                    if missing_fields:
                        await self.log_result("match_submit_xp", False, 
                                            f"Missing fields: {missing_fields}", data)
                        return False
                    
                    # Validate XP breakdown structure
                    xp_breakdown = data.get("xp_breakdown", {})
                    required_xp_fields = ["base", "victory", "perfection", "giant_slayer", "streak", "total"]
                    missing_xp_fields = [field for field in required_xp_fields if field not in xp_breakdown]
                    
                    if missing_xp_fields:
                        await self.log_result("match_submit_xp", False, 
                                            f"Missing XP breakdown fields: {missing_xp_fields}", data)
                        return False
                    
                    # Validate XP calculation logic
                    expected_base = match_data["player_score"] * 2  # 140 * 2 = 280
                    expected_victory = 50  # Won the match
                    expected_perfection = 50  # Perfect 7/7
                    # Giant slayer bonus depends on user's current level vs opponent level
                    
                    actual_base = xp_breakdown.get("base", 0)
                    actual_victory = xp_breakdown.get("victory", 0)
                    actual_perfection = xp_breakdown.get("perfection", 0)
                    actual_total = xp_breakdown.get("total", 0)
                    
                    issues = []
                    if actual_base != expected_base:
                        issues.append(f"Base XP: expected {expected_base}, got {actual_base}")
                    if actual_victory != expected_victory:
                        issues.append(f"Victory XP: expected {expected_victory}, got {actual_victory}")
                    if actual_perfection != expected_perfection:
                        issues.append(f"Perfection XP: expected {expected_perfection}, got {actual_perfection}")
                    
                    # Check that total matches sum of components
                    calculated_total = sum([
                        xp_breakdown.get("base", 0),
                        xp_breakdown.get("victory", 0),
                        xp_breakdown.get("perfection", 0),
                        xp_breakdown.get("giant_slayer", 0),
                        xp_breakdown.get("streak", 0)
                    ])
                    
                    if actual_total != calculated_total:
                        issues.append(f"Total XP calculation error: components sum to {calculated_total}, but total is {actual_total}")
                    
                    if issues:
                        await self.log_result("match_submit_xp", False, 
                                            f"XP calculation issues: {'; '.join(issues)}", data)
                        return False
                    
                    # Check winner assignment
                    if data.get("winner_id") != self.test_user_id:
                        await self.log_result("match_submit_xp", False, 
                                            "Winner ID should match player ID for winning match", data)
                        return False
                    
                    await self.log_result("match_submit_xp", True, 
                                        f"XP calculation correct - Base: {actual_base}, Victory: {actual_victory}, Perfection: {actual_perfection}, Total: {actual_total}", 
                                        data)
                    return True
                    
                else:
                    error_data = await response.text()
                    await self.log_result("match_submit_xp", False, 
                                        f"HTTP {response.status}: {error_data}")
                    return False
                    
        except Exception as e:
            await self.log_result("match_submit_xp", False, f"Exception: {str(e)}")
            return False

    async def test_profile_advanced_stats(self):
        """Test profile API with advanced stats after match submission."""
        print("\n=== Testing Profile API with Advanced Stats ===")
        
        if not self.test_user_id:
            await self.log_result("profile_advanced_stats", False, "No test user available - registration failed")
            return False
        
        try:
            async with self.session.get(f"{BASE_URL}/profile/{self.test_user_id}") as response:
                if response.status == 200:
                    data = await response.json()
                    
                    # Validate user object structure
                    user = data.get("user", {})
                    required_user_fields = ["level", "title", "mmr", "current_streak", "streak_badge", "seasonal_total_xp", "win_rate"]
                    missing_user_fields = [field for field in required_user_fields if field not in user]
                    
                    if missing_user_fields:
                        await self.log_result("profile_advanced_stats", False, 
                                            f"Missing user fields: {missing_user_fields}", data)
                        return False
                    
                    # Validate match history structure
                    match_history = data.get("match_history", [])
                    if not match_history:
                        await self.log_result("profile_advanced_stats", False, 
                                            "No match history found after submitting match", data)
                        return False
                    
                    latest_match = match_history[0]  # Should be most recent
                    required_match_fields = ["xp_earned", "xp_breakdown", "won", "category"]
                    missing_match_fields = [field for field in required_match_fields if field not in latest_match]
                    
                    if missing_match_fields:
                        await self.log_result("profile_advanced_stats", False, 
                                            f"Missing match history fields: {missing_match_fields}", data)
                        return False
                    
                    # Validate data types and ranges
                    validation_issues = []
                    
                    if not isinstance(user.get("level"), int) or user.get("level") < 1:
                        validation_issues.append("Level should be integer >= 1")
                    
                    if not isinstance(user.get("mmr"), (int, float)) or user.get("mmr") < 100:
                        validation_issues.append("MMR should be numeric >= 100")
                    
                    if not isinstance(user.get("win_rate"), (int, float)) or user.get("win_rate") < 0 or user.get("win_rate") > 100:
                        validation_issues.append("Win rate should be 0-100")
                    
                    if not isinstance(user.get("seasonal_total_xp"), int) or user.get("seasonal_total_xp") < 0:
                        validation_issues.append("Seasonal total XP should be non-negative integer")
                    
                    if validation_issues:
                        await self.log_result("profile_advanced_stats", False, 
                                            f"Validation issues: {'; '.join(validation_issues)}", data)
                        return False
                    
                    await self.log_result("profile_advanced_stats", True, 
                                        f"Profile loaded - Level: {user['level']}, MMR: {user['mmr']}, Win Rate: {user['win_rate']}%, Streak: {user['current_streak']} ({user['streak_badge']})", 
                                        data)
                    return True
                    
                else:
                    error_data = await response.text()
                    await self.log_result("profile_advanced_stats", False, 
                                        f"HTTP {response.status}: {error_data}")
                    return False
                    
        except Exception as e:
            await self.log_result("profile_advanced_stats", False, f"Exception: {str(e)}")
            return False

    async def test_leaderboard_seasonal_view(self):
        """Test leaderboard API with both alltime and seasonal views."""
        print("\n=== Testing Leaderboard API with Seasonal View ===")
        
        # Test alltime leaderboard
        try:
            async with self.session.get(f"{BASE_URL}/leaderboard?scope=world&view=alltime&limit=10") as response:
                if response.status == 200:
                    alltime_data = await response.json()
                    
                    if not isinstance(alltime_data, list):
                        await self.log_result("leaderboard_seasonal", False, 
                                            "Alltime leaderboard should return array", alltime_data)
                        return False
                    
                    if alltime_data:
                        entry = alltime_data[0]
                        required_fields = ["pseudo", "avatar_seed", "total_xp", "level", "streak_badge", "rank"]
                        missing_fields = [field for field in required_fields if field not in entry]
                        
                        if missing_fields:
                            await self.log_result("leaderboard_seasonal", False, 
                                                f"Missing alltime leaderboard fields: {missing_fields}", alltime_data)
                            return False
                else:
                    error_data = await response.text()
                    await self.log_result("leaderboard_seasonal", False, 
                                        f"Alltime leaderboard HTTP {response.status}: {error_data}")
                    return False
                    
        except Exception as e:
            await self.log_result("leaderboard_seasonal", False, f"Alltime leaderboard exception: {str(e)}")
            return False
        
        # Test seasonal leaderboard
        try:
            async with self.session.get(f"{BASE_URL}/leaderboard?scope=world&view=seasonal&limit=10") as response:
                if response.status == 200:
                    seasonal_data = await response.json()
                    
                    if not isinstance(seasonal_data, list):
                        await self.log_result("leaderboard_seasonal", False, 
                                            "Seasonal leaderboard should return array", seasonal_data)
                        return False
                    
                    if seasonal_data:
                        entry = seasonal_data[0]
                        required_fields = ["pseudo", "avatar_seed", "total_xp", "level", "streak_badge", "rank"]
                        missing_fields = [field for field in required_fields if field not in entry]
                        
                        if missing_fields:
                            await self.log_result("leaderboard_seasonal", False, 
                                                f"Missing seasonal leaderboard fields: {missing_fields}", seasonal_data)
                            return False
                    
                    await self.log_result("leaderboard_seasonal", True, 
                                        f"Both leaderboard views working - Alltime entries: {len(alltime_data)}, Seasonal entries: {len(seasonal_data)}", 
                                        {"alltime_count": len(alltime_data), "seasonal_count": len(seasonal_data)})
                    return True
                    
                else:
                    error_data = await response.text()
                    await self.log_result("leaderboard_seasonal", False, 
                                        f"Seasonal leaderboard HTTP {response.status}: {error_data}")
                    return False
                    
        except Exception as e:
            await self.log_result("leaderboard_seasonal", False, f"Seasonal leaderboard exception: {str(e)}")
            return False

    async def run_all_tests(self):
        """Run all backend API tests in sequence."""
        print("🎯 Starting Duelo Backend API Testing")
        print(f"📡 Base URL: {BASE_URL}")
        print("=" * 60)
        
        # Run tests in dependency order
        tests = [
            ("Guest Registration", self.test_guest_registration),
            ("Seed Questions", self.test_seed_questions),
            ("Matchmaking API", self.test_matchmaking_api),
            ("Match Submit XP Calculation", self.test_match_submit_xp_calculation),
            ("Profile Advanced Stats", self.test_profile_advanced_stats),
            ("Leaderboard Seasonal View", self.test_leaderboard_seasonal_view),
        ]
        
        passed_count = 0
        failed_count = 0
        
        for test_name, test_func in tests:
            try:
                success = await test_func()
                if success:
                    passed_count += 1
                else:
                    failed_count += 1
            except Exception as e:
                print(f"❌ {test_name}: Unexpected error - {str(e)}")
                failed_count += 1
        
        # Print summary
        print("\n" + "=" * 60)
        print("🏁 TEST SUMMARY")
        print("=" * 60)
        print(f"✅ Passed: {passed_count}")
        print(f"❌ Failed: {failed_count}")
        print(f"📊 Total: {passed_count + failed_count}")
        
        if self.test_user_id:
            print(f"👤 Test User: {self.test_user_pseudo} (ID: {self.test_user_id})")
        
        # Return results for further processing
        return self.results

async def main():
    """Main test execution."""
    async with DueloAPITester() as tester:
        results = await tester.run_all_tests()
        return results

if __name__ == "__main__":
    asyncio.run(main())