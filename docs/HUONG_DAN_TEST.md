# 🧪 HƯỚNG DẪN TEST THỦ CÔNG - VN-GO TRAVEL

**Ngày:** 2026-04-23  
**Phiên bản:** 1.0

---

## 📋 CHUẨN BỊ

### 1. Tài Khoản Test

#### 👤 Tài Khoản Demo (User thường)
```
Email: demo@vngo.com
Password: demo123
Credits: 5000
Role: USER
```

#### 👨‍💼 Tài Khoản Admin
```
Email: admin@vngo.com
Password: admin123
Role: ADMIN
```

#### 🏪 Tài Khoản Owner (Chủ POI)
```
Email: owner@vngo.com
Password: owner123
Role: OWNER
```

---

## 🚀 KHỞI ĐỘNG HỆ THỐNG

### Bước 1: Khởi động Backend

```bash
# Mở terminal tại thư mục backend
cd backend

# Cài đặt dependencies (nếu chưa cài)
npm install

# Tạo dữ liệu demo (chỉ chạy 1 lần)
node scripts/demo-seed.js

# Khởi động server
npm start
```

**Kết quả mong đợi:**
```
Server is running on port 3000 [development]
MongoDB connected successfully
[METRICS] Metrics service initialized
Socket.IO initialized for real-time audio queue
Daily QR reset job scheduled (00:00 UTC)
Metrics aggregation running (1-minute intervals)
```

### Bước 2: Khởi động Admin Web (Optional)

```bash
# Mở terminal mới tại thư mục admin-web
cd admin-web

# Cài đặt dependencies (nếu chưa cài)
npm install

# Khởi động
npm run dev
```

**Truy cập:** http://localhost:5174

---

## 🧪 TEST CASES

### TEST 1: Đăng Nhập (Authentication)

#### 1.1. Đăng nhập User thường

**Request:**
```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "demo@vngo.com",
    "password": "demo123"
  }'
```

**Kết quả mong đợi:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "...",
    "email": "demo@vngo.com",
    "fullName": "Demo User",
    "role": "USER",
    "isPremium": false
  }
}
```

**Lưu token này để dùng cho các test sau!**

#### 1.2. Đăng nhập Admin

**Request:**
```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@vngo.com",
    "password": "admin123"
  }'
```

**Kết quả mong đợi:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "...",
    "email": "admin@vngo.com",
    "fullName": "Admin User",
    "role": "ADMIN"
  }
}
```

---

### TEST 2: Xem POI Gần Đây (Geospatial Query)

**Request:**
```bash
curl -X GET "http://localhost:3000/api/v1/pois/nearby?lat=21.0285&lng=105.8542&radius=5000&limit=10" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

**Tọa độ test:**
- Hồ Hoàn Kiếm: `lat=21.0285, lng=105.8542`
- Văn Miếu: `lat=21.0267, lng=105.8355`

**Kết quả mong đợi:**
```json
{
  "success": true,
  "data": [
    {
      "id": "...",
      "code": "DEMO_HOAN_KIEM_LAKE",
      "name": "Hồ Hoàn Kiếm",
      "summary": "Biểu tượng của Hà Nội...",
      "location": {
        "lat": 21.0285,
        "lng": 105.8542
      },
      "isPremiumOnly": false
    }
  ]
}
```

---

### TEST 3: Quét QR Code (Event Logging Test)

#### 3.1. Tạo QR Token (Admin)

**Request:**
```bash
curl -X POST http://localhost:3000/api/v1/admin/pois/POI_ID/qr-token \
  -H "Authorization: Bearer ADMIN_TOKEN_HERE"
```

**Kết quả:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "scanUrl": "vngo://scan?t=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresAt": "2027-04-23T13:37:00.000Z",
    "expiresInDays": 365
  }
}
```

#### 3.2. Quét QR (User)

**Request:**
```bash
curl -X POST http://localhost:3000/api/v1/pois/scan \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer USER_TOKEN_HERE" \
  -H "X-Device-Id: test-device-123" \
  -d '{
    "token": "QR_TOKEN_FROM_STEP_3.1"
  }'
```

**Kết quả mong đợi:**
```json
{
  "success": true,
  "data": {
    "id": "...",
    "code": "DEMO_HOAN_KIEM_LAKE",
    "name": "Hồ Hoàn Kiếm",
    "summary": "...",
    "narrationShort": "...",
    "accessStatus": {
      "allowed": true,
      "reason": "FREE_POI"
    }
  }
}
```

**✅ Kiểm tra Event Logging:**
- Event `QR_SCAN` đã được ghi vào database
- Có thể xem qua monitoring endpoint (test 7)

---

### TEST 4: Mua POI/Zone (Purchase Flow + Event Logging)

#### 4.1. Xem Wallet

