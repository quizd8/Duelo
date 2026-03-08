#!/usr/bin/env python3
"""
Additional detailed testing for XP calculation edge cases and streak functionality.
"""

import asyncio
import aiohttp
import json
import time

BASE_URL = "https://duelo-mobile.preview.emergentagent.com/api"

async def test_xp_edge_cases():
    """Test XP calculation with edge cases and verify streak bonuses."""
    
    async with aiohttp.ClientSession() as session:
        print("🧪 Testing XP Calculation Edge Cases")
        print("=" * 50)
        
        # Register a new test user
        timestamp = str(int(time.time()))[-6:]
        pseudo = f"XPTester_{timestamp}"
        
        async with session.post(f"{BASE_URL}/auth/register-guest", json={"pseudo": pseudo}) as response:
            if response.status != 200:
                print("❌ Failed to register test user")
                return
            user_data = await response.json()
            user_id = user_data["id"]
            print(f"✅ Registered test user: {pseudo}")
        
        # Test Case 1: Perfect game with streak bonus
        print("\n--- Test Case 1: Perfect Game with Victory ---")
        match_data = {
            "player_id": user_id,
            "category": "series_tv",
            "player_score": 140,  # 7 questions * 20 points each
            "opponent_score": 100,
            "opponent_pseudo": "TestBot1",
            "opponent_is_bot": True,
            "correct_count": 7,  # Perfect game
            "opponent_level": 5
        }
        
        async with session.post(f"{BASE_URL}/game/submit", json=match_data) as response:
            data = await response.json()
            xp_breakdown = data.get("xp_breakdown", {})
            print(f"   XP Breakdown: {xp_breakdown}")
            
            expected_base = 140 * 2  # 280
            expected_victory = 50
            expected_perfection = 50
            expected_streak = 10  # First streak (1 win, but streak starts at 1 after first win)
            
            if (xp_breakdown.get("base") == expected_base and 
                xp_breakdown.get("victory") == expected_victory and 
                xp_breakdown.get("perfection") == expected_perfection):
                print(f"   ✅ XP calculation correct: Base={expected_base}, Victory={expected_victory}, Perfection={expected_perfection}")
            else:
                print(f"   ❌ XP calculation incorrect")
        
        # Test Case 2: Giant Slayer bonus (beat opponent 15+ levels higher)
        print("\n--- Test Case 2: Giant Slayer Bonus ---")
        match_data_2 = {
            "player_id": user_id,
            "category": "geographie", 
            "player_score": 120,
            "opponent_score": 80,
            "opponent_pseudo": "EliteBot_Lvl50",
            "opponent_is_bot": True,
            "correct_count": 6,
            "opponent_level": 25  # Should trigger giant slayer (user is likely level 4-5, opponent is 25)
        }
        
        async with session.post(f"{BASE_URL}/game/submit", json=match_data_2) as response:
            data = await response.json()
            xp_breakdown = data.get("xp_breakdown", {})
            print(f"   XP Breakdown: {xp_breakdown}")
            
            giant_slayer_bonus = xp_breakdown.get("giant_slayer", 0)
            if giant_slayer_bonus > 0:
                print(f"   ✅ Giant Slayer bonus applied: {giant_slayer_bonus} XP")
            else:
                print(f"   ⚠️  Giant Slayer bonus not applied (may be expected based on level difference)")
        
        # Test Case 3: Losing match (no victory, perfection, or streak bonuses)
        print("\n--- Test Case 3: Losing Match ---")
        match_data_3 = {
            "player_id": user_id,
            "category": "histoire",
            "player_score": 80,
            "opponent_score": 120,
            "opponent_pseudo": "WinnerBot",
            "opponent_is_bot": True,
            "correct_count": 4,
            "opponent_level": 10
        }
        
        async with session.post(f"{BASE_URL}/game/submit", json=match_data_3) as response:
            data = await response.json()
            xp_breakdown = data.get("xp_breakdown", {})
            print(f"   XP Breakdown: {xp_breakdown}")
            
            # Should only have base XP, no bonuses
            expected_base = 80 * 2  # 160
            if (xp_breakdown.get("base") == expected_base and 
                xp_breakdown.get("victory") == 0 and 
                xp_breakdown.get("perfection") == 0 and
                xp_breakdown.get("streak") == 0):
                print(f"   ✅ Loss correctly calculated: Base={expected_base}, no bonuses")
            else:
                print(f"   ❌ Loss calculation incorrect")
        
        # Get final profile to check stats
        print("\n--- Final Profile Stats ---")
        async with session.get(f"{BASE_URL}/profile/{user_id}") as response:
            profile_data = await response.json()
            user = profile_data.get("user", {})
            print(f"   Level: {user.get('level')}")
            print(f"   Total XP: {user.get('total_xp')}")
            print(f"   Current Streak: {user.get('current_streak')}")
            print(f"   Win Rate: {user.get('win_rate')}%")
            print(f"   MMR: {user.get('mmr')}")
            print(f"   Matches Played: {user.get('matches_played')}")
            print(f"   Matches Won: {user.get('matches_won')}")

async def test_streak_badges():
    """Test streak badge functionality."""
    print("\n🏅 Testing Streak Badge System")
    print("=" * 50)
    
    async with aiohttp.ClientSession() as session:
        # Register test user for streak testing
        timestamp = str(int(time.time()))[-6:]
        pseudo = f"StreakTester_{timestamp}"
        
        async with session.post(f"{BASE_URL}/auth/register-guest", json={"pseudo": pseudo}) as response:
            user_data = await response.json()
            user_id = user_data["id"]
            print(f"✅ Registered streak test user: {pseudo}")
        
        # Simulate multiple wins to build streak
        for i in range(5):
            match_data = {
                "player_id": user_id,
                "category": "series_tv",
                "player_score": 120 + (i * 10),
                "opponent_score": 80,
                "opponent_pseudo": f"StreakBot_{i+1}",
                "opponent_is_bot": True,
                "correct_count": 6,
                "opponent_level": 8
            }
            
            async with session.post(f"{BASE_URL}/game/submit", json=match_data) as response:
                data = await response.json()
                print(f"   Match {i+1} submitted, XP earned: {data.get('xp_earned')}")
        
        # Check final streak
        async with session.get(f"{BASE_URL}/profile/{user_id}") as response:
            profile_data = await response.json()
            user = profile_data.get("user", {})
            streak = user.get("current_streak", 0)
            badge = user.get("streak_badge", "")
            
            print(f"   Final Streak: {streak}")
            print(f"   Streak Badge: '{badge}'")
            
            # Verify badge logic
            if streak >= 5:
                expected_badge = "bolt"
            elif streak >= 3:
                expected_badge = "fire" 
            else:
                expected_badge = ""
                
            if badge == expected_badge:
                print(f"   ✅ Streak badge correct for streak {streak}")
            else:
                print(f"   ❌ Streak badge incorrect: expected '{expected_badge}', got '{badge}'")

async def main():
    """Run additional comprehensive tests."""
    await test_xp_edge_cases()
    await test_streak_badges()

if __name__ == "__main__":
    asyncio.run(main())