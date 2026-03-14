#!/usr/bin/env python3
"""
Full flow test as specified in the review request.
Tests the exact flow: register guest -> matchmaking -> submit match -> profile -> select title.
"""

import asyncio
import aiohttp
import json
import time

# Base URL from frontend/.env
BASE_URL = "https://duelo-matchmake.preview.emergentagent.com/api"

async def full_flow_test():
    """Run the complete test flow as specified in review request."""
    print("🎯 Running Full Flow Test - Review Request Specification")
    print(f"📡 Base URL: {BASE_URL}")
    print("=" * 60)
    
    async with aiohttp.ClientSession() as session:
        
        # Step 1: Register a guest user
        print("\n1️⃣  Registering guest user...")
        timestamp = str(int(time.time()))[-6:]
        pseudo = "BackendTestUser"  # As specified in review request
        
        async with session.post(f"{BASE_URL}/auth/register-guest", json={"pseudo": pseudo}) as response:
            if response.status == 200:
                user_data = await response.json()
                user_id = user_data["id"]
                print(f"✅ Guest user registered: {pseudo} (ID: {user_id})")
            else:
                # Try with unique pseudo if BackendTestUser is taken
                pseudo = f"BackendTestUser_{timestamp}"
                async with session.post(f"{BASE_URL}/auth/register-guest", json={"pseudo": pseudo}) as retry_response:
                    if retry_response.status == 200:
                        user_data = await retry_response.json()
                        user_id = user_data["id"]
                        print(f"✅ Guest user registered: {pseudo} (ID: {user_id})")
                    else:
                        error = await retry_response.text()
                        print(f"❌ Failed to register user: {error}")
                        return
        
        # Step 2: Test matchmaking with that user
        print("\n2️⃣  Testing matchmaking with category and player_id...")
        matchmaking_payload = {
            "category": "series_tv",
            "player_id": user_id
        }
        
        async with session.post(f"{BASE_URL}/game/matchmaking", json=matchmaking_payload) as response:
            if response.status == 200:
                match_data = await response.json()
                player = match_data.get("player", {})
                opponent = match_data.get("opponent", {})
                print(f"✅ Matchmaking successful:")
                print(f"   Player: Level {player['level']}, Title '{player['title']}'")
                print(f"   Opponent: {opponent['pseudo']} - Level {opponent['level']}, Title '{opponent['title']}', Streak {opponent['streak']}")
                
                # Verify structure
                if "level" in player and "title" in player and "level" in opponent and "title" in opponent:
                    print("✅ Both player and opponent have level and title data")
                else:
                    print("❌ Missing level/title data in matchmaking response")
                    print(f"   Player data: {player}")
                    print(f"   Opponent data: {opponent}")
            else:
                error = await response.text()
                print(f"❌ Matchmaking failed: {error}")
                return
        
        # Step 3: Submit a match to earn XP  
        print("\n3️⃣  Submitting match to earn XP...")
        match_payload = {
            "player_id": user_id,
            "category": "series_tv",
            "player_score": 140,  # High score
            "opponent_score": 100,
            "opponent_pseudo": opponent["pseudo"],
            "opponent_is_bot": True,
            "correct_count": 7,
            "opponent_level": opponent["level"]
        }
        
        async with session.post(f"{BASE_URL}/game/submit", json=match_payload) as response:
            if response.status == 200:
                match_result = await response.json()
                xp_earned = match_result.get("xp_earned", 0)
                new_title = match_result.get("new_title")
                new_level = match_result.get("new_level")
                
                print(f"✅ Match submitted successfully:")
                print(f"   XP earned: {xp_earned}")
                
                if new_title:
                    print(f"   🏆 New title unlocked: '{new_title['title']}' at level {new_title['level']}")
                else:
                    print(f"   No new title unlocked (current match)")
                    
                if new_level:
                    print(f"   📈 New level reached: {new_level}")
                    
                # Verify XP breakdown
                breakdown = match_result.get("xp_breakdown", {})
                print(f"   XP Breakdown: Base {breakdown.get('base')}, Victory {breakdown.get('victory')}, Perfection {breakdown.get('perfection')}")
            else:
                error = await response.text()
                print(f"❌ Match submit failed: {error}")
                return
        
        # Step 4: Check profile for updated category levels
        print("\n4️⃣  Checking profile for updated category data...")
        async with session.get(f"{BASE_URL}/profile/{user_id}") as response:
            if response.status == 200:
                profile_data = await response.json()
                user = profile_data.get("user", {})
                categories = user.get("categories", {})
                all_titles = profile_data.get("all_unlocked_titles", [])
                
                print(f"✅ Profile loaded successfully:")
                
                # Check categories data
                for cat_name, cat_data in categories.items():
                    print(f"   📊 {cat_name}: Level {cat_data['level']}, XP {cat_data['xp']}, Title '{cat_data['title']}'")
                    progress = cat_data.get("xp_progress", {})
                    print(f"      Progress: {progress.get('current', 0)}/{progress.get('needed', 1)} ({progress.get('progress', 0)*100:.1f}%)")
                    print(f"      Unlocked titles: {len(cat_data.get('unlocked_titles', []))}")
                
                print(f"   🏆 Total unlocked titles: {len(all_titles)}")
                print(f"   👤 Selected title: '{user.get('selected_title')}'")
                
                # Verify XP formula
                series_tv = categories.get("series_tv", {})
                xp = series_tv.get("xp", 0)
                level = series_tv.get("level", 1)
                
                # Calculate expected level using formula: 500 + (N-1)^2 * 10
                def calculate_expected_level(xp):
                    level = 1
                    cumulative = 0
                    while level < 50:
                        needed_for_next = 500 + (level - 1) ** 2 * 10
                        if cumulative + needed_for_next > xp:
                            break
                        cumulative += needed_for_next
                        level += 1
                    return level
                
                expected_level = calculate_expected_level(xp)
                if level == expected_level:
                    print(f"✅ Level calculation correct: XP {xp} → Level {level}")
                else:
                    print(f"❌ Level calculation error: XP {xp} should be level {expected_level}, got {level}")
                
            else:
                error = await response.text()
                print(f"❌ Profile fetch failed: {error}")
                return
        
        # Step 5: Select a title
        print("\n5️⃣  Testing title selection...")
        if all_titles:
            # Use first available title (should be "Téléspectateur" at level 1)
            title_to_select = all_titles[0]["title"]
            
            select_payload = {
                "user_id": user_id,
                "title": title_to_select
            }
            
            async with session.post(f"{BASE_URL}/user/select-title", json=select_payload) as response:
                if response.status == 200:
                    select_result = await response.json()
                    print(f"✅ Title selected: '{title_to_select}'")
                    print(f"   Response: {select_result}")
                else:
                    error = await response.text()
                    print(f"❌ Title selection failed: {error}")
                    return
            
            # Step 6: Verify the title appears in profile
            print("\n6️⃣  Verifying title appears in profile...")
            async with session.get(f"{BASE_URL}/profile/{user_id}") as response:
                if response.status == 200:
                    updated_profile = await response.json()
                    selected_title = updated_profile.get("user", {}).get("selected_title")
                    
                    if selected_title == title_to_select:
                        print(f"✅ Title verified in profile: '{selected_title}'")
                    else:
                        print(f"❌ Title not updated in profile. Expected '{title_to_select}', got '{selected_title}'")
                else:
                    error = await response.text()
                    print(f"❌ Profile verification failed: {error}")
        else:
            print("⚠️  No titles available to select")
        
        print("\n🏁 Full Flow Test Complete!")
        print("=" * 60)

if __name__ == "__main__":
    asyncio.run(full_flow_test())