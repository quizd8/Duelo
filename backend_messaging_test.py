#!/usr/bin/env python3
"""
Enhanced Chat/Messaging API Testing for Duelo quiz app.
Tests the enhanced messaging system with message types (text, image, game_card) and extra_data.
"""

import asyncio
import aiohttp
import json
import time
import base64
from typing import Dict, Any, Optional

# Base URL from frontend/.env
BASE_URL = "https://duelo-header-footer.preview.emergentagent.com/api"

class DueloMessagingTester:
    def __init__(self):
        self.session = None
        self.test_user1_id = None
        self.test_user1_pseudo = None
        self.test_user2_id = None
        self.test_user2_pseudo = None
        self.results = {
            "guest_registration": {"status": "pending", "details": None},
            "text_message": {"status": "pending", "details": None},
            "game_card_message": {"status": "pending", "details": None},
            "image_message": {"status": "pending", "details": None},
            "invalid_message_type": {"status": "pending", "details": None},
            "messages_with_types": {"status": "pending", "details": None},
            "conversations_enhanced": {"status": "pending", "details": None}
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
        """Register 2 test users for messaging testing."""
        print("\n=== Testing Guest Registration ===")
        
        timestamp = str(int(time.time()))[-4:]
        
        try:
            # Register first user
            pseudo1 = f"MsgTestUser1_{timestamp}"
            async with self.session.post(f"{BASE_URL}/auth/register-guest", 
                                       json={"pseudo": pseudo1}) as response:
                if response.status == 200:
                    data1 = await response.json()
                    self.test_user1_id = data1.get("id")
                    self.test_user1_pseudo = data1.get("pseudo")
                else:
                    error_data = await response.text()
                    await self.log_result("guest_registration", False, 
                                        f"Failed to register user 1 - HTTP {response.status}: {error_data}")
                    return False

            # Register second user  
            pseudo2 = f"MsgTestUser2_{timestamp}"
            async with self.session.post(f"{BASE_URL}/auth/register-guest", 
                                       json={"pseudo": pseudo2}) as response:
                if response.status == 200:
                    data2 = await response.json()
                    self.test_user2_id = data2.get("id")
                    self.test_user2_pseudo = data2.get("pseudo")
                    
                    await self.log_result("guest_registration", True, 
                                        f"Created 2 test users: {pseudo1} ({self.test_user1_id}), {pseudo2} ({self.test_user2_id})", 
                                        {"user1": data1, "user2": data2})
                    return True
                else:
                    error_data = await response.text()
                    await self.log_result("guest_registration", False, 
                                        f"Failed to register user 2 - HTTP {response.status}: {error_data}")
                    return False
                    
        except Exception as e:
            await self.log_result("guest_registration", False, f"Exception: {str(e)}")
            return False

    async def test_text_message(self):
        """Test POST /api/chat/send with message_type='text'."""
        print("\n=== Testing Text Message ===")
        
        if not self.test_user1_id or not self.test_user2_id:
            await self.log_result("text_message", False, "Test users needed")
            return False
        
        try:
            message_data = {
                "sender_id": self.test_user1_id,
                "receiver_id": self.test_user2_id,
                "content": "Hello! This is a test text message.",
                "message_type": "text"
            }
            
            async with self.session.post(f"{BASE_URL}/chat/send", json=message_data) as response:
                if response.status == 200:
                    data = await response.json()
                    
                    # Validate response structure
                    required_fields = ["id", "sender_id", "receiver_id", "sender_pseudo", 
                                     "content", "message_type", "extra_data", "read", "created_at"]
                    missing_fields = [field for field in required_fields if field not in data]
                    
                    if missing_fields:
                        await self.log_result("text_message", False, 
                                            f"Missing fields: {missing_fields}", data)
                        return False
                    
                    # Validate text message specifics
                    if data.get("message_type") != "text":
                        await self.log_result("text_message", False, 
                                            f"Expected message_type='text', got '{data.get('message_type')}'", data)
                        return False
                    
                    if data.get("extra_data") is not None:
                        await self.log_result("text_message", False, 
                                            f"Text message should have extra_data=null, got {data.get('extra_data')}", data)
                        return False
                    
                    if data.get("content") != message_data["content"]:
                        await self.log_result("text_message", False, 
                                            f"Content mismatch: expected '{message_data['content']}', got '{data.get('content')}'", data)
                        return False
                    
                    await self.log_result("text_message", True, 
                                        "Text message sent successfully with correct message_type and extra_data=null", data)
                    return True
                    
                else:
                    error_data = await response.text()
                    await self.log_result("text_message", False, 
                                        f"HTTP {response.status}: {error_data}")
                    return False
                    
        except Exception as e:
            await self.log_result("text_message", False, f"Exception: {str(e)}")
            return False

    async def test_game_card_message(self):
        """Test POST /api/chat/send with message_type='game_card' and extra_data."""
        print("\n=== Testing Game Card Message ===")
        
        if not self.test_user1_id or not self.test_user2_id:
            await self.log_result("game_card_message", False, "Test users needed")
            return False
        
        try:
            game_card_data = {
                "category": "series_tv",
                "winner_id": self.test_user1_id,
                "sender_score": 8,
                "receiver_score": 5,
                "xp_gained": 120
            }
            
            message_data = {
                "sender_id": self.test_user1_id,
                "receiver_id": self.test_user2_id,
                "content": "Match result",
                "message_type": "game_card",
                "extra_data": game_card_data
            }
            
            async with self.session.post(f"{BASE_URL}/chat/send", json=message_data) as response:
                if response.status == 200:
                    data = await response.json()
                    
                    # Validate message_type
                    if data.get("message_type") != "game_card":
                        await self.log_result("game_card_message", False, 
                                            f"Expected message_type='game_card', got '{data.get('message_type')}'", data)
                        return False
                    
                    # Validate extra_data structure
                    extra_data = data.get("extra_data")
                    if not extra_data or not isinstance(extra_data, dict):
                        await self.log_result("game_card_message", False, 
                                            f"Game card should have extra_data object, got {extra_data}", data)
                        return False
                    
                    # Check all game card fields
                    required_game_fields = ["category", "winner_id", "sender_score", "receiver_score", "xp_gained"]
                    missing_game_fields = [field for field in required_game_fields if field not in extra_data]
                    
                    if missing_game_fields:
                        await self.log_result("game_card_message", False, 
                                            f"Game card missing fields: {missing_game_fields}", data)
                        return False
                    
                    # Validate field values
                    if extra_data.get("category") != game_card_data["category"]:
                        await self.log_result("game_card_message", False, 
                                            f"Category mismatch: expected {game_card_data['category']}, got {extra_data.get('category')}", data)
                        return False
                    
                    if extra_data.get("sender_score") != game_card_data["sender_score"]:
                        await self.log_result("game_card_message", False, 
                                            f"Sender score mismatch: expected {game_card_data['sender_score']}, got {extra_data.get('sender_score')}", data)
                        return False
                    
                    await self.log_result("game_card_message", True, 
                                        f"Game card message sent with all required fields: {list(extra_data.keys())}", data)
                    return True
                    
                else:
                    error_data = await response.text()
                    await self.log_result("game_card_message", False, 
                                        f"HTTP {response.status}: {error_data}")
                    return False
                    
        except Exception as e:
            await self.log_result("game_card_message", False, f"Exception: {str(e)}")
            return False

    async def test_image_message(self):
        """Test POST /api/chat/send with message_type='image' and extra_data."""
        print("\n=== Testing Image Message ===")
        
        if not self.test_user1_id or not self.test_user2_id:
            await self.log_result("image_message", False, "Test users needed")
            return False
        
        try:
            # Create fake base64 image data
            fake_image_data = base64.b64encode(b"fake_image_content_for_testing").decode('utf-8')
            
            image_data = {
                "image_base64": fake_image_data
            }
            
            message_data = {
                "sender_id": self.test_user1_id,
                "receiver_id": self.test_user2_id,
                "content": "Image",
                "message_type": "image",
                "extra_data": image_data
            }
            
            async with self.session.post(f"{BASE_URL}/chat/send", json=message_data) as response:
                if response.status == 200:
                    data = await response.json()
                    
                    # Validate message_type
                    if data.get("message_type") != "image":
                        await self.log_result("image_message", False, 
                                            f"Expected message_type='image', got '{data.get('message_type')}'", data)
                        return False
                    
                    # Validate extra_data structure
                    extra_data = data.get("extra_data")
                    if not extra_data or not isinstance(extra_data, dict):
                        await self.log_result("image_message", False, 
                                            f"Image message should have extra_data object, got {extra_data}", data)
                        return False
                    
                    # Check image_base64 field
                    if "image_base64" not in extra_data:
                        await self.log_result("image_message", False, 
                                            f"Image message missing image_base64 field in extra_data", data)
                        return False
                    
                    if extra_data.get("image_base64") != fake_image_data:
                        await self.log_result("image_message", False, 
                                            f"Image data mismatch", data)
                        return False
                    
                    await self.log_result("image_message", True, 
                                        f"Image message sent with image_base64 data (length: {len(fake_image_data)})", data)
                    return True
                    
                else:
                    error_data = await response.text()
                    await self.log_result("image_message", False, 
                                        f"HTTP {response.status}: {error_data}")
                    return False
                    
        except Exception as e:
            await self.log_result("image_message", False, f"Exception: {str(e)}")
            return False

    async def test_invalid_message_type(self):
        """Test POST /api/chat/send with invalid message_type."""
        print("\n=== Testing Invalid Message Type ===")
        
        if not self.test_user1_id or not self.test_user2_id:
            await self.log_result("invalid_message_type", False, "Test users needed")
            return False
        
        try:
            message_data = {
                "sender_id": self.test_user1_id,
                "receiver_id": self.test_user2_id,
                "content": "Test message",
                "message_type": "invalid_type"
            }
            
            async with self.session.post(f"{BASE_URL}/chat/send", json=message_data) as response:
                if response.status == 400:
                    # This is expected - invalid message type should return 400
                    await self.log_result("invalid_message_type", True, 
                                        "Invalid message type properly rejected with 400 error")
                    return True
                elif response.status == 200:
                    data = await response.json()
                    await self.log_result("invalid_message_type", False, 
                                        "Invalid message type should be rejected, but got 200 response", data)
                    return False
                else:
                    error_data = await response.text()
                    await self.log_result("invalid_message_type", False, 
                                        f"Unexpected HTTP {response.status}: {error_data}")
                    return False
                    
        except Exception as e:
            await self.log_result("invalid_message_type", False, f"Exception: {str(e)}")
            return False

    async def test_messages_with_types(self):
        """Test GET /api/chat/{user_id}/messages?with_user=Y to verify message_type and extra_data fields."""
        print("\n=== Testing Messages with Types ===")
        
        if not self.test_user1_id or not self.test_user2_id:
            await self.log_result("messages_with_types", False, "Test users needed")
            return False
        
        try:
            async with self.session.get(f"{BASE_URL}/chat/{self.test_user2_id}/messages?with_user={self.test_user1_id}") as response:
                if response.status == 200:
                    messages = await response.json()
                    
                    if not isinstance(messages, list):
                        await self.log_result("messages_with_types", False, 
                                            "Messages should be an array", messages)
                        return False
                    
                    if len(messages) == 0:
                        await self.log_result("messages_with_types", False, 
                                            "No messages found - should have text, game_card, and image messages from previous tests")
                        return False
                    
                    # Look for different message types
                    found_types = set()
                    text_msg = None
                    game_card_msg = None
                    image_msg = None
                    
                    for msg in messages:
                        # Validate required fields
                        required_fields = ["id", "sender_id", "receiver_id", "content", 
                                         "message_type", "extra_data", "read", "created_at"]
                        missing_fields = [field for field in required_fields if field not in msg]
                        
                        if missing_fields:
                            await self.log_result("messages_with_types", False, 
                                                f"Message missing fields: {missing_fields}", msg)
                            return False
                        
                        msg_type = msg.get("message_type")
                        found_types.add(msg_type)
                        
                        if msg_type == "text":
                            text_msg = msg
                            if msg.get("extra_data") is not None:
                                await self.log_result("messages_with_types", False, 
                                                    f"Text message should have extra_data=null", msg)
                                return False
                        elif msg_type == "game_card":
                            game_card_msg = msg
                            if not msg.get("extra_data") or not isinstance(msg.get("extra_data"), dict):
                                await self.log_result("messages_with_types", False, 
                                                    f"Game card message should have extra_data object", msg)
                                return False
                        elif msg_type == "image":
                            image_msg = msg
                            if not msg.get("extra_data") or "image_base64" not in msg.get("extra_data"):
                                await self.log_result("messages_with_types", False, 
                                                    f"Image message should have extra_data with image_base64", msg)
                                return False
                    
                    await self.log_result("messages_with_types", True, 
                                        f"Messages retrieved with correct types: {list(found_types)}, total messages: {len(messages)}")
                    return True
                    
                else:
                    error_data = await response.text()
                    await self.log_result("messages_with_types", False, 
                                        f"HTTP {response.status}: {error_data}")
                    return False
                    
        except Exception as e:
            await self.log_result("messages_with_types", False, f"Exception: {str(e)}")
            return False

    async def test_conversations_enhanced(self):
        """Test GET /api/chat/conversations/{user_id} for enhanced preview with last_message_type."""
        print("\n=== Testing Enhanced Conversations ===")
        
        if not self.test_user1_id or not self.test_user2_id:
            await self.log_result("conversations_enhanced", False, "Test users needed")
            return False
        
        try:
            async with self.session.get(f"{BASE_URL}/chat/conversations/{self.test_user2_id}") as response:
                if response.status == 200:
                    conversations = await response.json()
                    
                    if not isinstance(conversations, list):
                        await self.log_result("conversations_enhanced", False, 
                                            "Conversations should be an array", conversations)
                        return False
                    
                    if len(conversations) == 0:
                        await self.log_result("conversations_enhanced", False, 
                                            "No conversations found - should have conversation with user1")
                        return False
                    
                    # Find conversation with user1
                    user1_conversation = None
                    for conv in conversations:
                        if conv.get("partner_id") == self.test_user1_id:
                            user1_conversation = conv
                            break
                    
                    if not user1_conversation:
                        await self.log_result("conversations_enhanced", False, 
                                            f"Conversation with user1 ({self.test_user1_id}) not found", conversations)
                        return False
                    
                    # Validate enhanced fields
                    required_fields = ["partner_id", "partner_pseudo", "partner_avatar_seed", 
                                     "last_message", "last_message_type", "last_message_time", 
                                     "is_sender", "unread_count"]
                    missing_fields = [field for field in required_fields if field not in user1_conversation]
                    
                    if missing_fields:
                        await self.log_result("conversations_enhanced", False, 
                                            f"Conversation missing fields: {missing_fields}", user1_conversation)
                        return False
                    
                    last_msg_type = user1_conversation.get("last_message_type")
                    last_msg_preview = user1_conversation.get("last_message")
                    
                    # Check preview text based on message type
                    valid_preview = False
                    if last_msg_type == "image" and last_msg_preview == "📷 Image":
                        valid_preview = True
                    elif last_msg_type == "game_card" and last_msg_preview == "🎮 Résultat de match":
                        valid_preview = True  
                    elif last_msg_type == "text" and last_msg_preview != "📷 Image" and last_msg_preview != "🎮 Résultat de match":
                        valid_preview = True
                    
                    if not valid_preview:
                        await self.log_result("conversations_enhanced", False, 
                                            f"Invalid last message preview for type '{last_msg_type}': '{last_msg_preview}'", user1_conversation)
                        return False
                    
                    await self.log_result("conversations_enhanced", True, 
                                        f"Enhanced conversations working - last_message_type: '{last_msg_type}', preview: '{last_msg_preview}'", user1_conversation)
                    return True
                    
                else:
                    error_data = await response.text()
                    await self.log_result("conversations_enhanced", False, 
                                        f"HTTP {response.status}: {error_data}")
                    return False
                    
        except Exception as e:
            await self.log_result("conversations_enhanced", False, f"Exception: {str(e)}")
            return False

    async def run_all_tests(self):
        """Run all Enhanced Messaging API tests in sequence."""
        print("💬 Starting Duelo Enhanced Messaging API Testing")
        print(f"📡 Base URL: {BASE_URL}")
        print("🎯 Testing: Enhanced chat with message types (text, image, game_card)")
        print("=" * 70)
        
        # Run tests in sequence
        tests = [
            ("Guest Registration", self.test_guest_registration),
            ("Text Message", self.test_text_message),
            ("Game Card Message", self.test_game_card_message),
            ("Image Message", self.test_image_message),
            ("Invalid Message Type", self.test_invalid_message_type),
            ("Messages with Types", self.test_messages_with_types),
            ("Enhanced Conversations", self.test_conversations_enhanced),
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
        print("🏁 ENHANCED MESSAGING TEST SUMMARY")
        print("=" * 70)
        print(f"✅ Passed: {passed_count}")
        print(f"❌ Failed: {failed_count}")
        print(f"📊 Total: {passed_count + failed_count}")
        
        if self.test_user1_id:
            print(f"👤 Test Users: {self.test_user1_pseudo}, {self.test_user2_pseudo}")
            print(f"🆔 User IDs: {self.test_user1_id}, {self.test_user2_id}")
        
        return self.results

async def main():
    """Main test execution."""
    async with DueloMessagingTester() as tester:
        results = await tester.run_all_tests()
        return results

if __name__ == "__main__":
    asyncio.run(main())