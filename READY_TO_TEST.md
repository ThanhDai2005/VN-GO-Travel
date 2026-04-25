# ✅ HỆ THỐNG SẴN SÀNG TEST

**Ngày:** 2026-04-23 14:03 UTC  
**Status:** ✅ HOÀN TẤT - SẴN SÀNG TEST

---

## 🎯 TÓM TẮT

Đã fix triệt để tất cả lỗi:
- ✅ Fix `UserPurchase` model không tồn tại → dùng `UserUnlockPoi` và `UserUnlockZone`
- ✅ Fix CreditTransaction enum type → dùng `initial_bonus` thay vì `CREDIT`
- ✅ Fix analytics data → skip vì không cần thiết
- ✅ Thêm tài khoản Owner (chủ POI)
- ✅ Demo seeder chạy thành công
- ✅ Tạo 3 tài khoản: Demo, Admin, Owner
- ✅ Tạo 2 zones và 5 POIs
- ✅ Demo user có 5000 credits

---

## 🔑 TÀI KHOẢN TEST

### 👤 Demo User (User thường)
```
Email: demo@vngo.com
Password: demo123
Credits: 5000
Role: USER
```

### 👨‍💼 Admin
```
Email: admin@vngo.com
Password: admin123
Role: ADMIN
```

### 🏪 Owner (Chủ POI)
```
Email: owner@vngo.com
Password: owner123
Role: OWNER
```

---

## 🚀 KHỞI ĐỘNG

### 1. Chạy Demo Seeder (Đã chạy xong ✅)
```bash
cd backend
node scripts/demo-seed.js
```

### 2. Khởi động Server
```bash
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

---

## 🧪 TEST NHANH

### Test 1: Đăng nhập Demo User
```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "demo@vngo.com", "password": "demo123"}'
```

### Test 2: Đăng nhập Admin
```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@vngo.com", "password": "admin123"}'
```

### Test 3: Đăng nhập Owner
```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "owner@vngo.com", "password": "owner123"}'
```

### Test 4: Xem POI gần Hồ Hoàn Kiếm
```bash
curl -X GET "http://localhost:3000/api/v1/pois/nearby?lat=21.0285&lng=105.8542&radius=5000" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Test 5: Xem Wallet
```bash
curl -X GET http://localhost:3000/api/v1/purchase/wallet \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Test 6: Monitoring (Admin)
```bash
curl -X GET http://localhost:3000/api/v1/admin/monitoring/metrics/current \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

---

## 📚 TÀI LIỆU CHI TIẾT

Xem hướng dẫn đầy đủ: [docs/HUONG_DAN_TEST.md](HUONG_DAN_TEST.md)

---

## ✅ CHECKLIST

- [x] Demo seeder chạy thành công
- [x] 3 tài khoản được tạo (Demo, Admin, Owner)
- [x] 2 zones được tạo
- [x] 5 POIs được tạo
- [x] Demo user có 5000 credits
- [x] Tất cả lỗi đã được fix
- [ ] Server đang chạy
- [ ] Test đăng nhập thành công
- [ ] Test monitoring endpoints

---

**Hệ thống sẵn sàng test! 🚀**