**Request:**
```bash
curl -X GET http://localhost:3000/api/v1/purchase/wallet \
  -H "Authorization: Bearer USER_TOKEN_HERE"
```

**Kết quả:**
```json
{
  "success": true,
  "data": {
    "balance": 5000,
    "currency": "VND",
    "stats": {
      "totalSpent": 0,
      "totalEarned": 5000,
      "purchaseCount": 0
    }
  }
}
```

#### 4.2. Mua Zone

**Request:**
```bash
curl -X POST http://localhost:3000/api/v1/purchase/zone \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer USER_TOKEN_HERE" \
  -d '{
    "zoneCode": "DEMO_HANOI_OLD_QUARTER"
  }'
```

**Kết quả mong đợi:**
```json
{
  "success": true,
  "data": {
    "message": "Zone unlocked successfully",
    "zoneCode": "DEMO_HANOI_OLD_QUARTER",
    "price": 500,
    "unlockedPois": 5,
    "newBalance": 4500
  }
}
```

**✅ Kiểm tra Event Logging:**
- Event `ZONE_UNLOCK` đã được ghi
- Event `CREDIT_DEBIT` đã được ghi
- Balance giảm từ 5000 → 4500

---

### TEST 5: Rate Limiting (Multi-Tier)

#### 5.1. Test IP Rate Limit (20/min)

**Request:** Gửi 21 requests liên tiếp
```bash
for i in {1..21}; do
  echo "Request $i"
  curl -X POST http://localhost:3000/api/v1/pois/scan \
    -H "Content-Type: application/json" \
    -d '{"token": "invalid_token"}'
  sleep 0.1
done
```

**Kết quả mong đợi:**
- Request 1-20: Thành công (hoặc lỗi JWT)
- Request 21: `429 Too Many Requests`

#### 5.2. Test Device Rate Limit (20/min)

**Request:** Gửi 21 requests với cùng device ID
```bash
for i in {1..21}; do
  echo "Request $i"
  curl -X POST http://localhost:3000/api/v1/pois/scan \
    -H "Content-Type: application/json" \
    -H "X-Device-Id: test-device-abuse" \
    -d '{"token": "invalid_token"}'
  sleep 0.1
done
```

**Kết quả mong đợi:**
- Request 1-20: Thành công
- Request 21: `429 Too Many Requests`

#### 5.3. Test User Rate Limit (10/min)

**Request:** Gửi 11 requests với cùng user token
```bash
for i in {1..11}; do
  echo "Request $i"
  curl -X POST http://localhost:3000/api/v1/pois/scan \
    -H "Authorization: Bearer USER_TOKEN_HERE" \
    -H "Content-Type: application/json" \
    -d '{"token": "invalid_token"}'
  sleep 0.1
done
```

**Kết quả mong đợi:**
- Request 1-10: Thành công
- Request 11: `429 Too Many Requests`

---

### TEST 6: Daily QR Quota (Free User)

**Giới hạn:** Free user chỉ được quét 20 QR/ngày

**Request:** Quét QR 21 lần trong ngày
```bash
# Quét lần thứ 20 (thành công)
curl -X POST http://localhost:3000/api/v1/pois/scan \
  -H "Authorization: Bearer USER_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{"token": "VALID_QR_TOKEN"}'

# Quét lần thứ 21 (thất bại)
curl -X POST http://localhost:3000/api/v1/pois/scan \
  -H "Authorization: Bearer USER_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{"token": "VALID_QR_TOKEN"}'
```

**Kết quả mong đợi (lần 21):**
```json
{
  "success": false,
  "error": {
    "code": "QUOTA_EXCEEDED",
    "message": "Bạn đã dùng hết 20 lượt quét QR miễn phí. Vui lòng nâng cấp VIP để quét không giới hạn."
  }
}
```

---

### TEST 7: Monitoring Endpoints (Admin Only)

#### 7.1. Current Metrics

**Request:**
```bash
curl -X GET http://localhost:3000/api/v1/admin/monitoring/metrics/current \
  -H "Authorization: Bearer ADMIN_TOKEN_HERE"
```

**Kết quả mong đợi:**
```json
{
  "success": true,
  "data": {
    "scansPerMinute": 5,
    "unlockSuccessRate": 100,
    "audioSuccessRate": 100,
    "apiLatency": {
      "p50": 120,
      "p95": 210,
      "p99": 350
    },
    "errorRate": 0,
    "timestamp": "2026-04-23T13:37:00.000Z"
  }
}
```

#### 7.2. Recent Events

**Request:**
```bash
curl -X GET "http://localhost:3000/api/v1/admin/monitoring/events/recent?limit=10" \
  -H "Authorization: Bearer ADMIN_TOKEN_HERE"
```

