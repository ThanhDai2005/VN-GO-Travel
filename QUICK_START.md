# 🚀 QUICK START - TEST NGAY

## Bước 1: Khởi động Backend

```bash
cd backend
npm install
node scripts/demo-seed.js
npm start
```

Đợi thấy:
```
Server is running on port 3000 [development]
MongoDB connected successfully
[METRICS] Metrics service initialized
```

---

## Bước 2: Chạy Test Script

### Windows:
```bash
test-quick.bat
```

### Linux/Mac:
```bash
bash test-quick.sh
```

---

## Bước 3: Test Thủ Công

### 🔑 Tài khoản:
```
Demo User:
  Email: demo@vngo.com
  Password: demo123

Admin:
  Email: admin@vngo.com
  Password: admin123
```

### 📝 Test nhanh với curl:

#### 1. Đăng nhập:
```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "demo@vngo.com", "password": "demo123"}'
```

Lưu token từ response!

#### 2. Tìm POI gần:
```bash
curl -X GET "http://localhost:3000/api/v1/pois/nearby?lat=21.0285&lng=105.8542&radius=5000" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### 3. Xem Wallet:
```bash
curl -X GET http://localhost:3000/api/v1/purchase/wallet \
  -H "Authorization: Bearer YOUR_TOKEN"
```

#### 4. Monitoring (Admin):
```bash
curl -X GET http://localhost:3000/api/v1/admin/monitoring/metrics/current \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

---

## 🎯 Checklist

- [ ] Server khởi động thành công
- [ ] Đăng nhập demo user OK
- [ ] Đăng nhập admin OK
- [ ] Tìm POI gần OK
- [ ] Xem wallet OK
- [ ] Monitoring metrics OK

---

## 📚 Tài liệu chi tiết

Xem: [docs/HUONG_DAN_TEST.md](docs/HUONG_DAN_TEST.md)

---

**Chúc test thành công! 🚀**
