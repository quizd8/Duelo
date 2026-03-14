#!/usr/bin/env python3
"""
Backend testing script for CSV Question Import System.
Tests the new admin APIs for bulk CSV import functionality.
"""

import requests
import json
import sys
import time
from typing import Dict, List, Any

# Backend URL from frontend/.env - should use public endpoint
BASE_URL = "https://duelo-matchmake.preview.emergentagent.com/api"
ADMIN_PASSWORD = "Temporaire1!"

class APITester:
    def __init__(self):
        self.base_url = BASE_URL
        self.session = requests.Session()
        self.test_results = []
        
    def log_test(self, test_name: str, success: bool, details: str = ""):
        """Log a test result."""
        status = "✅ PASS" if success else "❌ FAIL"
        self.test_results.append({
            "test": test_name,
            "success": success,
            "details": details
        })
        print(f"{status} {test_name}")
        if details:
            print(f"    Details: {details}")
    
    def make_request(self, method: str, endpoint: str, data: Dict = None) -> requests.Response:
        """Make HTTP request to API endpoint."""
        url = f"{self.base_url}{endpoint}"
        headers = {"Content-Type": "application/json"}
        
        try:
            if method.upper() == "GET":
                return self.session.get(url, timeout=30)
            elif method.upper() == "POST":
                return self.session.post(url, json=data, headers=headers, timeout=30)
            else:
                raise ValueError(f"Unsupported method: {method}")
        except Exception as e:
            print(f"Request error: {e}")
            raise

    def test_questions_stats_api(self):
        """Test GET /api/admin/questions-stats endpoint."""
        print("\n🔍 Testing Questions Stats API...")
        
        try:
            response = self.make_request("GET", "/admin/questions-stats")
            
            if response.status_code != 200:
                self.log_test("Questions Stats API", False, f"Status code: {response.status_code}, Response: {response.text}")
                return False
            
            data = response.json()
            
            # Validate response structure
            required_fields = ["total_questions", "categories", "batches"]
            for field in required_fields:
                if field not in data:
                    self.log_test("Questions Stats API", False, f"Missing field: {field}")
                    return False
            
            # Validate categories structure
            if isinstance(data["categories"], list):
                for cat in data["categories"]:
                    if not isinstance(cat, dict) or "category" not in cat or "count" not in cat:
                        self.log_test("Questions Stats API", False, "Invalid category structure")
                        return False
            
            # Validate batches structure
            if isinstance(data["batches"], list):
                for batch in data["batches"]:
                    if not isinstance(batch, dict) or "batch" not in batch or "count" not in batch:
                        self.log_test("Questions Stats API", False, "Invalid batch structure")
                        return False
            
            self.log_test("Questions Stats API", True, f"Total: {data['total_questions']}, Categories: {len(data['categories'])}, Batches: {len(data['batches'])}")
            return True
            
        except Exception as e:
            self.log_test("Questions Stats API", False, f"Exception: {str(e)}")
            return False

    def test_csv_upload_valid_data(self):
        """Test POST /api/admin/upload-csv with valid data."""
        print("\n📤 Testing CSV Upload with Valid Data...")
        
        test_questions = [
            {
                "id": "CSV_TEST_001",
                "category": "TEST_CAT",
                "question_text": "Test question 1?",
                "option_a": "Answer A",
                "option_b": "Answer B",
                "option_c": "Answer C",
                "option_d": "Answer D",
                "correct_option": "B",
                "difficulty": "easy",
                "angle": "test_angle",
                "batch": "test_batch_1"
            },
            {
                "id": "CSV_TEST_002",
                "category": "TEST_CAT",
                "question_text": "Test question 2?",
                "option_a": "Option A",
                "option_b": "Option B",
                "option_c": "Option C",
                "option_d": "Option D",
                "correct_option": "D",
                "difficulty": "hard",
                "angle": "",
                "batch": "test_batch_1"
            }
        ]
        
        payload = {
            "password": ADMIN_PASSWORD,
            "questions": test_questions
        }
        
        try:
            response = self.make_request("POST", "/admin/upload-csv", payload)
            
            if response.status_code != 200:
                self.log_test("CSV Upload Valid Data", False, f"Status code: {response.status_code}, Response: {response.text}")
                return False
            
            data = response.json()
            
            # Expected response structure
            expected_fields = ["success", "imported", "duplicates", "errors", "total_processed"]
            for field in expected_fields:
                if field not in data:
                    self.log_test("CSV Upload Valid Data", False, f"Missing field: {field}")
                    return False
            
            # Check if questions were imported
            if not data["success"]:
                self.log_test("CSV Upload Valid Data", False, "success=False in response")
                return False
                
            if data["imported"] != 2:
                self.log_test("CSV Upload Valid Data", False, f"Expected imported=2, got {data['imported']}")
                return False
            
            if data["duplicates"] != 0:
                self.log_test("CSV Upload Valid Data", False, f"Expected duplicates=0, got {data['duplicates']}")
                return False
            
            if len(data["errors"]) != 0:
                self.log_test("CSV Upload Valid Data", False, f"Expected 0 errors, got {len(data['errors'])}: {data['errors']}")
                return False
            
            if data["total_processed"] != 2:
                self.log_test("CSV Upload Valid Data", False, f"Expected total_processed=2, got {data['total_processed']}")
                return False
            
            self.log_test("CSV Upload Valid Data", True, f"Imported: {data['imported']}, Duplicates: {data['duplicates']}, Errors: {len(data['errors'])}")
            return True
            
        except Exception as e:
            self.log_test("CSV Upload Valid Data", False, f"Exception: {str(e)}")
            return False

    def test_csv_upload_duplicate_handling(self):
        """Test duplicate handling by sending the same questions again."""
        print("\n🔁 Testing CSV Upload Duplicate Handling...")
        
        # Use same test questions as before
        test_questions = [
            {
                "id": "CSV_TEST_001",
                "category": "TEST_CAT",
                "question_text": "Test question 1?",
                "option_a": "Answer A",
                "option_b": "Answer B",
                "option_c": "Answer C",
                "option_d": "Answer D",
                "correct_option": "B",
                "difficulty": "easy",
                "angle": "test_angle",
                "batch": "test_batch_1"
            },
            {
                "id": "CSV_TEST_002",
                "category": "TEST_CAT",
                "question_text": "Test question 2?",
                "option_a": "Option A",
                "option_b": "Option B",
                "option_c": "Option C",
                "option_d": "Option D",
                "correct_option": "D",
                "difficulty": "hard",
                "angle": "",
                "batch": "test_batch_1"
            }
        ]
        
        payload = {
            "password": ADMIN_PASSWORD,
            "questions": test_questions
        }
        
        try:
            response = self.make_request("POST", "/admin/upload-csv", payload)
            
            if response.status_code != 200:
                self.log_test("CSV Upload Duplicate Handling", False, f"Status code: {response.status_code}, Response: {response.text}")
                return False
            
            data = response.json()
            
            # Should detect duplicates
            if not data["success"]:
                self.log_test("CSV Upload Duplicate Handling", False, "success=False in response")
                return False
                
            if data["imported"] != 0:
                self.log_test("CSV Upload Duplicate Handling", False, f"Expected imported=0, got {data['imported']}")
                return False
            
            if data["duplicates"] != 2:
                self.log_test("CSV Upload Duplicate Handling", False, f"Expected duplicates=2, got {data['duplicates']}")
                return False
            
            if data["total_processed"] != 2:
                self.log_test("CSV Upload Duplicate Handling", False, f"Expected total_processed=2, got {data['total_processed']}")
                return False
            
            self.log_test("CSV Upload Duplicate Handling", True, f"Correctly detected {data['duplicates']} duplicates")
            return True
            
        except Exception as e:
            self.log_test("CSV Upload Duplicate Handling", False, f"Exception: {str(e)}")
            return False

    def test_csv_upload_invalid_data(self):
        """Test CSV upload with invalid data."""
        print("\n⚠️  Testing CSV Upload with Invalid Data...")
        
        invalid_questions = [
            {
                # Missing question_text
                "category": "TEST",
                "question_text": "",
                "option_a": "A",
                "option_b": "B",
                "option_c": "C",
                "option_d": "D",
                "correct_option": "A"
            },
            {
                # Missing category
                "category": "",
                "question_text": "Some question?",
                "option_a": "A",
                "option_b": "B",
                "option_c": "C",
                "option_d": "D",
                "correct_option": "A"
            },
            {
                # Invalid correct_option
                "category": "TEST",
                "question_text": "Some question?",
                "option_a": "A",
                "option_b": "B",
                "option_c": "C",
                "option_d": "D",
                "correct_option": "X"
            }
        ]
        
        payload = {
            "password": ADMIN_PASSWORD,
            "questions": invalid_questions
        }
        
        try:
            response = self.make_request("POST", "/admin/upload-csv", payload)
            
            if response.status_code != 200:
                self.log_test("CSV Upload Invalid Data", False, f"Status code: {response.status_code}, Response: {response.text}")
                return False
            
            data = response.json()
            
            # Should have errors but still return success=True
            if not data["success"]:
                self.log_test("CSV Upload Invalid Data", False, "success=False in response")
                return False
                
            if data["imported"] != 0:
                self.log_test("CSV Upload Invalid Data", False, f"Expected imported=0, got {data['imported']}")
                return False
            
            if data["duplicates"] != 0:
                self.log_test("CSV Upload Invalid Data", False, f"Expected duplicates=0, got {data['duplicates']}")
                return False
            
            if len(data["errors"]) != 3:
                self.log_test("CSV Upload Invalid Data", False, f"Expected 3 errors, got {len(data['errors'])}: {data['errors']}")
                return False
            
            if data["total_processed"] != 3:
                self.log_test("CSV Upload Invalid Data", False, f"Expected total_processed=3, got {data['total_processed']}")
                return False
            
            self.log_test("CSV Upload Invalid Data", True, f"Correctly handled {len(data['errors'])} errors")
            return True
            
        except Exception as e:
            self.log_test("CSV Upload Invalid Data", False, f"Exception: {str(e)}")
            return False

    def test_csv_upload_wrong_password(self):
        """Test CSV upload with wrong password."""
        print("\n🔒 Testing CSV Upload with Wrong Password...")
        
        payload = {
            "password": "wrong",
            "questions": [
                {
                    "category": "TEST",
                    "question_text": "Test?",
                    "option_a": "A",
                    "option_b": "B",
                    "option_c": "C",
                    "option_d": "D",
                    "correct_option": "A"
                }
            ]
        }
        
        try:
            response = self.make_request("POST", "/admin/upload-csv", payload)
            
            if response.status_code == 403:
                self.log_test("CSV Upload Wrong Password", True, "Correctly returned 403 Forbidden")
                return True
            else:
                self.log_test("CSV Upload Wrong Password", False, f"Expected 403, got {response.status_code}")
                return False
            
        except Exception as e:
            self.log_test("CSV Upload Wrong Password", False, f"Exception: {str(e)}")
            return False

    def test_csv_upload_auto_id_generation(self):
        """Test CSV upload with auto ID generation."""
        print("\n🔢 Testing CSV Upload Auto-ID Generation...")
        
        test_questions = [
            {
                # No id field - should auto-generate
                "category": "TEST_AUTO",
                "question_text": "Auto ID question?",
                "option_a": "A1",
                "option_b": "B1",
                "option_c": "C1",
                "option_d": "D1",
                "correct_option": "C",
                "difficulty": "medium"
            }
        ]
        
        payload = {
            "password": ADMIN_PASSWORD,
            "questions": test_questions
        }
        
        try:
            response = self.make_request("POST", "/admin/upload-csv", payload)
            
            if response.status_code != 200:
                self.log_test("CSV Upload Auto-ID", False, f"Status code: {response.status_code}, Response: {response.text}")
                return False
            
            data = response.json()
            
            if not data["success"]:
                self.log_test("CSV Upload Auto-ID", False, "success=False in response")
                return False
                
            if data["imported"] != 1:
                self.log_test("CSV Upload Auto-ID", False, f"Expected imported=1, got {data['imported']}")
                return False
            
            self.log_test("CSV Upload Auto-ID", True, "Auto-generated ID and imported question")
            return True
            
        except Exception as e:
            self.log_test("CSV Upload Auto-ID", False, f"Exception: {str(e)}")
            return False

    def test_questions_stats_after_imports(self):
        """Test questions-stats endpoint after all imports."""
        print("\n📊 Testing Questions Stats After Imports...")
        
        try:
            response = self.make_request("GET", "/admin/questions-stats")
            
            if response.status_code != 200:
                self.log_test("Questions Stats After Imports", False, f"Status code: {response.status_code}, Response: {response.text}")
                return False
            
            data = response.json()
            
            # Should show updated counts
            test_cat_found = False
            test_auto_found = False
            
            for cat in data["categories"]:
                if cat["category"] == "TEST_CAT" and cat["count"] >= 2:
                    test_cat_found = True
                elif cat["category"] == "TEST_AUTO" and cat["count"] >= 1:
                    test_auto_found = True
            
            if not test_cat_found:
                self.log_test("Questions Stats After Imports", False, "TEST_CAT category not found or count < 2")
                return False
            
            if not test_auto_found:
                self.log_test("Questions Stats After Imports", False, "TEST_AUTO category not found or count < 1")
                return False
            
            # Check for batches
            test_batch_found = False
            for batch in data["batches"]:
                if batch["batch"] == "test_batch_1" and batch["count"] >= 2:
                    test_batch_found = True
            
            if not test_batch_found:
                self.log_test("Questions Stats After Imports", False, "test_batch_1 batch not found or count < 2")
                return False
            
            self.log_test("Questions Stats After Imports", True, f"Updated counts - Total: {data['total_questions']}, TEST_CAT and TEST_AUTO categories found, test_batch_1 found")
            return True
            
        except Exception as e:
            self.log_test("Questions Stats After Imports", False, f"Exception: {str(e)}")
            return False

    def run_all_tests(self):
        """Run all CSV import system tests."""
        print(f"🚀 Starting CSV Question Import System Tests...")
        print(f"Backend URL: {self.base_url}")
        print(f"Admin Password: {ADMIN_PASSWORD}")
        
        # Run tests in sequence
        tests = [
            self.test_questions_stats_api,
            self.test_csv_upload_valid_data,
            self.test_csv_upload_duplicate_handling,
            self.test_csv_upload_invalid_data,
            self.test_csv_upload_wrong_password,
            self.test_csv_upload_auto_id_generation,
            self.test_questions_stats_after_imports,
        ]
        
        passed = 0
        total = len(tests)
        
        for test in tests:
            if test():
                passed += 1
            time.sleep(0.5)  # Small delay between tests
        
        # Summary
        print(f"\n{'='*60}")
        print(f"📋 CSV Import System Test Results: {passed}/{total} tests passed")
        
        if passed == total:
            print("✅ All tests PASSED! CSV import system is working correctly.")
            return True
        else:
            print("❌ Some tests FAILED! Check details above.")
            
            # Show failed tests
            print("\n Failed tests:")
            for result in self.test_results:
                if not result["success"]:
                    print(f"   ❌ {result['test']}: {result['details']}")
            
            return False

def main():
    """Main test runner."""
    print("CSV Question Import System Backend Testing")
    print("=" * 60)
    
    tester = APITester()
    success = tester.run_all_tests()
    
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()