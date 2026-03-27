# 1. Problem and Goal

## Problem
Người dùng khi tham quan hoặc khám phá địa điểm không tiện đọc nhiều nội dung trên màn hình trong lúc di chuyển.
Ứng dụng cần tự động phát thuyết minh khi người dùng đến gần một địa điểm quan tâm (POI).

## Goal
Xây dựng ứng dụng đa ngôn ngữ trên .NET MAUI có thể:
- theo dõi vị trí người dùng
- phát hiện khi người dùng vào gần POI
- phát thuyết minh bằng TTS hoặc audio có sẵn
- hoạt động được cả khi offline ở mức cơ bản

## Initial Scope
- MAUI app
- GPS tracking
- Geofence theo khoảng cách
- TTS / audio
- SQLite lưu POI offline
- Map hiển thị vị trí và POI

## Out of Scope for Now
- AI API
- CMS web
- analytics nâng cao
- cá nhân hóa
- backend phức tạp