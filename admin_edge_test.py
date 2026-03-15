#!/usr/bin/env python3
"""
Admin Panel APIs - Additional Edge Case Testing
Testing error scenarios, validation, and edge cases.
"""

import asyncio
import aiohttp
import json

BACKEND_URL = "https://duelo-admin-hub.preview.emergentagent.com/api"
ADMIN_PASSWORD = "Temporaire1!"

async def test_edge_cases():
    """Test error scenarios and edge cases."""
    
    print("=" * 80)
    print("🧪 ADMIN PANEL - EDGE CASE & VALIDATION TESTING")
    print("=" * 80)

    async with aiohttp.ClientSession() as session:
        
        # Test 1: Wrong admin password
        print("1️⃣ TESTING WRONG ADMIN PASSWORD")
        print("-" * 50)
        
        wrong_data = {
            "password": "wrong_password",
            "themes_csv": "ID_Theme;Super_Categorie;Cluster;Nom_Public;Description;Couleur_Hex;Titre_Niv_1;Titre_Niv_10;Titre_Niv_20;Titre_Niv_35;Titre_Niv_50;URL_Icone\nTEST_002;TEST_SC;TEST_CL;Test Theme;Test description;#FF0000;Niv1;Niv10;Niv20;Niv35;Niv50;http://test.com"
        }
        
        try:
            async with session.post(f"{BACKEND_URL}/admin/upload-themes-csv", json=wrong_data) as resp:
                print(f"Status: {resp.status}")
                if resp.status == 403:
                    result = await resp.json()
                    print(f"Response: {result}")
                    print("✅ PASSED: Wrong password correctly rejected with 403")
                else:
                    print(f"❌ FAILED: Expected 403, got {resp.status}")
        except Exception as e:
            print(f"❌ FAILED: Exception {str(e)}")
        
        print()

        # Test 2: Empty CSV data
        print("2️⃣ TESTING EMPTY CSV DATA")
        print("-" * 50)
        
        empty_data = {
            "password": ADMIN_PASSWORD,
            "themes_csv": ""
        }
        
        try:
            async with session.post(f"{BACKEND_URL}/admin/upload-themes-csv", json=empty_data) as resp:
                print(f"Status: {resp.status}")
                if resp.status == 400:
                    result = await resp.json()
                    print(f"Response: {result}")
                    print("✅ PASSED: Empty CSV correctly rejected with 400")
                else:
                    print(f"❌ FAILED: Expected 400, got {resp.status}")
        except Exception as e:
            print(f"❌ FAILED: Exception {str(e)}")
        
        print()

        # Test 3: Invalid report status update
        print("3️⃣ TESTING INVALID REPORT STATUS")
        print("-" * 50)
        
        try:
            # Get a report first
            async with session.get(f"{BACKEND_URL}/admin/reports") as resp:
                if resp.status == 200:
                    result = await resp.json()
                    reports = result.get("reports", [])
                    
                    if reports:
                        report_id = reports[0]["id"]
                        
                        invalid_data = {"status": "invalid_status"}
                        
                        async with session.post(f"{BACKEND_URL}/admin/reports/{report_id}/status", json=invalid_data) as resp:
                            print(f"Status: {resp.status}")
                            if resp.status == 400:
                                result = await resp.json()
                                print(f"Response: {result}")
                                print("✅ PASSED: Invalid status correctly rejected with 400")
                            else:
                                print(f"❌ FAILED: Expected 400, got {resp.status}")
                    else:
                        print("⚠️  SKIPPED: No reports available for testing")
                else:
                    print(f"❌ FAILED: Could not fetch reports (HTTP {resp.status})")
        except Exception as e:
            print(f"❌ FAILED: Exception {str(e)}")
        
        print()

        # Test 4: Non-existent report ID
        print("4️⃣ TESTING NON-EXISTENT REPORT ID")
        print("-" * 50)
        
        try:
            fake_id = "00000000-0000-0000-0000-000000000000"
            valid_data = {"status": "reviewed"}
            
            async with session.post(f"{BACKEND_URL}/admin/reports/{fake_id}/status", json=valid_data) as resp:
                print(f"Status: {resp.status}")
                if resp.status == 404:
                    result = await resp.json()
                    print(f"Response: {result}")
                    print("✅ PASSED: Non-existent report correctly rejected with 404")
                else:
                    print(f"❌ FAILED: Expected 404, got {resp.status}")
        except Exception as e:
            print(f"❌ FAILED: Exception {str(e)}")
        
        print()

        # Test 5: Verify themes were uploaded correctly
        print("5️⃣ TESTING THEME DATA PERSISTENCE")
        print("-" * 50)
        
        try:
            async with session.get(f"{BACKEND_URL}/admin/themes-overview") as resp:
                if resp.status == 200:
                    result = await resp.json()
                    super_cats = result["super_categories"]
                    
                    # Look for our test theme
                    found_test_theme = False
                    for sc in super_cats:
                        for cluster in sc["clusters"]:
                            for theme in cluster["themes"]:
                                if theme["id"] == "TEST_001":
                                    found_test_theme = True
                                    print(f"Found test theme: {theme}")
                                    break
                    
                    if found_test_theme:
                        print("✅ PASSED: Test theme was correctly persisted in database")
                    else:
                        print("❌ FAILED: Test theme not found in database")
                else:
                    print(f"❌ FAILED: Could not fetch themes overview (HTTP {resp.status})")
        except Exception as e:
            print(f"❌ FAILED: Exception {str(e)}")
        
        print()

        # Test 6: Reports filtering
        print("6️⃣ TESTING REPORTS FILTERING")
        print("-" * 50)
        
        try:
            # Test different status filters
            statuses = ["pending", "reviewed", "resolved"]
            
            for status in statuses:
                async with session.get(f"{BACKEND_URL}/admin/reports?status={status}") as resp:
                    if resp.status == 200:
                        result = await resp.json()
                        reports = result["reports"]
                        counts = result["counts"]
                        
                        # Verify that all returned reports have the correct status
                        if all(report["status"] == status for report in reports):
                            print(f"✅ Status filter '{status}': {len(reports)} reports (correct filtering)")
                        else:
                            print(f"❌ Status filter '{status}': incorrect filtering")
                    else:
                        print(f"❌ Status filter '{status}': HTTP {resp.status}")
            
        except Exception as e:
            print(f"❌ FAILED: Exception {str(e)}")

        print()
        print("=" * 80)
        print("🧪 EDGE CASE TESTING COMPLETE")
        print("=" * 80)


if __name__ == "__main__":
    asyncio.run(test_edge_cases())