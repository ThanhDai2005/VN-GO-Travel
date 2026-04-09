# Sequence Diagram — Các luồng nghiệp vụ chính VN-GO Travel (Cập nhật)

Tài liệu này mô tả các luồng xử lý quan trọng nhất trong ứng dụng: Theo dõi GPS, Nhập liệu POI (QR/Link) và Dịch thuật.

## 1. Luồng theo dõi vị trí GPS & Trigger âm thanh

Hệ thống sử dụng một vòng lặp kiểm tra mỗi 5 giây, có sự phối hợp với `AppState` để tránh làm phiền người dùng khi đang mở modal.

```mermaid
sequenceDiagram
    participant LS as LocationService
    participant GS as GeofenceService
    participant AS as AppState
    participant AUD as AudioService

    loop Mỗi 5 giây
        LS->>GS: CheckLocationAsync(currentLocation)
        GS->>AS: Kiểm tra IsModalActive?
        alt IsModalActive == true
            GS-->>LS: Bỏ qua (User đang bận)
        else IsModalActive == false
            GS->>GS: Tính khoảng cách tới các POI
            alt Có POI trong vùng và hết Cooldown
                GS->>AUD: SpeakAsync(shortNarration)
                AUD-->>User: 🔊 Phát thuyết minh
            end
        end
    end
```

---

## 2. Luồng nhập liệu POI (QR / Deep Link / Manual)

Tất cả các con đường đều dùng chung một hành lang điều phối để đảm bảo tính ổn định.

```mermaid
sequenceDiagram
    actor User
    participant QRC as PoiEntryCoordinator
    participant QR as QrResolver
    participant NS as NavigationService
    participant DB as PoiDatabase

    User->>QRC: Gửi mã (URL/Manual/Scan)
    QRC->>QR: Parse(payload)
    QR-->>QRC: Trả về Code (đã chuẩn hóa)
    QRC->>DB: Kiểm tra POI tồn tại?
    DB-->>QRC: Có POI
    QRC->>NS: NavigateToAsync(route: Map hoặc Detail)
    Note over NS: Acquire Semaphore (Chống trùng lặp)
    NS->>AppShell: GoToAsync(route)
```

---

## 3. Luồng dịch thuật nội dung POI

Khi chuyển sang ngôn ngữ chưa có sẵn, hệ thống sẽ ưu tiên lấy từ Cache trước khi gọi API.

```mermaid
sequenceDiagram
    participant VM as ViewModel
    participant PTS as PoiTranslationService
    participant DB as PoiDatabase
    participant LP as LangblyProvider

    VM->>PTS: GetOrTranslateAsync(code, targetLang)
    Note over PTS: Acquire Lock per-Code (ConcurrentDictionary)
    PTS->>DB: Tìm trong bảng cache?
    alt Có trong Cache
        DB-->>PTS: Trả về bản dịch
    else Không có trong Cache
        PTS->>LP: TranslateAsync(rawContent)
        LP-->>PTS: Kết quả dịch máy
        PTS->>DB: Lưu vào cache (Upsert)
    end
    PTS-->>VM: Trả về POI đã được dịch
```
