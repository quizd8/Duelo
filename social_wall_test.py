#!/usr/bin/env python3
"""
Comprehensive social wall backend testing for Duelo quiz app.
Tests all social wall endpoints including category detail, follow/unfollow, leaderboard,
wall posts, likes, comments as specified in the review request.
"""

import asyncio
import aiohttp
import json
import time
import random
from typing import Dict, Any, Optional

# Base URL from frontend/.env
BASE_URL = "https://swipe-quiz-battle.preview.emergentagent.com/api"

class SocialWallTester:
    def __init__(self):
        self.session = None
        self.test_user_id = None
        self.test_user_pseudo = None
        self.test_post_id = None
        self.results = {
            "guest_registration": {"status": "pending", "details": None},
            "category_detail": {"status": "pending", "details": None},
            "follow_toggle": {"status": "pending", "details": None},
            "category_leaderboard": {"status": "pending", "details": None},
            "wall_posts_create": {"status": "pending", "details": None},
            "wall_posts_get": {"status": "pending", "details": None},
            "like_toggle": {"status": "pending", "details": None},
            "comment_create": {"status": "pending", "details": None},
            "comments_get": {"status": "pending", "details": None},
            "invalid_cases": {"status": "pending", "details": None}
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

    async def register_test_user(self):
        """Register a new test user for social wall testing."""
        print("\n=== Registering Test User ===")
        
        # Generate unique pseudo with SocialTest_ prefix as requested (keep under 20 chars)
        timestamp = str(int(time.time()))[-4:]
        random_suffix = random.randint(10, 99)
        pseudo = f"SocTest_{timestamp}_{random_suffix}"
        
        try:
            async with self.session.post(f"{BASE_URL}/auth/register-guest", 
                                       json={"pseudo": pseudo}) as response:
                if response.status == 200:
                    data = await response.json()
                    self.test_user_id = data.get("id")
                    self.test_user_pseudo = data.get("pseudo")
                    
                    await self.log_result("guest_registration", True, 
                                        f"Created test user: {pseudo} (ID: {self.test_user_id})", data)
                    return True
                else:
                    error_data = await response.text()
                    await self.log_result("guest_registration", False, 
                                        f"HTTP {response.status}: {error_data}")
                    return False
                    
        except Exception as e:
            await self.log_result("guest_registration", False, f"Exception: {str(e)}")
            return False

    async def test_category_detail(self):
        """Test GET /api/category/{id}/detail?user_id=X with multiple categories."""
        print("\n=== Testing Category Detail API ===")
        
        if not self.test_user_id:
            await self.log_result("category_detail", False, "No test user available")
            return False
        
        # Test with all three categories as requested
        categories = ["series_tv", "geographie", "histoire"]
        all_success = True
        
        for category in categories:
            try:
                async with self.session.get(f"{BASE_URL}/category/{category}/detail?user_id={self.test_user_id}") as response:
                    if response.status == 200:
                        data = await response.json()
                        
                        # Validate required fields
                        required_fields = [
                            "id", "name", "description", "total_questions", "followers_count",
                            "user_level", "user_title", "user_xp", "xp_progress", 
                            "is_following", "completion_pct"
                        ]
                        missing_fields = [field for field in required_fields if field not in data]
                        
                        if missing_fields:
                            await self.log_result("category_detail", False, 
                                                f"Missing fields in {category}: {missing_fields}", data)
                            all_success = False
                            continue
                        
                        # Validate xp_progress structure
                        xp_progress = data.get("xp_progress", {})
                        if not all(key in xp_progress for key in ["current", "needed", "progress"]):
                            await self.log_result("category_detail", False, 
                                                f"Invalid xp_progress structure in {category}", data)
                            all_success = False
                            continue
                        
                        print(f"  ✅ {category}: Level {data['user_level']} '{data['user_title']}', Following: {data['is_following']}")
                        
                    else:
                        error_data = await response.text()
                        await self.log_result("category_detail", False, 
                                            f"Category {category} failed: HTTP {response.status}: {error_data}")
                        all_success = False
                        
            except Exception as e:
                await self.log_result("category_detail", False, f"Exception for {category}: {str(e)}")
                all_success = False
        
        if all_success:
            await self.log_result("category_detail", True, 
                                "All 3 category details working correctly with user-specific data")
        
        return all_success

    async def test_follow_toggle(self):
        """Test POST /api/category/{id}/follow with toggle functionality."""
        print("\n=== Testing Follow/Unfollow Toggle ===")
        
        if not self.test_user_id:
            await self.log_result("follow_toggle", False, "No test user available")
            return False
        
        category = "series_tv"
        
        try:
            # Get initial followers count
            async with self.session.get(f"{BASE_URL}/category/{category}/detail?user_id={self.test_user_id}") as response:
                if response.status != 200:
                    await self.log_result("follow_toggle", False, "Cannot get initial category state")
                    return False
                
                initial_data = await response.json()
                initial_followers = initial_data.get("followers_count", 0)
                initial_following = initial_data.get("is_following", False)
            
            # Test follow (should increase followers_count)
            follow_data = {"user_id": self.test_user_id}
            async with self.session.post(f"{BASE_URL}/category/{category}/follow", json=follow_data) as response:
                if response.status == 200:
                    data = await response.json()
                    
                    if "following" not in data:
                        await self.log_result("follow_toggle", False, "Follow response missing 'following' field", data)
                        return False
                    
                    expected_following = not initial_following
                    if data.get("following") != expected_following:
                        await self.log_result("follow_toggle", False, 
                                            f"Follow toggle incorrect: expected {expected_following}, got {data.get('following')}", data)
                        return False
                    
                    # Verify followers count changed
                    async with self.session.get(f"{BASE_URL}/category/{category}/detail?user_id={self.test_user_id}") as verify_response:
                        if verify_response.status == 200:
                            verify_data = await verify_response.json()
                            new_followers = verify_data.get("followers_count", 0)
                            
                            expected_change = 1 if expected_following else -1
                            if new_followers != initial_followers + expected_change:
                                await self.log_result("follow_toggle", False, 
                                                    f"Followers count not updated: expected {initial_followers + expected_change}, got {new_followers}")
                                return False
                    
                    # Test toggle again (should reverse the action)
                    async with self.session.post(f"{BASE_URL}/category/{category}/follow", json=follow_data) as toggle_response:
                        if toggle_response.status == 200:
                            toggle_data = await toggle_response.json()
                            
                            if toggle_data.get("following") == data.get("following"):
                                await self.log_result("follow_toggle", False, 
                                                    "Second toggle did not reverse the follow state", toggle_data)
                                return False
                            
                            await self.log_result("follow_toggle", True, 
                                                f"Follow toggle working correctly - toggled from {initial_following} to {data.get('following')} to {toggle_data.get('following')}")
                            return True
                        else:
                            error_data = await toggle_response.text()
                            await self.log_result("follow_toggle", False, 
                                                f"Second toggle failed: HTTP {toggle_response.status}: {error_data}")
                            return False
                    
                else:
                    error_data = await response.text()
                    await self.log_result("follow_toggle", False, 
                                        f"HTTP {response.status}: {error_data}")
                    return False
                    
        except Exception as e:
            await self.log_result("follow_toggle", False, f"Exception: {str(e)}")
            return False

    async def test_category_leaderboard(self):
        """Test GET /api/category/{id}/leaderboard."""
        print("\n=== Testing Category Leaderboard ===")
        
        category = "series_tv"
        
        try:
            async with self.session.get(f"{BASE_URL}/category/{category}/leaderboard") as response:
                if response.status == 200:
                    data = await response.json()
                    
                    if not isinstance(data, list):
                        await self.log_result("category_leaderboard", False, 
                                            "Leaderboard should return a list", data)
                        return False
                    
                    # Validate leaderboard entry structure
                    if data:  # If there are entries
                        first_entry = data[0]
                        required_fields = ["rank", "pseudo", "avatar_seed", "level", "title", "xp"]
                        missing_fields = [field for field in required_fields if field not in first_entry]
                        
                        if missing_fields:
                            await self.log_result("category_leaderboard", False, 
                                                f"Missing leaderboard entry fields: {missing_fields}", data)
                            return False
                        
                        # Validate rank ordering
                        for i, entry in enumerate(data):
                            if entry.get("rank") != i + 1:
                                await self.log_result("category_leaderboard", False, 
                                                    f"Invalid rank ordering at position {i}: expected {i + 1}, got {entry.get('rank')}", data)
                                return False
                    
                    await self.log_result("category_leaderboard", True, 
                                        f"Leaderboard working - returned {len(data)} entries with correct structure")
                    return True
                    
                else:
                    error_data = await response.text()
                    await self.log_result("category_leaderboard", False, 
                                        f"HTTP {response.status}: {error_data}")
                    return False
                    
        except Exception as e:
            await self.log_result("category_leaderboard", False, f"Exception: {str(e)}")
            return False

    async def test_wall_posts_create(self):
        """Test POST /api/category/{id}/wall with text-only and image posts."""
        print("\n=== Testing Wall Post Creation ===")
        
        if not self.test_user_id:
            await self.log_result("wall_posts_create", False, "No test user available")
            return False
        
        category = "series_tv"
        
        try:
            # Test text-only post
            post_data = {
                "user_id": self.test_user_id,
                "content": "This is a test post for the social wall! 🎬 What's your favorite TV series?"
            }
            
            async with self.session.post(f"{BASE_URL}/category/{category}/wall", json=post_data) as response:
                if response.status == 200:
                    data = await response.json()
                    
                    # Validate response structure
                    required_fields = ["id", "user", "content", "likes_count", "comments_count", "is_liked", "created_at"]
                    missing_fields = [field for field in required_fields if field not in data]
                    
                    if missing_fields:
                        await self.log_result("wall_posts_create", False, 
                                            f"Missing fields in post response: {missing_fields}", data)
                        return False
                    
                    # Validate user object
                    user_obj = data.get("user", {})
                    required_user_fields = ["id", "pseudo", "avatar_seed"]
                    missing_user_fields = [field for field in required_user_fields if field not in user_obj]
                    
                    if missing_user_fields:
                        await self.log_result("wall_posts_create", False, 
                                            f"Missing user fields: {missing_user_fields}", data)
                        return False
                    
                    if user_obj.get("pseudo") != self.test_user_pseudo:
                        await self.log_result("wall_posts_create", False, 
                                            f"User pseudo mismatch: expected {self.test_user_pseudo}, got {user_obj.get('pseudo')}")
                        return False
                    
                    # Store post ID for later tests
                    self.test_post_id = data.get("id")
                    
                    await self.log_result("wall_posts_create", True, 
                                        f"Wall post created successfully - ID: {self.test_post_id}, Content: {data.get('content')[:50]}...")
                    return True
                    
                else:
                    error_data = await response.text()
                    await self.log_result("wall_posts_create", False, 
                                        f"HTTP {response.status}: {error_data}")
                    return False
                    
        except Exception as e:
            await self.log_result("wall_posts_create", False, f"Exception: {str(e)}")
            return False

    async def test_wall_posts_get(self):
        """Test GET /api/category/{id}/wall?user_id=X."""
        print("\n=== Testing Get Wall Posts ===")
        
        if not self.test_user_id:
            await self.log_result("wall_posts_get", False, "No test user available")
            return False
        
        category = "series_tv"
        
        try:
            async with self.session.get(f"{BASE_URL}/category/{category}/wall?user_id={self.test_user_id}") as response:
                if response.status == 200:
                    data = await response.json()
                    
                    if not isinstance(data, list):
                        await self.log_result("wall_posts_get", False, 
                                            "Wall posts should return a list", data)
                        return False
                    
                    # Validate post structure if posts exist
                    if data:
                        first_post = data[0]
                        required_fields = ["id", "user", "content", "likes_count", "comments_count", "is_liked", "created_at"]
                        missing_fields = [field for field in required_fields if field not in first_post]
                        
                        if missing_fields:
                            await self.log_result("wall_posts_get", False, 
                                                f"Missing fields in wall post: {missing_fields}", data)
                            return False
                        
                        # Check if our test post is in the results
                        test_post_found = False
                        if self.test_post_id:
                            for post in data:
                                if post.get("id") == self.test_post_id:
                                    test_post_found = True
                                    break
                        
                        await self.log_result("wall_posts_get", True, 
                                            f"Wall posts retrieved - {len(data)} posts, test post found: {test_post_found}")
                    else:
                        await self.log_result("wall_posts_get", True, 
                                            "Wall posts retrieved - empty list (no posts yet)")
                    
                    return True
                    
                else:
                    error_data = await response.text()
                    await self.log_result("wall_posts_get", False, 
                                        f"HTTP {response.status}: {error_data}")
                    return False
                    
        except Exception as e:
            await self.log_result("wall_posts_get", False, f"Exception: {str(e)}")
            return False

    async def test_like_toggle(self):
        """Test POST /api/wall/{post_id}/like with toggle functionality."""
        print("\n=== Testing Like Toggle ===")
        
        if not self.test_user_id or not self.test_post_id:
            await self.log_result("like_toggle", False, "No test user or post available")
            return False
        
        try:
            # Test like (first time)
            like_data = {"user_id": self.test_user_id}
            async with self.session.post(f"{BASE_URL}/wall/{self.test_post_id}/like", json=like_data) as response:
                if response.status == 200:
                    data = await response.json()
                    
                    if "liked" not in data:
                        await self.log_result("like_toggle", False, "Like response missing 'liked' field", data)
                        return False
                    
                    first_like_state = data.get("liked")
                    
                    # Verify likes count in wall posts
                    async with self.session.get(f"{BASE_URL}/category/series_tv/wall?user_id={self.test_user_id}") as wall_response:
                        if wall_response.status == 200:
                            wall_data = await wall_response.json()
                            test_post = None
                            for post in wall_data:
                                if post.get("id") == self.test_post_id:
                                    test_post = post
                                    break
                            
                            if not test_post:
                                await self.log_result("like_toggle", False, "Test post not found in wall")
                                return False
                            
                            expected_likes = 1 if first_like_state else 0
                            if test_post.get("likes_count") != expected_likes:
                                await self.log_result("like_toggle", False, 
                                                    f"Likes count mismatch: expected {expected_likes}, got {test_post.get('likes_count')}")
                                return False
                            
                            if test_post.get("is_liked") != first_like_state:
                                await self.log_result("like_toggle", False, 
                                                    f"is_liked mismatch: expected {first_like_state}, got {test_post.get('is_liked')}")
                                return False
                    
                    # Test unlike (toggle)
                    async with self.session.post(f"{BASE_URL}/wall/{self.test_post_id}/like", json=like_data) as toggle_response:
                        if toggle_response.status == 200:
                            toggle_data = await toggle_response.json()
                            
                            if toggle_data.get("liked") == first_like_state:
                                await self.log_result("like_toggle", False, 
                                                    "Like toggle did not reverse the state", toggle_data)
                                return False
                            
                            await self.log_result("like_toggle", True, 
                                                f"Like toggle working correctly - toggled from {first_like_state} to {toggle_data.get('liked')}")
                            return True
                        else:
                            error_data = await toggle_response.text()
                            await self.log_result("like_toggle", False, 
                                                f"Toggle like failed: HTTP {toggle_response.status}: {error_data}")
                            return False
                    
                else:
                    error_data = await response.text()
                    await self.log_result("like_toggle", False, 
                                        f"HTTP {response.status}: {error_data}")
                    return False
                    
        except Exception as e:
            await self.log_result("like_toggle", False, f"Exception: {str(e)}")
            return False

    async def test_comment_create(self):
        """Test POST /api/wall/{post_id}/comment."""
        print("\n=== Testing Comment Creation ===")
        
        if not self.test_user_id or not self.test_post_id:
            await self.log_result("comment_create", False, "No test user or post available")
            return False
        
        try:
            comment_data = {
                "user_id": self.test_user_id,
                "content": "This is a test comment! Great post about TV series! 📺"
            }
            
            async with self.session.post(f"{BASE_URL}/wall/{self.test_post_id}/comment", json=comment_data) as response:
                if response.status == 200:
                    data = await response.json()
                    
                    # Validate response structure
                    required_fields = ["id", "user", "content", "created_at"]
                    missing_fields = [field for field in required_fields if field not in data]
                    
                    if missing_fields:
                        await self.log_result("comment_create", False, 
                                            f"Missing fields in comment response: {missing_fields}", data)
                        return False
                    
                    # Validate user object
                    user_obj = data.get("user", {})
                    if user_obj.get("pseudo") != self.test_user_pseudo:
                        await self.log_result("comment_create", False, 
                                            f"Comment user pseudo mismatch: expected {self.test_user_pseudo}, got {user_obj.get('pseudo')}")
                        return False
                    
                    if data.get("content") != comment_data["content"]:
                        await self.log_result("comment_create", False, 
                                            f"Comment content mismatch: expected {comment_data['content']}, got {data.get('content')}")
                        return False
                    
                    await self.log_result("comment_create", True, 
                                        f"Comment created successfully - ID: {data.get('id')}, Content: {data.get('content')[:50]}...")
                    return True
                    
                else:
                    error_data = await response.text()
                    await self.log_result("comment_create", False, 
                                        f"HTTP {response.status}: {error_data}")
                    return False
                    
        except Exception as e:
            await self.log_result("comment_create", False, f"Exception: {str(e)}")
            return False

    async def test_comments_get(self):
        """Test GET /api/wall/{post_id}/comments."""
        print("\n=== Testing Get Comments ===")
        
        if not self.test_post_id:
            await self.log_result("comments_get", False, "No test post available")
            return False
        
        try:
            async with self.session.get(f"{BASE_URL}/wall/{self.test_post_id}/comments") as response:
                if response.status == 200:
                    data = await response.json()
                    
                    if not isinstance(data, list):
                        await self.log_result("comments_get", False, 
                                            "Comments should return a list", data)
                        return False
                    
                    # Validate comment structure if comments exist
                    if data:
                        first_comment = data[0]
                        required_fields = ["id", "user", "content", "created_at"]
                        missing_fields = [field for field in required_fields if field not in first_comment]
                        
                        if missing_fields:
                            await self.log_result("comments_get", False, 
                                                f"Missing fields in comment: {missing_fields}", data)
                            return False
                        
                        await self.log_result("comments_get", True, 
                                            f"Comments retrieved - {len(data)} comments with correct structure")
                    else:
                        await self.log_result("comments_get", True, 
                                            "Comments retrieved - empty list (no comments yet)")
                    
                    return True
                    
                else:
                    error_data = await response.text()
                    await self.log_result("comments_get", False, 
                                        f"HTTP {response.status}: {error_data}")
                    return False
                    
        except Exception as e:
            await self.log_result("comments_get", False, f"Exception: {str(e)}")
            return False

    async def test_invalid_cases(self):
        """Test invalid cases: empty post content, empty comment, invalid category."""
        print("\n=== Testing Invalid Cases ===")
        
        if not self.test_user_id:
            await self.log_result("invalid_cases", False, "No test user available")
            return False
        
        all_success = True
        
        try:
            # Test empty post content (should return 400)
            empty_post_data = {
                "user_id": self.test_user_id,
                "content": ""
            }
            
            async with self.session.post(f"{BASE_URL}/category/series_tv/wall", json=empty_post_data) as response:
                if response.status != 400:
                    await self.log_result("invalid_cases", False, 
                                        f"Empty post content should return 400, got {response.status}")
                    all_success = False
                else:
                    print("  ✅ Empty post content correctly rejected with 400")
            
            # Test empty comment (should return 400)
            if self.test_post_id:
                empty_comment_data = {
                    "user_id": self.test_user_id,
                    "content": ""
                }
                
                async with self.session.post(f"{BASE_URL}/wall/{self.test_post_id}/comment", json=empty_comment_data) as response:
                    if response.status != 400:
                        await self.log_result("invalid_cases", False, 
                                            f"Empty comment should return 400, got {response.status}")
                        all_success = False
                    else:
                        print("  ✅ Empty comment correctly rejected with 400")
            
            # Test invalid category (should return appropriate error)
            async with self.session.get(f"{BASE_URL}/category/invalid_category/detail") as response:
                if response.status == 200:
                    await self.log_result("invalid_cases", False, 
                                        "Invalid category should not return 200")
                    all_success = False
                else:
                    print("  ✅ Invalid category correctly rejected")
            
            if all_success:
                await self.log_result("invalid_cases", True, 
                                    "All invalid cases correctly handled with appropriate error responses")
            
            return all_success
                    
        except Exception as e:
            await self.log_result("invalid_cases", False, f"Exception: {str(e)}")
            return False

    async def run_all_tests(self):
        """Run all social wall tests in sequence as specified in review request."""
        print("🎯 Starting Social Wall Backend API Testing")
        print(f"📡 Base URL: {BASE_URL}")
        print("=" * 60)
        
        # Test flow from review request:
        tests = [
            ("Guest Registration", self.register_test_user),
            ("Category Detail", self.test_category_detail),
            ("Follow Toggle", self.test_follow_toggle),
            ("Wall Post Creation", self.test_wall_posts_create),
            ("Like Toggle", self.test_like_toggle),
            ("Comment Creation", self.test_comment_create),
            ("Get Comments", self.test_comments_get),
            ("Get Wall Posts", self.test_wall_posts_get),
            ("Category Leaderboard", self.test_category_leaderboard),
            ("Invalid Cases", self.test_invalid_cases),
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
        print("🏁 SOCIAL WALL TEST SUMMARY")
        print("=" * 60)
        print(f"✅ Passed: {passed_count}")
        print(f"❌ Failed: {failed_count}")
        print(f"📊 Total: {passed_count + failed_count}")
        
        if self.test_user_id:
            print(f"👤 Test User: {self.test_user_pseudo} (ID: {self.test_user_id})")
        
        if self.test_post_id:
            print(f"📝 Test Post: {self.test_post_id}")
        
        # Return results for further processing
        return self.results

async def main():
    """Main test execution."""
    async with SocialWallTester() as tester:
        results = await tester.run_all_tests()
        return results

if __name__ == "__main__":
    asyncio.run(main())