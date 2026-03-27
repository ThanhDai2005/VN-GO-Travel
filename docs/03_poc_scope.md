# 3. PoC Scope

## Objective
Chứng minh rằng ứng dụng có thể:
1. lấy vị trí GPS
2. xác định POI gần người dùng
3. tự động phát thuyết minh

## Features in PoC
- load danh sách POI từ local JSON / SQLite
- theo dõi vị trí người dùng
- tính khoảng cách đến POI
- trigger khi vào trong bán kính
- phát TTS tiếng Việt
- chống phát lặp bằng cooldown đơn giản

## Not included in PoC
- backend
- tài khoản
- AI
- quản trị CMS
- đa ngôn ngữ đầy đủ
- đồng bộ server

## Success Criteria
- ứng dụng chạy được trên thiết bị/emulator
- vị trí user cập nhật được
- khi user vào gần 1 POI thì app phát thuyết minh
- không bị phát đi phát lại liên tục

## Done Definition cho PoC
app mở được
load được POI
lấy được GPS
vào gần POI thì phát TTS
không phát lặp vô hạn