**Kết quả mong đợi:**
```json
{
  "success": true,
  "data": [
    {
      "eventType": "QR_SCAN",
      "userId": "...",
      "poiId": "...",
      "status": "SUCCESS",
      "metadata": {
        "poiCode": "DEMO_HOAN_KIEM_LAKE",
        "ipAddress": "::1",
        "deviceId": "test-device-123",
        "responseTime": 150
      },
      "timestamp": "2026-04-23T13:35:00.000Z"
    },
    {
      "eventType": "ZONE_UNLOCK",
      "userId": "...",
      "zoneId": "...",
      "status": "SUCCESS",
      "metadata": {
        "zoneCode": "DEMO_HANOI_OLD_QUARTER",
        "creditAmount": 500,
        "responseTime": 200
      },
      "timestamp": "2026-04-23T13:34:00.000Z"
    }
  ]
}
```

#### 7.3. System Health

**Request:**
```bash
curl -X GET http://localhost:3000/api/v1/admin/monitoring/health \
  -H "Authorization: Bearer ADMIN_TOKEN_HERE"
```

**Kết quả mong đợi:**
```json
{
  "success": true,
  "data": {
    "healthy": true,
    "checks": {
      "unlockSuccessRate": true,
      "audioSuccessRate": true,
      "apiLatencyP95": true,
      "errorRate": true
    },
    "metrics": {
      "scansPerMinute": 5,
      "unlockSuccessRate": 100,
      "audioSuccessRate": 100,
      "apiLatency": {
        "p50": 120,
        "p95": 210,
        "p99": 350
      },
      "errorRate": 0
    }
  }
}
```

---

## 🎯 CHECKLIST TEST

### ✅ Authentication
- [ ] Đăng nhập user thành công
- [ ] Đăng nhập admin thành công
- [ ] Đăng nhập sai password → lỗi 401

### ✅ Geospatial Query
- [ ] Tìm POI gần Hồ Hoàn Kiếm
- [ ] Tìm POI gần Văn Miếu
- [ ] Kết quả sắp xếp theo khoảng cách

### ✅ QR Scan + Event Logging
- [ ] Tạo QR token (admin)
- [ ] Quét QR thành công (user)
- [ ] Event `QR_SCAN` được ghi vào database
- [ ] Quét QR với token hết hạn → lỗi 401

### ✅ Purchase + Event Logging
- [ ] Xem wallet balance
- [ ] Mua zone thành công
- [ ] Balance giảm đúng số tiền
- [ ] Event `ZONE_UNLOCK` được ghi
- [ ] Event `CREDIT_DEBIT` được ghi
- [ ] Mua lại zone đã mua → lỗi 400

### ✅ Rate Limiting
- [ ] IP rate limit (20/min) hoạt động
- [ ] Device rate limit (20/min) hoạt động
- [ ] User rate limit (10/min) hoạt động
- [ ] Request thứ 21 bị chặn với 429

### ✅ Daily QR Quota
- [ ] Free user quét được 20 QR/ngày
- [ ] Quét lần thứ 21 → lỗi quota exceeded
- [ ] Premium user quét không giới hạn

### ✅ Monitoring (Admin)
- [ ] Current metrics trả về dữ liệu thật
- [ ] Recent events hiển thị QR_SCAN
- [ ] Recent events hiển thị ZONE_UNLOCK
- [ ] System health check hoạt động
- [ ] Non-admin không truy cập được → 403

---

## 🐛 DEBUG

### Nếu server không khởi động:

```bash
# Kiểm tra MongoDB connection
curl http://localhost:3000/api/v1/health

# Xem logs
npm start

# Kiểm tra port 3000 có bị chiếm không
netstat -ano | findstr :3000
```

### Nếu không có dữ liệu demo:

```bash
# Chạy lại seeder
node scripts/demo-seed.js

# Kiểm tra MongoDB
# Vào MongoDB Atlas → Browse Collections → vngo_travel
```

### Nếu monitoring không có dữ liệu:

```bash
# Đợi 1 phút để metrics service aggregate
# Hoặc thực hiện vài QR scan để tạo events
```

---

## 📊 KẾT QUẢ MONG ĐỢI

Sau khi test xong, bạn sẽ thấy:

1. **Event Logging hoạt động:**
   - Mỗi QR scan được ghi lại
   - Mỗi purchase được ghi lại
   - Có thể xem qua monitoring endpoints

2. **Metrics Tracking hoạt động:**
   - Scans per minute được tính
   - Unlock success rate được tính
   - API latency được đo

3. **Rate Limiting hoạt động:**
   - IP, Device, User đều bị giới hạn
   - Request thứ 21 bị chặn

4. **Observability hoàn chỉnh:**
   - Admin có thể xem real-time metrics
   - Admin có thể xem recent events
   - System health check hoạt động

---

**Chúc bạn test thành công! 🚀**
