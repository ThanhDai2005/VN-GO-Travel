# NGROK FIX - QR CODE 404 ERROR

**Date:** 2026-05-05  
**Issue:** HTTP 404 error khi scan QR code  
**Root Cause:** Ngrok tunnel đã hết hạn  
**Status:** ✅ FIXED

---

## 🔍 VẤN ĐỀ

Từ log của bạn:
```
[PRESENCE] Heartbeat failed: 404 The endpoint repugnant-liberty-dragging.ngrok-free.dev is offline.
ERR_NGROK_3200
```

**Nguyên nhân:**
- Mobile app config dùng ngrok tunnel: `https://repugnant-liberty-dragging.ngrok-free.dev`
- Ngrok tunnel này đã hết hạn/offline
- Mobile app không thể kết nối backend → HTTP 404

---

## ✅ ĐÃ FIX

### Fix #1: Tắt Ngrok Mode
**File:** `Configuration/BackendApiConfiguration.cs` (line 23)

**Đã đổi:**
```csharp
private const bool UseNgrokTunnel = false; // Changed from true
```

### Fix #2: Update Local IP
**File:** `Configuration/BackendApiConfiguration.cs` (line 28)

**Đã đổi:**
```csharp
private const string LocalNetworkHost = "192.168.1.8"; // Your current IP
```

---

## 🚀 BẠN CẦN LÀM

### Bước 1: Kiểm Tra Backend Đang Chạy
```bash
cd backend
npm start
# Backend phải chạy ở port 3000
```

### Bước 2: Kiểm Tra Điện Thoại và Laptop Cùng Mạng WiFi
- Laptop: Kết nối WiFi
- Điện thoại: Kết nối cùng WiFi với laptop
- **QUAN TRỌNG:** Phải cùng mạng WiFi!

### Bước 3: Rebuild Mobile App
```bash
# Mobile app cần rebuild để load config mới
dotnet build
# Hoặc rebuild trong Visual Studio
```

### Bước 4: Deploy App Lên Điện Thoại
- Deploy app mới lên điện thoại
- Hoặc chạy từ Visual Studio/VS Code

### Bước 5: Test Lại
1. Mở app trên điện thoại
2. Scan QR code
3. **Kỳ vọng:** Không còn lỗi 404
4. **Kỳ vọng:** Zone POI list hiển thị

---

## 🔄 NẾU VẪN MUỐN DÙNG NGROK

Nếu điện thoại và laptop khác mạng, bạn cần dùng ngrok:

### Bước 1: Chạy Ngrok
```bash
# Terminal mới
ngrok http 3000
```

### Bước 2: Copy URL Mới
Ngrok sẽ hiển thị URL mới, ví dụ:
```
Forwarding  https://abc-def-ghi.ngrok-free.dev -> http://localhost:3000
```

### Bước 3: Update Config
**File:** `Configuration/BackendApiConfiguration.cs`

```csharp
private const bool UseNgrokTunnel = true;
private const string NgrokTunnelUrl = "https://abc-def-ghi.ngrok-free.dev"; // URL mới
```

### Bước 4: Rebuild và Deploy
```bash
dotnet build
# Deploy lên điện thoại
```

---

## 📊 CONFIG HIỆN TẠI

```csharp
UseNgrokTunnel = false
LocalNetworkHost = "192.168.1.8"
BaseUrl = "http://192.168.1.8:3000/api/v1/"
```

**Nghĩa là:**
- Mobile app sẽ gọi API qua local network
- Backend phải chạy ở `http://192.168.1.8:3000`
- Điện thoại và laptop phải cùng WiFi

---

## ⚠️ LƯU Ý

### Nếu IP Thay Đổi
Mỗi khi laptop kết nối WiFi mới, IP có thể thay đổi.

**Kiểm tra IP hiện tại:**
```bash
ipconfig
# Tìm dòng: IPv4 Address
```

**Update config nếu IP khác:**
```csharp
private const string LocalNetworkHost = "IP_MỚI_CỦA_BẠN";
```

### Nếu Firewall Block
Windows Firewall có thể block port 3000.

**Cho phép port 3000:**
1. Windows Defender Firewall
2. Advanced Settings
3. Inbound Rules → New Rule
4. Port → TCP → 3000
5. Allow the connection

---

## 🎯 CHECKLIST

- [x] Tắt ngrok mode
- [x] Update local IP
- [ ] Backend đang chạy (port 3000)
- [ ] Điện thoại và laptop cùng WiFi
- [ ] Rebuild mobile app
- [ ] Deploy app lên điện thoại
- [ ] Test scan QR code
- [ ] Không còn lỗi 404

---

## 🐛 TROUBLESHOOTING

### Vẫn Lỗi 404
1. **Kiểm tra backend:** `curl http://192.168.1.8:3000/api/v1/demo/health`
2. **Kiểm tra WiFi:** Điện thoại và laptop cùng mạng?
3. **Kiểm tra IP:** `ipconfig` có đúng 192.168.1.8?
4. **Kiểm tra firewall:** Port 3000 có bị block?

### Backend Không Accessible
```bash
# Test từ laptop
curl http://192.168.1.8:3000/api/v1/demo/health

# Nếu không work, thử localhost
curl http://localhost:3000/api/v1/demo/health

# Nếu localhost work nhưng IP không work → Firewall issue
```

### App Không Rebuild
```bash
# Clean và rebuild
dotnet clean
dotnet build
```

---

## ✨ TÓM TẮT

**Vấn đề:** Ngrok tunnel cũ đã hết hạn  
**Giải pháp:** Tắt ngrok, dùng local network  
**Yêu cầu:** Điện thoại và laptop cùng WiFi  
**Action:** Rebuild app và test lại  

---

**Status:** ✅ CONFIG UPDATED  
**Next:** Rebuild mobile app và test

---

**End of Fix**
