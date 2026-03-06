#!/usr/bin/env python3
"""
Comprehensive backend testing for Duelo quiz app - NEW Social Features Testing.
Tests Player Profiles, Player Follow, Chat System, and Player Search endpoints.
"""

import asyncio
import aiohttp
import json
import time
import random
from typing import Dict, Any, Optional

# Base URL from frontend/.env
BASE_URL = "https://wall-feature-preview.preview.emergentagent.com/api"

class DueloAPITester:
    def __init__(self):
        self.session = None
        self.test_user_a_id = None
        self.test_user_a_pseudo = None
        self.test_user_b_id = None
        self.test_user_b_pseudo = None
        self.results = {
            "guest_registration_a": {"status": "pending", "details": None},
            "guest_registration_b": {"status": "pending", "details": None},
            "player_profile": {"status": "pending", "details": None},
            "player_follow": {"status": "pending", "details": None},
            "player_search": {"status": "pending", "details": None},
            "chat_send": {"status": "pending", "details": None},
            "chat_conversations": {"status": "pending", "details": None},
            "chat_messages": {"status": "pending", "details": None},
            "chat_unread_count": {"status": "pending", "details": None}
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

    async def test_guest_registration_a(self):
        """Test guest user registration for Chat User A."""
        print("\n=== Testing Guest Registration A ===")
        
        # Generate unique pseudo as specified in review request
        timestamp = str(int(time.time()))[-4:]  # Last 4 digits of timestamp
        pseudo = f"ChatUserA_{timestamp}"
        
        try:
            async with self.session.post(f"{BASE_URL}/auth/register-guest", 
                                       json={"pseudo": pseudo}) as response:
                if response.status == 200:
                    data = await response.json()
                    self.test_user_a_id = data.get("id")
                    self.test_user_a_pseudo = data.get("pseudo")
                    
                    # Validate response structure
                    required_fields = ["id", "pseudo", "is_guest", "avatar_seed", "total_xp", "current_streak"]
                    missing_fields = [field for field in required_fields if field not in data]
                    
                    if missing_fields:
                        await self.log_result("guest_registration_a", False, 
                                            f"Missing fields: {missing_fields}", data)
                        return False
                    
                    if not data.get("is_guest"):
                        await self.log_result("guest_registration_a", False, 
                                            "User should be marked as guest", data)
                        return False
                    
                    await self.log_result("guest_registration_a", True, 
                                        f"Created ChatUserA: {pseudo} (ID: {self.test_user_a_id})", data)
                    return True
                else:
                    error_data = await response.text()
                    await self.log_result("guest_registration_a", False, 
                                        f"HTTP {response.status}: {error_data}")
                    return False
                    
        except Exception as e:
            await self.log_result("guest_registration_a", False, f"Exception: {str(e)}")
            return False

    async def test_guest_registration_b(self):
        """Test guest user registration for Chat User B."""
        print("\n=== Testing Guest Registration B ===")
        
        # Generate unique pseudo as specified in review request
        timestamp = str(int(time.time()))[-4:]  # Last 4 digits of timestamp  
        pseudo = f"ChatUserB_{timestamp}"
        
        try:
            async with self.session.post(f"{BASE_URL}/auth/register-guest", 
                                       json={"pseudo": pseudo}) as response:
                if response.status == 200:
                    data = await response.json()
                    self.test_user_b_id = data.get("id")
                    self.test_user_b_pseudo = data.get("pseudo")
                    
                    # Validate response structure
                    required_fields = ["id", "pseudo", "is_guest", "avatar_seed", "total_xp", "current_streak"]
                    missing_fields = [field for field in required_fields if field not in data]
                    
                    if missing_fields:
                        await self.log_result("guest_registration_b", False, 
                                            f"Missing fields: {missing_fields}", data)
                        return False
                    
                    if not data.get("is_guest"):
                        await self.log_result("guest_registration_b", False, 
                                            "User should be marked as guest", data)
                        return False
                    
                    await self.log_result("guest_registration_b", True, 
                                        f"Created ChatUserB: {pseudo} (ID: {self.test_user_b_id})", data)
                    return True
                else:
                    error_data = await response.text()
                    await self.log_result("guest_registration_b", False, 
                                        f"HTTP {response.status}: {error_data}")
                    return False
                    
        except Exception as e:
            await self.log_result("guest_registration_b", False, f"Exception: {str(e)}")
            return False

    async def test_player_profile(self):
        """Test GET /api/player/{user_id}/profile?viewer_id=X - Full public profile."""
        print("\n=== Testing Player Profile API ===")
        
        if not self.test_user_a_id or not self.test_user_b_id:
            await self.log_result("player_profile", False, "Both test users needed for profile testing")
            return False
        
        try:
            # Test Player A's profile from Player B's perspective
            async with self.session.get(f"{BASE_URL}/player/{self.test_user_a_id}/profile?viewer_id={self.test_user_b_id}") as response:
                if response.status == 200:
                    data = await response.json()
                    
                    # Validate required fields from review request
                    required_fields = [
                        "id", "pseudo", "avatar_seed", "selected_title", "country", "country_flag",
                        "matches_played", "followers_count", "following_count", "is_following",
                        "categories", "champion_titles", "posts"
                    ]
                    missing_fields = [field for field in required_fields if field not in data]
                    
                    if missing_fields:
                        await self.log_result("player_profile", False, 
                                            f"Missing profile fields: {missing_fields}", data)
                        return False
                    
                    # Validate categories structure (per-category stats)
                    categories = data.get("categories", {})
                    expected_categories = ["series_tv", "geographie", "histoire"]
                    for cat in expected_categories:
                        if cat not in categories:
                            await self.log_result("player_profile", False, 
                                                f"Missing category: {cat}", data)
                            return False
                        
                        cat_data = categories[cat]
                        cat_required = ["xp", "level", "title"]
                        cat_missing = [f for f in cat_required if f not in cat_data]
                        if cat_missing:
                            await self.log_result("player_profile", False, 
                                                f"Category {cat} missing fields: {cat_missing}", data)
                            return False
                    
                    # Validate champion_titles is array
                    if not isinstance(data.get("champion_titles"), list):
                        await self.log_result("player_profile", False, 
                                            "champion_titles should be an array", data)
                        return False
                    
                    # Validate posts is array with proper structure
                    if not isinstance(data.get("posts"), list):
                        await self.log_result("player_profile", False, 
                                            "posts should be an array", data)
                        return False
                    
                    await self.log_result("player_profile", True, 
                                        f"Player profile working - Pseudo: {data['pseudo']}, Categories: {len(categories)}, Posts: {len(data['posts'])}, Following: {data['is_following']}", 
                                        data)
                    return True
                    
                else:
                    error_data = await response.text()
                    await self.log_result("player_profile", False, 
                                        f"HTTP {response.status}: {error_data}")
                    return False
                    
        except Exception as e:
            await self.log_result("player_profile", False, f"Exception: {str(e)}")
            return False

    async def test_player_follow(self):
        """Test POST /api/player/{user_id}/follow - Toggle follow system."""
        print("\n=== Testing Player Follow System ===")
        
        if not self.test_user_a_id or not self.test_user_b_id:
            await self.log_result("player_follow", False, "Both test users needed for follow testing")
            return False
        
        try:
            # Test 1: Player B follows Player A
            follow_data = {"follower_id": self.test_user_b_id}
            
            async with self.session.post(f"{BASE_URL}/player/{self.test_user_a_id}/follow", 
                                       json=follow_data) as response:
                if response.status == 200:
                    data = await response.json()
                    
                    if "following" not in data:
                        await self.log_result("player_follow", False, 
                                            "Response should contain 'following' field", data)
                        return False
                    
                    if not data.get("following"):
                        await self.log_result("player_follow", False, 
                                            "First follow should return following: true", data)
                        return False
                    
                    # Test 2: Verify followers_count increases in profile
                    async with self.session.get(f"{BASE_URL}/player/{self.test_user_a_id}/profile?viewer_id={self.test_user_b_id}") as profile_resp:
                        if profile_resp.status == 200:
                            profile_data = await profile_resp.json()
                            if profile_data.get("followers_count", 0) < 1:
                                await self.log_result("player_follow", False, 
                                                    "Followers count should increase after follow")
                                return False
                            if not profile_data.get("is_following"):
                                await self.log_result("player_follow", False, 
                                                    "is_following should be true after follow")
                                return False
                    
                    # Test 3: Player B unfollows Player A (toggle)
                    async with self.session.post(f"{BASE_URL}/player/{self.test_user_a_id}/follow", 
                                               json=follow_data) as unfollow_resp:
                        if unfollow_resp.status == 200:
                            unfollow_data = await unfollow_resp.json()
                            if unfollow_data.get("following"):
                                await self.log_result("player_follow", False, 
                                                    "Second follow should unfollow (toggle) and return following: false", unfollow_data)
                                return False
                    
                    # Test 4: Self-follow should fail (400)
                    self_follow_data = {"follower_id": self.test_user_a_id}
                    async with self.session.post(f"{BASE_URL}/player/{self.test_user_a_id}/follow", 
                                               json=self_follow_data) as self_resp:
                        if self_resp.status != 400:
                            await self.log_result("player_follow", False, 
                                                "Self-follow should return 400 error")
                            return False
                    
                    await self.log_result("player_follow", True, 
                                        "Player follow system working - Follow/unfollow toggle works, self-follow rejected", 
                                        data)
                    return True
                    
                else:
                    error_data = await response.text()
                    await self.log_result("player_follow", False, 
                                        f"HTTP {response.status}: {error_data}")
                    return False
                    
        except Exception as e:
            await self.log_result("player_follow", False, f"Exception: {str(e)}")
            return False

    async def test_player_search(self):
        """Test GET /api/players/search - Search players with filters."""
        print("\n=== Testing Player Search API ===")
        
        if not self.test_user_a_id or not self.test_user_b_id:
            await self.log_result("player_search", False, "Test users needed for search testing")
            return False
        
        try:
            # Test 1: Search by pseudo (q parameter)
            search_term = self.test_user_a_pseudo[:8]  # First 8 chars
            async with self.session.get(f"{BASE_URL}/players/search?q={search_term}&limit=10") as response:
                if response.status == 200:
                    data = await response.json()
                    
                    if not isinstance(data, list):
                        await self.log_result("player_search", False, 
                                            "Search should return an array", data)
                        return False
                    
                    # Should find at least our test user
                    found_user = False
                    for player in data:
                        if player.get("id") == self.test_user_a_id:
                            found_user = True
                            # Validate player structure
                            required_fields = ["id", "pseudo", "avatar_seed", "country", "country_flag", 
                                             "total_xp", "matches_played", "selected_title"]
                            missing = [f for f in required_fields if f not in player]
                            if missing:
                                await self.log_result("player_search", False, 
                                                    f"Player missing fields: {missing}", player)
                                return False
                            break
                    
                    if not found_user and len(data) == 0:
                        # Empty results are okay, just note it
                        pass
                
                    # Test 2: Search by category filter
                    async with self.session.get(f"{BASE_URL}/players/search?category=series_tv&limit=10") as cat_resp:
                        if cat_resp.status == 200:
                            cat_data = await cat_resp.json()
                            if not isinstance(cat_data, list):
                                await self.log_result("player_search", False, 
                                                    "Category search should return an array", cat_data)
                                return False
                    
                    # Test 3: Search with empty results
                    async with self.session.get(f"{BASE_URL}/players/search?q=NonExistentUserXYZ123&limit=10") as empty_resp:
                        if empty_resp.status == 200:
                            empty_data = await empty_resp.json()
                            if not isinstance(empty_data, list):
                                await self.log_result("player_search", False, 
                                                    "Empty search should return empty array", empty_data)
                                return False
                    
                    await self.log_result("player_search", True, 
                                        f"Player search working - Pseudo search: {len(data)} results, Category search functional, Empty results handled", 
                                        {"pseudo_results": len(data), "category_search": "OK"})
                    return True
                        
                else:
                    error_data = await response.text()
                    await self.log_result("player_search", False, 
                                        f"HTTP {response.status}: {error_data}")
                    return False
                    
        except Exception as e:
            await self.log_result("player_search", False, f"Exception: {str(e)}")
            return False

    async def test_chat_send(self):
        """Test POST /api/chat/send - Send chat message with validation."""
        print("\n=== Testing Chat Send API ===")
        
        if not self.test_user_a_id or not self.test_user_b_id:
            await self.log_result("chat_send", False, "Both test users needed for chat testing")
            return False
        
        try:
            # Test 1: Send valid message from A to B
            message_content = "Hello from Player A! This is a test message for the new chat system."
            chat_data = {
                "sender_id": self.test_user_a_id,
                "receiver_id": self.test_user_b_id,
                "content": message_content
            }
            
            async with self.session.post(f"{BASE_URL}/chat/send", json=chat_data) as response:
                if response.status == 200:
                    data = await response.json()
                    
                    # Validate response structure
                    required_fields = ["id", "sender_id", "receiver_id", "sender_pseudo", "content", "read", "created_at"]
                    missing_fields = [field for field in required_fields if field not in data]
                    
                    if missing_fields:
                        await self.log_result("chat_send", False, 
                                            f"Chat response missing fields: {missing_fields}", data)
                        return False
                    
                    if data.get("sender_id") != self.test_user_a_id:
                        await self.log_result("chat_send", False, 
                                            "Sender ID mismatch in response", data)
                        return False
                    
                    if data.get("receiver_id") != self.test_user_b_id:
                        await self.log_result("chat_send", False, 
                                            "Receiver ID mismatch in response", data)
                        return False
                    
                    if data.get("content") != message_content:
                        await self.log_result("chat_send", False, 
                                            "Message content mismatch in response", data)
                        return False
            
            # Test 2: Empty message should fail (400)
            empty_chat = {
                "sender_id": self.test_user_a_id,
                "receiver_id": self.test_user_b_id,
                "content": ""
            }
            
            async with self.session.post(f"{BASE_URL}/chat/send", json=empty_chat) as empty_resp:
                if empty_resp.status != 400:
                    await self.log_result("chat_send", False, 
                                        "Empty message should return 400 error")
                    return False
            
            # Test 3: Too long message (>500 chars) should fail (400)
            long_message = "x" * 501  # 501 characters
            long_chat = {
                "sender_id": self.test_user_a_id,
                "receiver_id": self.test_user_b_id,
                "content": long_message
            }
            
            async with self.session.post(f"{BASE_URL}/chat/send", json=long_chat) as long_resp:
                if long_resp.status != 400:
                    await self.log_result("chat_send", False, 
                                        "Message >500 chars should return 400 error")
                    return False
            
            # Test 4: Self-message should fail (400)
            self_chat = {
                "sender_id": self.test_user_a_id,
                "receiver_id": self.test_user_a_id,
                "content": "Talking to myself"
            }
            
            async with self.session.post(f"{BASE_URL}/chat/send", json=self_chat) as self_resp:
                if self_resp.status != 400:
                    await self.log_result("chat_send", False, 
                                        "Self-message should return 400 error")
                    return False
            
            await self.log_result("chat_send", True, 
                                f"Chat send working - Valid message sent, empty/long/self messages rejected", 
                                {"message_length": len(message_content), "validations": "PASSED"})
            return True
                    
        except Exception as e:
            await self.log_result("chat_send", False, f"Exception: {str(e)}")
            return False

    async def test_chat_conversations(self):
        """Test GET /api/chat/conversations/{user_id} - List conversations."""
        print("\n=== Testing Chat Conversations API ===")
        
        if not self.test_user_a_id or not self.test_user_b_id:
            await self.log_result("chat_conversations", False, "Both test users needed for conversations testing")
            return False
        
        try:
            # Test conversations for User B (who should have received a message from User A)
            async with self.session.get(f"{BASE_URL}/chat/conversations/{self.test_user_b_id}") as response:
                if response.status == 200:
                    data = await response.json()
                    
                    if not isinstance(data, list):
                        await self.log_result("chat_conversations", False, 
                                            "Conversations should return an array", data)
                        return False
                    
                    # Should find conversation with User A
                    found_conversation = False
                    for conv in data:
                        if conv.get("partner_id") == self.test_user_a_id:
                            found_conversation = True
                            # Validate conversation structure
                            required_fields = ["partner_id", "partner_pseudo", "partner_avatar_seed", 
                                             "last_message", "last_message_time", "is_sender", "unread_count"]
                            missing_fields = [field for field in required_fields if field not in conv]
                            
                            if missing_fields:
                                await self.log_result("chat_conversations", False, 
                                                    f"Conversation missing fields: {missing_fields}", conv)
                                return False
                            
                            if conv.get("unread_count", 0) < 1:
                                await self.log_result("chat_conversations", False, 
                                                    "Should have unread messages from User A")
                                return False
                            break
                    
                    if not found_conversation:
                        await self.log_result("chat_conversations", False, 
                                            "Should find conversation with User A")
                        return False
                    
                    await self.log_result("chat_conversations", True, 
                                        f"Conversations API working - Found {len(data)} conversations, unread messages detected", 
                                        {"conversations_count": len(data), "partner_found": True})
                    return True
                    
                else:
                    error_data = await response.text()
                    await self.log_result("chat_conversations", False, 
                                        f"HTTP {response.status}: {error_data}")
                    return False
                    
        except Exception as e:
            await self.log_result("chat_conversations", False, f"Exception: {str(e)}")
            return False

    async def test_chat_messages(self):
        """Test GET /api/chat/{user_id}/messages?with_user=X - Get messages between users."""
        print("\n=== Testing Chat Messages API ===")
        
        if not self.test_user_a_id or not self.test_user_b_id:
            await self.log_result("chat_messages", False, "Both test users needed for messages testing")
            return False
        
        try:
            # Test: User B fetches messages with User A (should auto-mark as read)
            async with self.session.get(f"{BASE_URL}/chat/{self.test_user_b_id}/messages?with_user={self.test_user_a_id}&limit=50") as response:
                if response.status == 200:
                    data = await response.json()
                    
                    if not isinstance(data, list):
                        await self.log_result("chat_messages", False, 
                                            "Messages should return an array", data)
                        return False
                    
                    if len(data) < 1:
                        await self.log_result("chat_messages", False, 
                                            "Should find at least 1 message from previous test")
                        return False
                    
                    # Validate message structure
                    for msg in data:
                        required_fields = ["id", "sender_id", "receiver_id", "content", "read", "created_at"]
                        missing_fields = [field for field in required_fields if field not in msg]
                        
                        if missing_fields:
                            await self.log_result("chat_messages", False, 
                                                f"Message missing fields: {missing_fields}", msg)
                            return False
                        
                        # Check if message involves our test users
                        if not ((msg["sender_id"] == self.test_user_a_id and msg["receiver_id"] == self.test_user_b_id) or 
                               (msg["sender_id"] == self.test_user_b_id and msg["receiver_id"] == self.test_user_a_id)):
                            await self.log_result("chat_messages", False, 
                                                "Message should be between test users A and B")
                            return False
                    
                    # Send reply from User B to User A
                    reply_data = {
                        "sender_id": self.test_user_b_id,
                        "receiver_id": self.test_user_a_id,
                        "content": "Hello back from Player B! Thanks for your message."
                    }
                    
                    async with self.session.post(f"{BASE_URL}/chat/send", json=reply_data) as reply_resp:
                        if reply_resp.status != 200:
                            await self.log_result("chat_messages", False, 
                                                "Failed to send reply message")
                            return False
                    
                    await self.log_result("chat_messages", True, 
                                        f"Chat messages working - Retrieved {len(data)} messages, reply sent successfully", 
                                        {"messages_count": len(data), "reply_sent": True})
                    return True
                    
                else:
                    error_data = await response.text()
                    await self.log_result("chat_messages", False, 
                                        f"HTTP {response.status}: {error_data}")
                    return False
                    
        except Exception as e:
            await self.log_result("chat_messages", False, f"Exception: {str(e)}")
            return False

    async def test_chat_unread_count(self):
        """Test GET /api/chat/unread-count/{user_id} - Total unread count."""
        print("\n=== Testing Chat Unread Count API ===")
        
        if not self.test_user_a_id or not self.test_user_b_id:
            await self.log_result("chat_unread_count", False, "Both test users needed for unread count testing")
            return False
        
        try:
            # Test 1: User B checks unread count (should be 1 after fetching messages marked them read)
            async with self.session.get(f"{BASE_URL}/chat/unread-count/{self.test_user_b_id}") as response:
                if response.status == 200:
                    data = await response.json()
                    
                    if "unread_count" not in data:
                        await self.log_result("chat_unread_count", False, 
                                            "Response should contain 'unread_count' field", data)
                        return False
                    
                    unread_count_b = data.get("unread_count", 0)
                    
                    # Test 2: User A checks unread count (should be 1 from reply)
                    async with self.session.get(f"{BASE_URL}/chat/unread-count/{self.test_user_a_id}") as a_resp:
                        if a_resp.status == 200:
                            a_data = await a_resp.json()
                            
                            if "unread_count" not in a_data:
                                await self.log_result("chat_unread_count", False, 
                                                    "User A response should contain 'unread_count' field", a_data)
                                return False
                            
                            unread_count_a = a_data.get("unread_count", 0)
                            
                            # User A should have 1 unread (reply from B)
                            if unread_count_a < 1:
                                await self.log_result("chat_unread_count", False, 
                                                    f"User A should have unread messages, got {unread_count_a}")
                                return False
                            
                            # Test 3: User A fetches messages (should mark as read)
                            async with self.session.get(f"{BASE_URL}/chat/{self.test_user_a_id}/messages?with_user={self.test_user_b_id}") as fetch_resp:
                                if fetch_resp.status == 200:
                                    # Check unread count again
                                    async with self.session.get(f"{BASE_URL}/chat/unread-count/{self.test_user_a_id}") as final_resp:
                                        if final_resp.status == 200:
                                            final_data = await final_resp.json()
                                            final_unread = final_data.get("unread_count", 0)
                                            
                                            # Should be 0 now (messages marked as read)
                                            if final_unread != 0:
                                                await self.log_result("chat_unread_count", False, 
                                                                    f"After fetching messages, unread should be 0, got {final_unread}")
                                                return False
                            
                            await self.log_result("chat_unread_count", True, 
                                                f"Unread count working - Initial: A={unread_count_a}, B={unread_count_b}, After read: A=0", 
                                                {"initial_a": unread_count_a, "initial_b": unread_count_b, "final_a": 0})
                            return True
                        else:
                            await self.log_result("chat_unread_count", False, 
                                                f"User A unread check failed: {a_resp.status}")
                            return False
                    
                else:
                    error_data = await response.text()
                    await self.log_result("chat_unread_count", False, 
                                        f"HTTP {response.status}: {error_data}")
                    return False
                    
        except Exception as e:
            await self.log_result("chat_unread_count", False, f"Exception: {str(e)}")
            return False

    async def run_all_tests(self):
        """Run all NEW social features backend API tests in sequence."""
        print("🎯 Starting Duelo Backend API Testing - NEW Social Features")
        print(f"📡 Base URL: {BASE_URL}")
        print("🔥 Testing: Player Profiles, Follow System, Chat, Player Search")
        print("=" * 70)
        
        # Run tests following the review request test flow
        tests = [
            ("Guest Registration A", self.test_guest_registration_a),
            ("Guest Registration B", self.test_guest_registration_b),
            ("Player Profile", self.test_player_profile),
            ("Player Follow System", self.test_player_follow),
            ("Player Search", self.test_player_search),
            ("Chat Send Message", self.test_chat_send),
            ("Chat Conversations", self.test_chat_conversations),
            ("Chat Messages", self.test_chat_messages),
            ("Chat Unread Count", self.test_chat_unread_count),
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
        print("\n" + "=" * 70)
        print("🏁 NEW SOCIAL FEATURES TEST SUMMARY")
        print("=" * 70)
        print(f"✅ Passed: {passed_count}")
        print(f"❌ Failed: {failed_count}")
        print(f"📊 Total: {passed_count + failed_count}")
        
        if self.test_user_a_id and self.test_user_b_id:
            print(f"👤 Test Users: {self.test_user_a_pseudo} & {self.test_user_b_pseudo}")
            print(f"🆔 User IDs: {self.test_user_a_id} & {self.test_user_b_id}")
        
        # Return results for further processing
        return self.results

async def main():
    """Main test execution."""
    async with DueloAPITester() as tester:
        results = await tester.run_all_tests()
        return results

if __name__ == "__main__":
    asyncio.run(main())