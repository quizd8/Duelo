#!/usr/bin/env python3
"""
Backend Test Suite for Quiz Duelo Admin Panel APIs
Testing the 5 new admin endpoints for themes and reports management.
"""

import asyncio
import aiohttp
import json
import time

# Backend URL from environment
BACKEND_URL = "https://theme-stats-hub-1.preview.emergentagent.com/api"
ADMIN_PASSWORD = "Temporaire1!"

async def test_admin_endpoints():
    """Test all 5 new admin panel endpoints."""
    
    print("=" * 80)
    print("🔧 QUIZ DUELO - ADMIN PANEL BACKEND TESTING")
    print("=" * 80)
    print(f"Backend URL: {BACKEND_URL}")
    print(f"Admin Password: {ADMIN_PASSWORD}")
    print()

    async with aiohttp.ClientSession() as session:
        
        # Test 1: Upload Themes CSV
        print("1️⃣ TESTING POST /api/admin/upload-themes-csv")
        print("-" * 50)
        
        test_themes_csv = "ID_Theme;Super_Categorie;Cluster;Nom_Public;Description;Couleur_Hex;Titre_Niv_1;Titre_Niv_10;Titre_Niv_20;Titre_Niv_35;Titre_Niv_50;URL_Icone\nTEST_001;TEST_SC;TEST_CL;Test Theme;Test description;#FF0000;Niv1;Niv10;Niv20;Niv35;Niv50;http://test.com"
        
        upload_data = {
            "password": ADMIN_PASSWORD,
            "themes_csv": test_themes_csv
        }
        
        try:
            async with session.post(f"{BACKEND_URL}/admin/upload-themes-csv", json=upload_data) as resp:
                print(f"Status: {resp.status}")
                result = await resp.json()
                print(f"Response: {json.dumps(result, indent=2)}")
                
                if resp.status == 200:
                    if result.get("success") and result.get("themes_imported") == 1:
                        print("✅ PASSED: Themes CSV upload successful")
                    else:
                        print("❌ FAILED: Unexpected response structure")
                else:
                    print(f"❌ FAILED: HTTP {resp.status}")
        except Exception as e:
            print(f"❌ FAILED: Exception {str(e)}")
        
        print()

        # Test 2: Get Themes Overview  
        print("2️⃣ TESTING GET /api/admin/themes-overview")
        print("-" * 50)
        
        try:
            async with session.get(f"{BACKEND_URL}/admin/themes-overview") as resp:
                print(f"Status: {resp.status}")
                result = await resp.json()
                print(f"Response structure: {list(result.keys())}")
                
                if resp.status == 200:
                    if "super_categories" in result and "totals" in result:
                        super_cats = result["super_categories"]
                        totals = result["totals"]
                        print(f"Super categories count: {len(super_cats)}")
                        print(f"Totals: {totals}")
                        
                        # Check structure of first super category
                        if super_cats:
                            first_sc = super_cats[0]
                            print(f"First super category structure: {list(first_sc.keys())}")
                            
                            if "clusters" in first_sc and first_sc["clusters"]:
                                first_cluster = first_sc["clusters"][0]
                                print(f"First cluster structure: {list(first_cluster.keys())}")
                                
                                if "themes" in first_cluster and first_cluster["themes"]:
                                    print(f"First theme structure: {list(first_cluster['themes'][0].keys())}")
                        
                        print("✅ PASSED: Themes overview returned hierarchical structure")
                    else:
                        print("❌ FAILED: Missing required fields in response")
                else:
                    print(f"❌ FAILED: HTTP {resp.status}")
        except Exception as e:
            print(f"❌ FAILED: Exception {str(e)}")
            
        print()

        # Test 3: Get Match Stats by Theme
        print("3️⃣ TESTING GET /api/admin/match-stats-by-theme")
        print("-" * 50)
        
        try:
            async with session.get(f"{BACKEND_URL}/admin/match-stats-by-theme") as resp:
                print(f"Status: {resp.status}")
                result = await resp.json()
                print(f"Response structure: {list(result.keys())}")
                
                if resp.status == 200:
                    if "stats" in result and "total_matches" in result:
                        stats = result["stats"] 
                        total = result["total_matches"]
                        print(f"Stats entries count: {len(stats)}")
                        print(f"Total matches: {total}")
                        
                        # Check structure of first stat entry
                        if stats:
                            first_stat = stats[0]
                            expected_fields = ["theme_id", "theme_name", "match_count"]
                            missing_fields = [f for f in expected_fields if f not in first_stat]
                            
                            print(f"First stat entry: {first_stat}")
                            
                            if not missing_fields:
                                print("✅ PASSED: Match stats returned correct structure")
                            else:
                                print(f"❌ FAILED: Missing fields {missing_fields}")
                        else:
                            print("✅ PASSED: Match stats returned (empty but valid)")
                    else:
                        print("❌ FAILED: Missing required fields in response")
                else:
                    print(f"❌ FAILED: HTTP {resp.status}")
        except Exception as e:
            print(f"❌ FAILED: Exception {str(e)}")
            
        print()

        # Test 4: Get Reports
        print("4️⃣ TESTING GET /api/admin/reports")
        print("-" * 50)
        
        try:
            # Test basic reports endpoint
            async with session.get(f"{BACKEND_URL}/admin/reports") as resp:
                print(f"Status: {resp.status}")
                result = await resp.json()
                print(f"Response structure: {list(result.keys())}")
                
                if resp.status == 200:
                    if "reports" in result and "counts" in result:
                        reports = result["reports"]
                        counts = result["counts"]
                        print(f"Reports count: {len(reports)}")
                        print(f"Counts: {counts}")
                        
                        # Check structure
                        if reports:
                            first_report = reports[0]
                            expected_fields = ["id", "user_id", "user_pseudo", "question_id", "question_text", "category", "reason_type", "description", "status", "created_at"]
                            missing_fields = [f for f in expected_fields if f not in first_report]
                            
                            print(f"First report structure: {list(first_report.keys())}")
                            
                            if not missing_fields:
                                print("✅ PASSED: Reports returned correct structure")
                            else:
                                print(f"❌ FAILED: Missing fields {missing_fields}")
                        else:
                            print("✅ PASSED: Reports returned (empty but valid)")
                    else:
                        print("❌ FAILED: Missing required fields in response") 
                else:
                    print(f"❌ FAILED: HTTP {resp.status}")
                    
            # Test with status filter
            print("\n  Testing with ?status=pending filter...")
            async with session.get(f"{BACKEND_URL}/admin/reports?status=pending") as resp:
                print(f"  Status: {resp.status}")
                if resp.status == 200:
                    result = await resp.json()
                    print(f"  Pending reports: {len(result.get('reports', []))}")
                    print("✅ PASSED: Status filter working")
                else:
                    print(f"❌ FAILED: Status filter HTTP {resp.status}")
                    
        except Exception as e:
            print(f"❌ FAILED: Exception {str(e)}")
            
        print()

        # Test 5: Update Report Status  
        print("5️⃣ TESTING POST /api/admin/reports/{report_id}/status")
        print("-" * 50)
        
        try:
            # First, get a report to update
            async with session.get(f"{BACKEND_URL}/admin/reports") as resp:
                if resp.status == 200:
                    result = await resp.json()
                    reports = result.get("reports", [])
                    
                    if reports:
                        # Use first report
                        report_id = reports[0]["id"]
                        current_status = reports[0]["status"] 
                        new_status = "reviewed" if current_status != "reviewed" else "pending"
                        
                        print(f"Testing with report ID: {report_id}")
                        print(f"Current status: {current_status} -> New status: {new_status}")
                        
                        update_data = {"status": new_status}
                        
                        async with session.post(f"{BACKEND_URL}/admin/reports/{report_id}/status", json=update_data) as resp:
                            print(f"Status: {resp.status}")
                            result = await resp.json()
                            print(f"Response: {result}")
                            
                            if resp.status == 200:
                                if result.get("success") and result.get("status") == new_status:
                                    print("✅ PASSED: Report status update successful")
                                else:
                                    print("❌ FAILED: Unexpected response structure")
                            else:
                                print(f"❌ FAILED: HTTP {resp.status}")
                    else:
                        # Test with fake report ID to check error handling
                        print("No reports found, testing error handling with fake ID...")
                        fake_report_id = "fake-report-id"
                        update_data = {"status": "reviewed"}
                        
                        async with session.post(f"{BACKEND_URL}/admin/reports/{fake_report_id}/status", json=update_data) as resp:
                            print(f"Status: {resp.status}")
                            if resp.status == 404:
                                print("✅ PASSED: Error handling working (404 for non-existent report)")
                            else:
                                print(f"❌ FAILED: Expected 404, got {resp.status}")
                else:
                    print(f"❌ FAILED: Could not fetch reports for testing (HTTP {resp.status})")
                    
        except Exception as e:
            print(f"❌ FAILED: Exception {str(e)}")

        print()
        print("=" * 80)
        print("🏁 ADMIN PANEL BACKEND TESTING COMPLETE")
        print("=" * 80)


if __name__ == "__main__":
    asyncio.run(test_admin_endpoints())