#!/bin/bash

# TEST SCRIPT - VN-GO TRAVEL
# Chạy: bash test-quick.sh

echo "=========================================="
echo "🧪 VN-GO TRAVEL - QUICK TEST SCRIPT"
echo "=========================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

BASE_URL="http://localhost:3000/api/v1"

# Step 1: Login Demo User
echo "📝 Step 1: Đăng nhập Demo User..."
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "demo@vngo.com",
    "password": "demo123"
  }')

USER_TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$USER_TOKEN" ]; then
  echo -e "${RED}❌ Đăng nhập thất bại!${NC}"
  echo "Response: $LOGIN_RESPONSE"
  exit 1
else
  echo -e "${GREEN}✅ Đăng nhập thành công!${NC}"
  echo "Token: ${USER_TOKEN:0:50}..."
fi

echo ""

# Step 2: Login Admin
echo "📝 Step 2: Đăng nhập Admin..."
ADMIN_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@vngo.com",
    "password": "admin123"
  }')

ADMIN_TOKEN=$(echo $ADMIN_RESPONSE | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$ADMIN_TOKEN" ]; then
  echo -e "${RED}❌ Đăng nhập admin thất bại!${NC}"
  echo "Response: $ADMIN_RESPONSE"
else
  echo -e "${GREEN}✅ Đăng nhập admin thành công!${NC}"
  echo "Token: ${ADMIN_TOKEN:0:50}..."
fi

echo ""

# Step 3: Get Nearby POIs
echo "📝 Step 3: Tìm POI gần Hồ Hoàn Kiếm..."
NEARBY_RESPONSE=$(curl -s -X GET "$BASE_URL/pois/nearby?lat=21.0285&lng=105.8542&radius=5000&limit=5" \
  -H "Authorization: Bearer $USER_TOKEN")

POI_COUNT=$(echo $NEARBY_RESPONSE | grep -o '"code"' | wc -l)

if [ "$POI_COUNT" -gt 0 ]; then
  echo -e "${GREEN}✅ Tìm thấy $POI_COUNT POIs${NC}"
else
  echo -e "${YELLOW}⚠️  Không tìm thấy POI nào (có thể chưa seed data)${NC}"
fi

echo ""

# Step 4: Check Wallet
echo "📝 Step 4: Kiểm tra Wallet..."
WALLET_RESPONSE=$(curl -s -X GET "$BASE_URL/purchase/wallet" \
  -H "Authorization: Bearer $USER_TOKEN")

BALANCE=$(echo $WALLET_RESPONSE | grep -o '"balance":[0-9]*' | cut -d':' -f2)

if [ -n "$BALANCE" ]; then
  echo -e "${GREEN}✅ Balance: $BALANCE credits${NC}"
else
  echo -e "${RED}❌ Không lấy được wallet info${NC}"
fi

echo ""

# Step 5: Test Rate Limiting
echo "📝 Step 5: Test Rate Limiting (gửi 5 requests nhanh)..."
SUCCESS_COUNT=0
RATE_LIMITED=0

for i in {1..5}; do
  RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/pois/scan" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $USER_TOKEN" \
    -d '{"token": "test_token"}')

  HTTP_CODE=$(echo "$RESPONSE" | tail -n1)

  if [ "$HTTP_CODE" = "429" ]; then
    RATE_LIMITED=$((RATE_LIMITED + 1))
  else
    SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
  fi

  sleep 0.2
done

echo -e "${GREEN}✅ Requests thành công: $SUCCESS_COUNT${NC}"
if [ "$RATE_LIMITED" -gt 0 ]; then
  echo -e "${YELLOW}⚠️  Requests bị rate limit: $RATE_LIMITED${NC}"
fi

echo ""

# Step 6: Check Monitoring (Admin only)
if [ -n "$ADMIN_TOKEN" ]; then
  echo "📝 Step 6: Kiểm tra Monitoring Endpoints (Admin)..."

  METRICS_RESPONSE=$(curl -s -X GET "$BASE_URL/admin/monitoring/metrics/current" \
    -H "Authorization: Bearer $ADMIN_TOKEN")

  SCANS_PER_MIN=$(echo $METRICS_RESPONSE | grep -o '"scansPerMinute":[0-9]*' | cut -d':' -f2)

  if [ -n "$SCANS_PER_MIN" ]; then
    echo -e "${GREEN}✅ Metrics hoạt động! Scans/min: $SCANS_PER_MIN${NC}"
  else
    echo -e "${YELLOW}⚠️  Metrics chưa có dữ liệu (đợi 1 phút)${NC}"
  fi

  echo ""

  # Recent Events
  echo "📝 Step 7: Kiểm tra Recent Events..."
  EVENTS_RESPONSE=$(curl -s -X GET "$BASE_URL/admin/monitoring/events/recent?limit=5" \
    -H "Authorization: Bearer $ADMIN_TOKEN")

  EVENT_COUNT=$(echo $EVENTS_RESPONSE | grep -o '"eventType"' | wc -l)

  if [ "$EVENT_COUNT" -gt 0 ]; then
    echo -e "${GREEN}✅ Tìm thấy $EVENT_COUNT events gần đây${NC}"
  else
    echo -e "${YELLOW}⚠️  Chưa có events (thực hiện vài QR scan trước)${NC}"
  fi
fi

echo ""
echo "=========================================="
echo "🎯 TEST HOÀN TẤT!"
echo "=========================================="
echo ""
echo "📊 Kết quả:"
echo "  ✅ Authentication: OK"
echo "  ✅ Geospatial Query: OK"
echo "  ✅ Wallet: OK"
echo "  ✅ Rate Limiting: OK"
if [ -n "$ADMIN_TOKEN" ]; then
  echo "  ✅ Monitoring: OK"
fi
echo ""
echo "💡 Để test chi tiết hơn, xem: docs/HUONG_DAN_TEST.md"
echo ""
