@echo off
REM TEST SCRIPT - VN-GO TRAVEL (Windows)
REM Chay: test-quick.bat

echo ==========================================
echo 🧪 VN-GO TRAVEL - QUICK TEST SCRIPT
echo ==========================================
echo.

set BASE_URL=http://localhost:3000/api/v1

REM Step 1: Login Demo User
echo 📝 Step 1: Dang nhap Demo User...
curl -s -X POST "%BASE_URL%/auth/login" ^
  -H "Content-Type: application/json" ^
  -d "{\"email\": \"demo@vngo.com\", \"password\": \"demo123\"}" ^
  -o login_response.json

echo ✅ Dang nhap thanh cong! (xem login_response.json)
echo.

REM Step 2: Login Admin
echo 📝 Step 2: Dang nhap Admin...
curl -s -X POST "%BASE_URL%/auth/login" ^
  -H "Content-Type: application/json" ^
  -d "{\"email\": \"admin@vngo.com\", \"password\": \"admin123\"}" ^
  -o admin_response.json

echo ✅ Dang nhap admin thanh cong! (xem admin_response.json)
echo.

REM Step 3: Get Nearby POIs
echo 📝 Step 3: Tim POI gan Ho Hoan Kiem...
curl -s -X GET "%BASE_URL%/pois/nearby?lat=21.0285&lng=105.8542&radius=5000&limit=5" ^
  -o nearby_response.json

echo ✅ Ket qua luu tai nearby_response.json
echo.

REM Step 4: Check Health
echo 📝 Step 4: Kiem tra Server Health...
curl -s -X GET "http://localhost:3000/api/v1/health" ^
  -o health_response.json

echo ✅ Health check luu tai health_response.json
echo.

echo ==========================================
echo 🎯 TEST HOAN TAT!
echo ==========================================
echo.
echo 📊 Ket qua luu tai:
echo   - login_response.json
echo   - admin_response.json
echo   - nearby_response.json
echo   - health_response.json
echo.
echo 💡 Copy token tu login_response.json de test tiep
echo 💡 Xem huong dan chi tiet: docs\HUONG_DAN_TEST.md
echo.

pause
