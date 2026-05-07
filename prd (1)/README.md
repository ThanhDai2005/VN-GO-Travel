# PRD Pre-Document Set

## What This Folder Contains

Thư mục này là bộ tiền-PRD theo trạng thái code thực tế hiện tại, gồm:
- `01_problem_and_needs.md`
- `02_erd.md`
- `03_usecase/*`
- `04_activity/*`
- `05_sequence/*`
- `06_class_diagram.md`

Mục tiêu:
- phục vụ phản biện học thuật,
- làm đầu vào cho UML/Mermaid,
- làm nền cho planning/implementation tiếp theo.

## Reading Order Recommended

1. `01_problem_and_needs.md`  
   Nắm bối cảnh, mục tiêu, trade-off và hạn chế thật.
2. `02_erd.md`  
   Hiểu topology dữ liệu và source-of-truth.
3. `03_usecase/*`  
   Xác định actor + chức năng nghiệp vụ.
4. `04_activity/*`  
   Theo luồng xử lý từng feature.
5. `05_sequence/*`  
   Theo tương tác thành phần, kèm thread context/race points.
6. `06_class_diagram.md`  
   Tổng hợp cấu trúc lớp và dependency hotspots.

## How To Convert Into UML (Mermaid)

## Use Case Diagram
- Nguồn: `03_usecase/usecase_overview.md` + `usecase_specifications.md`.
- Bước:
  1. Đặt actor (`Tourist`, `Admin`, `System`).
  2. Ánh xạ mỗi UC thành use case node.
  3. Vẽ include/extend cho các nhánh token scan, premium check, moderation.

## Activity Diagram
- Nguồn: `04_activity/*.md`.
- Bước:
  1. Mỗi bước -> activity node.
  2. Mỗi “Decision” -> diamond condition.
  3. Đảm bảo có nhánh suppress/error, không chỉ happy path.

## Sequence Diagram
- Nguồn: `05_sequence/*.md`.
- Bước:
  1. Khai báo participant theo file.
  2. Chèn message call tuần tự.
  3. Dùng `alt/opt` cho decision và duplicate suppression.
  4. Annotate MainThread/Background bằng note.

## Class Diagram
- Nguồn: `06_class_diagram.md`.
- Bước:
  1. Nhóm class theo package (`ViewModels`, `Services`, `Models`, `Coordinators`).
  2. Vẽ dependency arrows theo mục 6.2.
  3. Gắn note `god-class` cho vùng coupling cao.

## Honesty/Defense Notes

Khi dùng trong bảo vệ:
- Nêu rõ đây là bản “as-is architecture”, không tô hồng.
- Chỉ ra rõ:
  - các thành phần đã chạy ổn định,
  - các điểm còn mâu thuẫn (dual admin stack, duplicate trigger path, lock-based request drop),
  - kế hoạch chuẩn hóa sau đồ án (nếu cần).
