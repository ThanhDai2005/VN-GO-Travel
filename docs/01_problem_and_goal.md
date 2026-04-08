# 1. Problem and Goal

## Problem
Người dùng khi tham quan hoặc khám phá địa điểm không tiện đọc nhiều nội dung trên màn hình trong lúc di chuyển. Ứng dụng cần tự động phát thuyết minh khi người dùng đến gần một địa điểm quan tâm (POI), đồng thời cho phép mở đúng POI theo cách chủ động khi GPS chưa đủ chính xác hoặc khi người dùng muốn truy cập trực tiếp.

## Goal
Xây dựng ứng dụng đa ngôn ngữ trên .NET MAUI có thể:

- theo dõi vị trí người dùng
- phát hiện khi người dùng vào gần POI
- phát thuyết minh bằng TTS hoặc audio có sẵn
- hoạt động được cả khi offline ở mức cơ bản
- mở đúng POI bằng QR trong app
- chuẩn bị nền tảng cho QR dạng link để dùng được cả ngoài app

## Current Project Goal
Trong giai đoạn hiện tại, mục tiêu thực tế nhất là:

1. giữ lõi geofence ổn định
2. hoàn tất QR in-app flow theo hướng production-safe
3. chuẩn hóa docs để AI coding assistant bám đúng nghiệp vụ
4. chuẩn bị sẵn kiến trúc cho link-based QR / deep link mà không phá flow hiện tại

## Initial Scope
- MAUI app
- GPS tracking
- geofence theo khoảng cách
- TTS / audio
- SQLite lưu POI offline
- map hiển thị vị trí và POI
- QR scanner trong app
- POI detail flow sau khi scan

## Out of Scope for Now
- AI API
- CMS web hoàn chỉnh
- analytics nâng cao
- deferred deep linking hoàn chỉnh
- landing page production
- backend phức tạp
