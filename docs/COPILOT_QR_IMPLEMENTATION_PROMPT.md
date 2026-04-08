# Prompt for GitHub Copilot / AI Coding Assistant

Bạn đang làm việc trên một dự án .NET MAUI tên `MauiApp1` cho app du lịch theo vị trí.  
Nhiệm vụ của bạn là **hoàn thiện QR flow theo đúng docs hiện có**, không tự ý đổi kiến trúc, không tự ý thêm feature ngoài scope.

## Source of truth
**Ưu tiên tuyệt đối:** `docs/QR_MODULE.md` (baseline QR + web + deep link đã đóng băng).

Hãy bám thêm các tài liệu sau khi cần ngữ cảnh lịch sử:

- `04_mvp_scope.md`
- `05_core_business_rules.md`
- `06_simple_architecture.md`
- `07_refactor_plan.md`
- `08_test_checklist.md`
- `09_qr_strategy.md`
- `QR_SEQUENCE_CURRENT.md`
- `QR_SEQUENCE_TARGET.md`

Nếu code hiện tại lệch docs, hãy ưu tiên sửa code để khớp docs trong scope của task.  
Không được tự ý thiết kế lại toàn bộ app.

---

## Current code status you must respect

Dự án hiện đã có:

- `QrScannerPage`
- `QrScannerViewModel`
- `QrResolver`
- `PoiDatabase`
- `MapViewModel`
- `MapPage`
- `PoiDetailPage`

Flow hiện tại đã chạy ở mức cơ bản:

1. mở scanner trong app
2. scan QR
3. parse payload
4. resolve local POI bằng `Code`
5. mở `PoiDetailPage`

Bạn phải **giữ flow này ổn định**, không được thay sang flow khác kiểu scan xong nhảy thẳng map nếu chưa có yêu cầu rõ ràng.

---

## Important business rules

1. QR là kênh truy cập POI bổ sung, không thay thế geofence.
2. Lõi hệ thống vẫn là `Code -> POI`.
3. Sau khi scan thành công, flow mặc định là:
   - mở `PoiDetailPage`
   - từ detail user mới chọn nghe narration hoặc mở map
4. Không được làm phát audio chồng nhau.
5. Nếu manual play từ detail được kích hoạt, nó có thể stop audio cũ rồi phát audio mới.
6. Nếu QR sai format hoặc `Code` không tồn tại local, phải báo lỗi rõ ràng.
7. Parser phải chuẩn hóa mọi đầu vào về `Code`.

---

## Your implementation tasks

### Task 1 — Fix parser bug safely
Trong `QrResolver`, hiện có bug parse order:

- `poi://CODE` có thể bị match nhầm bởi `poi:`

Hãy sửa theo hướng:
- check `poi://` trước
- rồi mới check `poi:`

Không đổi public contract nếu chưa cần thiết.

### Task 2 — Extend parser for link-based QR
Mở rộng `QrResolver.Parse()` để hỗ trợ thêm các định dạng:

- `https://your-domain/p/CODE`
- `https://your-domain/poi/CODE`

Yêu cầu:
- parse được path segment cuối cùng thành `Code`
- normalize uppercase
- chỉ chấp nhận format hợp lệ
- nếu URL không đúng pattern thì trả lỗi hợp lệ

### Task 3 — Keep navigation stable
Giữ nguyên nguyên tắc:
- scan thành công -> mở `PoiDetailPage`
- không nhảy map trực tiếp
- không push page dư
- không tạo flow chồng chéo

Nếu cần chỉnh `QrScannerViewModel`, chỉ chỉnh tối thiểu để code rõ hơn và ổn định hơn.

### Task 4 — Prepare for future deep link reuse
Refactor ở mức vừa đủ để sau này deep link có thể dùng lại cùng logic resolve.

Mục tiêu:
- tránh duplicate logic parse/resolve
- có thể tách helper nếu thật sự cần
- nhưng không được over-engineer

### Task 5 — Add focused logging
Thêm debug logs gọn, có prefix rõ ràng như:
- `[QR-PARSE]`
- `[QR-NAV]`
- `[QR-DEEPLINK]`

Không thêm log rác.

### Task 6 — Do not break existing map flow
Không tự ý thay đổi mạnh `MapPage` / `MapViewModel`.
Chỉ chỉnh nếu cần để:
- `OpenOnMap` từ detail focus đúng POI
- không push stack bất thường

---

## Constraints

- Không đổi kiến trúc toàn bộ dự án.
- Không thay tech stack.
- Không thêm backend.
- Không thêm landing page thật.
- Không thêm deferred deep link thật.
- Không tự ý thay đổi UI lớn.
- Không xóa flow hiện tại đang chạy được.

---

## Expected result

Sau khi code xong, hệ thống phải đạt tối thiểu:

1. parse được:
   - `poi:HO_GUOM`
   - `poi://HO_GUOM`
   - `HO_GUOM`
   - `https://your-domain/p/HO_GUOM`
   - `https://your-domain/poi/HO_GUOM`

2. scan xong mở đúng `PoiDetailPage`

3. nếu `Code` không có trong SQLite local:
   - báo lỗi rõ ràng
   - không crash

4. từ detail:
   - play narration thủ công được
   - open on map hoạt động ổn định

5. không làm hỏng geofence flow hiện có

---

## Output format you must follow

Khi thực hiện, hãy trả lời theo đúng cấu trúc sau:

1. **Files to change**
2. **Why each file changes**
3. **Exact code changes**
4. **Regression risks**
5. **Manual test checklist**
6. **What is intentionally NOT changed**

---

## Final instruction
Hãy hành động như một kỹ sư đang bảo trì một codebase đã có người dùng thử nghiệm, không phải người viết lại từ đầu.

Ưu tiên:
- an toàn
- tối thiểu thay đổi
- đúng business rules
- đúng sequence docs
- dễ review
