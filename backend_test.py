#!/usr/bin/env python3

import asyncio
import httpx
import json
from datetime import datetime

# Backend URL configuration
BACKEND_URL = "https://duelo-mobile.preview.emergentagent.com/api"

class NotificationsTestSuite:
    def __init__(self):
        self.client = httpx.AsyncClient(timeout=30.0)
        self.user1_id = None
        self.user2_id = None
        self.test_results = []
        
    async def log_result(self, test_name, success, details=""):
        """Log test results"""
        status = "✅ PASS" if success else "❌ FAIL"
        result = {
            "test": test_name,
            "status": status,
            "details": details,
            "timestamp": datetime.now().isoformat()
        }
        self.test_results.append(result)
        print(f"{status}: {test_name}")
        if details:
            print(f"  Details: {details}")
        print()

    async def register_guest_user(self, pseudo):
        """Register a guest user and return user ID"""
        try:
            response = await self.client.post(
                f"{BACKEND_URL}/auth/register-guest",
                json={"pseudo": pseudo}
            )
            if response.status_code == 200:
                user_data = response.json()
                return user_data["id"]
            else:
                await self.log_result(f"Register {pseudo}", False, f"Status: {response.status_code}, Response: {response.text}")
                return None
        except Exception as e:
            await self.log_result(f"Register {pseudo}", False, f"Exception: {str(e)}")
            return None

    async def test_1_user_registration(self):
        """Test 1: Register 2 guest users"""
        print("=== Test 1: User Registration ===")
        
        self.user1_id = await self.register_guest_user("notif_user1")
        if self.user1_id:
            await self.log_result("Register user1 (notif_user1)", True, f"User ID: {self.user1_id}")
        
        self.user2_id = await self.register_guest_user("notif_user2")  
        if self.user2_id:
            await self.log_result("Register user2 (notif_user2)", True, f"User ID: {self.user2_id}")

        return self.user1_id and self.user2_id

    async def test_2_empty_notifications(self):
        """Test 2: Check empty notifications initially"""
        print("=== Test 2: Empty Notifications Initially ===")
        
        try:
            # Test notifications list for user1
            response = await self.client.get(f"{BACKEND_URL}/notifications/{self.user1_id}")
            if response.status_code == 200:
                notifications = response.json()
                if len(notifications) == 0:
                    await self.log_result("User1 notifications empty initially", True, "Empty array returned")
                else:
                    await self.log_result("User1 notifications empty initially", False, f"Expected empty, got {len(notifications)} notifications")
            else:
                await self.log_result("User1 notifications empty initially", False, f"Status: {response.status_code}")

            # Test unread count for user1
            response = await self.client.get(f"{BACKEND_URL}/notifications/{self.user1_id}/unread-count")
            if response.status_code == 200:
                count_data = response.json()
                if count_data.get("unread_count") == 0:
                    await self.log_result("User1 unread count initially zero", True, "Unread count: 0")
                else:
                    await self.log_result("User1 unread count initially zero", False, f"Expected 0, got {count_data.get('unread_count')}")
            else:
                await self.log_result("User1 unread count initially zero", False, f"Status: {response.status_code}")
                
        except Exception as e:
            await self.log_result("Empty notifications test", False, f"Exception: {str(e)}")

    async def test_3_follow_notification(self):
        """Test 3: Trigger follow notification"""
        print("=== Test 3: Follow Notification ===")
        
        try:
            # User1 follows User2
            response = await self.client.post(
                f"{BACKEND_URL}/player/{self.user2_id}/follow",
                json={"follower_id": self.user1_id}
            )
            if response.status_code == 200:
                follow_data = response.json()
                if follow_data.get("following"):
                    await self.log_result("User1 follows User2", True, "Follow successful")
                else:
                    await self.log_result("User1 follows User2", False, f"Follow returned: {follow_data}")
            else:
                await self.log_result("User1 follows User2", False, f"Status: {response.status_code}, Response: {response.text}")
                return False

            # Check User2 notifications should have 1 follow notification
            response = await self.client.get(f"{BACKEND_URL}/notifications/{self.user2_id}")
            if response.status_code == 200:
                notifications = response.json()
                follow_notifications = [n for n in notifications if n.get("type") == "follow"]
                if len(follow_notifications) == 1:
                    notif = follow_notifications[0]
                    # Validate notification structure
                    required_fields = ["id", "type", "title", "body", "icon", "data", "actor_id", "actor_pseudo", "actor_avatar_seed", "read", "created_at"]
                    missing_fields = [field for field in required_fields if field not in notif]
                    if not missing_fields:
                        await self.log_result("User2 has follow notification with correct structure", True, f"Notification: {notif['title']} - {notif['body']}")
                        return True
                    else:
                        await self.log_result("User2 follow notification structure", False, f"Missing fields: {missing_fields}")
                else:
                    await self.log_result("User2 has follow notification", False, f"Expected 1 follow notification, got {len(follow_notifications)}")
            else:
                await self.log_result("Get User2 notifications after follow", False, f"Status: {response.status_code}")
                
        except Exception as e:
            await self.log_result("Follow notification test", False, f"Exception: {str(e)}")
            
        return False

    async def test_4_message_notification(self):
        """Test 4: Trigger message notification"""
        print("=== Test 4: Message Notification ===")
        
        try:
            # Send message from User1 to User2
            response = await self.client.post(
                f"{BACKEND_URL}/chat/send",
                json={
                    "sender_id": self.user1_id,
                    "receiver_id": self.user2_id,
                    "content": "Hello!",
                    "message_type": "text"
                }
            )
            if response.status_code == 200:
                message_data = response.json()
                await self.log_result("Send message User1 to User2", True, f"Message ID: {message_data['id']}")
            else:
                await self.log_result("Send message User1 to User2", False, f"Status: {response.status_code}, Response: {response.text}")
                return False

            # Check User2 notifications should now have 2 notifications (follow + message)
            response = await self.client.get(f"{BACKEND_URL}/notifications/{self.user2_id}")
            if response.status_code == 200:
                notifications = response.json()
                message_notifications = [n for n in notifications if n.get("type") == "message"]
                if len(message_notifications) >= 1:
                    await self.log_result("User2 has message notification", True, f"Found {len(message_notifications)} message notification(s)")
                else:
                    await self.log_result("User2 has message notification", False, f"Expected message notification, got {len(message_notifications)}")

                # Check unread count should be 2
                response = await self.client.get(f"{BACKEND_URL}/notifications/{self.user2_id}/unread-count")
                if response.status_code == 200:
                    count_data = response.json()
                    unread_count = count_data.get("unread_count", 0)
                    if unread_count >= 2:
                        await self.log_result("User2 unread count after message", True, f"Unread count: {unread_count}")
                        return True
                    else:
                        await self.log_result("User2 unread count after message", False, f"Expected >=2, got {unread_count}")
                else:
                    await self.log_result("Get User2 unread count", False, f"Status: {response.status_code}")
            else:
                await self.log_result("Get User2 notifications after message", False, f"Status: {response.status_code}")
                
        except Exception as e:
            await self.log_result("Message notification test", False, f"Exception: {str(e)}")
            
        return False

    async def test_5_mark_single_read(self):
        """Test 5: Mark single notification as read"""
        print("=== Test 5: Mark Single Notification as Read ===")
        
        try:
            # Get first notification
            response = await self.client.get(f"{BACKEND_URL}/notifications/{self.user2_id}")
            if response.status_code == 200:
                notifications = response.json()
                if len(notifications) > 0:
                    first_notif = notifications[0]
                    notif_id = first_notif["id"]
                    
                    # Mark as read
                    response = await self.client.post(
                        f"{BACKEND_URL}/notifications/{notif_id}/read",
                        json={"user_id": self.user2_id}
                    )
                    if response.status_code == 200:
                        await self.log_result("Mark single notification as read", True, f"Notification {notif_id} marked as read")
                        
                        # Verify unread count decreased
                        response = await self.client.get(f"{BACKEND_URL}/notifications/{self.user2_id}/unread-count")
                        if response.status_code == 200:
                            count_data = response.json()
                            unread_count = count_data.get("unread_count", 0)
                            await self.log_result("Unread count decreased after mark read", True, f"New unread count: {unread_count}")
                            return True
                        else:
                            await self.log_result("Check unread count after mark read", False, f"Status: {response.status_code}")
                    else:
                        await self.log_result("Mark single notification as read", False, f"Status: {response.status_code}, Response: {response.text}")
                else:
                    await self.log_result("Get notifications for mark read test", False, "No notifications found")
            else:
                await self.log_result("Get notifications for mark read test", False, f"Status: {response.status_code}")
                
        except Exception as e:
            await self.log_result("Mark single read test", False, f"Exception: {str(e)}")
            
        return False

    async def test_6_mark_all_read(self):
        """Test 6: Mark all notifications as read"""
        print("=== Test 6: Mark All Notifications as Read ===")
        
        try:
            # Mark all as read
            response = await self.client.post(
                f"{BACKEND_URL}/notifications/read-all",
                json={"user_id": self.user2_id}
            )
            if response.status_code == 200:
                await self.log_result("Mark all notifications as read", True, "All notifications marked as read")
                
                # Verify unread count is 0
                response = await self.client.get(f"{BACKEND_URL}/notifications/{self.user2_id}/unread-count")
                if response.status_code == 200:
                    count_data = response.json()
                    unread_count = count_data.get("unread_count", 0)
                    if unread_count == 0:
                        await self.log_result("Unread count is zero after mark all read", True, "Unread count: 0")
                        return True
                    else:
                        await self.log_result("Unread count is zero after mark all read", False, f"Expected 0, got {unread_count}")
                else:
                    await self.log_result("Check unread count after mark all read", False, f"Status: {response.status_code}")
            else:
                await self.log_result("Mark all notifications as read", False, f"Status: {response.status_code}, Response: {response.text}")
                
        except Exception as e:
            await self.log_result("Mark all read test", False, f"Exception: {str(e)}")
            
        return False

    async def test_7_notification_settings(self):
        """Test 7: Notification settings CRUD and enforcement"""
        print("=== Test 7: Notification Settings ===")
        
        try:
            # Get default settings for user1
            response = await self.client.get(f"{BACKEND_URL}/notifications/{self.user1_id}/settings")
            if response.status_code == 200:
                settings = response.json()
                # Check all default settings are True
                expected_fields = ["challenges", "match_results", "follows", "messages", "likes", "comments", "system"]
                all_true = all(settings.get(field) == True for field in expected_fields)
                if all_true:
                    await self.log_result("Default notification settings", True, f"All settings are True by default: {settings}")
                else:
                    await self.log_result("Default notification settings", False, f"Some settings not True: {settings}")
            else:
                await self.log_result("Get default notification settings", False, f"Status: {response.status_code}")

            # Update settings - disable follows
            response = await self.client.post(
                f"{BACKEND_URL}/notifications/{self.user1_id}/settings",
                json={"user_id": self.user1_id, "follows": False}
            )
            if response.status_code == 200:
                updated_settings = response.json()
                if updated_settings.get("follows") == False:
                    await self.log_result("Update notification settings - disable follows", True, f"Follows disabled: {updated_settings}")
                else:
                    await self.log_result("Update notification settings - disable follows", False, f"Follows still enabled: {updated_settings}")
            else:
                await self.log_result("Update notification settings", False, f"Status: {response.status_code}, Response: {response.text}")

            # Test settings enforcement: User2 follows User1 (should NOT create notification)
            response = await self.client.post(
                f"{BACKEND_URL}/player/{self.user1_id}/follow",
                json={"follower_id": self.user2_id}
            )
            if response.status_code == 200:
                await self.log_result("User2 follows User1 (for settings test)", True, "Follow successful")
                
                # Check User1 notifications - should NOT have new follow notification
                response = await self.client.get(f"{BACKEND_URL}/notifications/{self.user1_id}")
                if response.status_code == 200:
                    notifications = response.json()
                    follow_notifications = [n for n in notifications if n.get("type") == "follow"]
                    if len(follow_notifications) == 0:
                        await self.log_result("Settings enforcement - no follow notification when disabled", True, "No follow notification created (correctly)")
                        return True
                    else:
                        await self.log_result("Settings enforcement - no follow notification when disabled", False, f"Found {len(follow_notifications)} follow notifications, expected 0")
                else:
                    await self.log_result("Check User1 notifications for settings enforcement", False, f"Status: {response.status_code}")
            else:
                await self.log_result("User2 follows User1 (for settings test)", False, f"Status: {response.status_code}")
                
        except Exception as e:
            await self.log_result("Notification settings test", False, f"Exception: {str(e)}")
            
        return False

    async def test_8_like_notification(self):
        """Test 8: Like notification"""
        print("=== Test 8: Like Notification ===")
        
        try:
            # First seed questions
            response = await self.client.post(f"{BACKEND_URL}/seed-questions")
            if response.status_code == 200:
                await self.log_result("Seed questions for like test", True, "Questions seeded successfully")
            else:
                await self.log_result("Seed questions for like test", False, f"Status: {response.status_code}")

            # Create a wall post by user1
            response = await self.client.post(
                f"{BACKEND_URL}/category/series_tv/wall",
                json={"user_id": self.user1_id, "content": "Test post for like notification"}
            )
            if response.status_code == 200:
                post_data = response.json()
                post_id = post_data["id"]
                await self.log_result("Create wall post for like test", True, f"Post ID: {post_id}")
                
                # Like the post as user2
                response = await self.client.post(
                    f"{BACKEND_URL}/wall/{post_id}/like",
                    json={"user_id": self.user2_id}
                )
                if response.status_code == 200:
                    like_data = response.json()
                    if like_data.get("liked"):
                        await self.log_result("User2 likes User1's post", True, "Post liked successfully")
                        
                        # Check user1 notifications for like notification
                        response = await self.client.get(f"{BACKEND_URL}/notifications/{self.user1_id}")
                        if response.status_code == 200:
                            notifications = response.json()
                            like_notifications = [n for n in notifications if n.get("type") == "like"]
                            if len(like_notifications) >= 1:
                                await self.log_result("User1 has like notification", True, f"Found {len(like_notifications)} like notification(s)")
                                return True
                            else:
                                await self.log_result("User1 has like notification", False, f"Expected like notification, got {len(like_notifications)}")
                        else:
                            await self.log_result("Check User1 notifications for like", False, f"Status: {response.status_code}")
                    else:
                        await self.log_result("User2 likes User1's post", False, f"Like failed: {like_data}")
                else:
                    await self.log_result("User2 likes User1's post", False, f"Status: {response.status_code}, Response: {response.text}")
            else:
                await self.log_result("Create wall post for like test", False, f"Status: {response.status_code}, Response: {response.text}")
                
        except Exception as e:
            await self.log_result("Like notification test", False, f"Exception: {str(e)}")
            
        return False

    async def test_9_comment_notification(self):
        """Test 9: Comment notification"""
        print("=== Test 9: Comment Notification ===")
        
        try:
            # Get the latest post to comment on
            response = await self.client.get(f"{BACKEND_URL}/category/series_tv/wall?user_id={self.user1_id}")
            if response.status_code == 200:
                posts = response.json()
                if len(posts) > 0:
                    post_id = posts[0]["id"]
                    
                    # Comment on the post as user2
                    response = await self.client.post(
                        f"{BACKEND_URL}/wall/{post_id}/comment",
                        json={"user_id": self.user2_id, "content": "Nice post!"}
                    )
                    if response.status_code == 200:
                        comment_data = response.json()
                        await self.log_result("User2 comments on User1's post", True, f"Comment ID: {comment_data['id']}")
                        
                        # Check user1 notifications for comment notification  
                        response = await self.client.get(f"{BACKEND_URL}/notifications/{self.user1_id}")
                        if response.status_code == 200:
                            notifications = response.json()
                            comment_notifications = [n for n in notifications if n.get("type") == "comment"]
                            if len(comment_notifications) >= 1:
                                await self.log_result("User1 has comment notification", True, f"Found {len(comment_notifications)} comment notification(s)")
                                return True
                            else:
                                await self.log_result("User1 has comment notification", False, f"Expected comment notification, got {len(comment_notifications)}")
                        else:
                            await self.log_result("Check User1 notifications for comment", False, f"Status: {response.status_code}")
                    else:
                        await self.log_result("User2 comments on User1's post", False, f"Status: {response.status_code}, Response: {response.text}")
                else:
                    await self.log_result("Get posts for comment test", False, "No posts found")
            else:
                await self.log_result("Get posts for comment test", False, f"Status: {response.status_code}")
                
        except Exception as e:
            await self.log_result("Comment notification test", False, f"Exception: {str(e)}")
            
        return False

    async def run_all_tests(self):
        """Run all notification tests"""
        print("🔔 Starting Notifications System Backend Testing 🔔")
        print("=" * 60)
        
        # Test 1: User Registration
        if not await self.test_1_user_registration():
            print("❌ Cannot continue tests without user registration")
            return False
            
        # Test 2: Empty notifications initially
        await self.test_2_empty_notifications()
        
        # Test 3: Follow notification
        await self.test_3_follow_notification()
        
        # Test 4: Message notification 
        await self.test_4_message_notification()
        
        # Test 5: Mark single as read
        await self.test_5_mark_single_read()
        
        # Test 6: Mark all as read
        await self.test_6_mark_all_read()
        
        # Test 7: Notification settings
        await self.test_7_notification_settings()
        
        # Test 8: Like notification
        await self.test_8_like_notification()
        
        # Test 9: Comment notification
        await self.test_9_comment_notification()
        
        # Summary
        print("=" * 60)
        print("🔔 NOTIFICATIONS SYSTEM TEST SUMMARY 🔔")
        print("=" * 60)
        
        passed_tests = [r for r in self.test_results if "✅ PASS" in r["status"]]
        failed_tests = [r for r in self.test_results if "❌ FAIL" in r["status"]]
        
        print(f"✅ PASSED: {len(passed_tests)}")
        print(f"❌ FAILED: {len(failed_tests)}")
        print()
        
        if failed_tests:
            print("FAILED TESTS:")
            for test in failed_tests:
                print(f"  ❌ {test['test']}: {test['details']}")
            print()
        
        print("ALL TEST RESULTS:")
        for test in self.test_results:
            print(f"  {test['status']}: {test['test']}")
        
        await self.client.aclose()
        return len(failed_tests) == 0

async def main():
    test_suite = NotificationsTestSuite()
    success = await test_suite.run_all_tests()
    if success:
        print("\n🎉 ALL NOTIFICATIONS TESTS PASSED!")
    else:
        print("\n⚠️  SOME NOTIFICATIONS TESTS FAILED!")
    
if __name__ == "__main__":
    asyncio.run(main())