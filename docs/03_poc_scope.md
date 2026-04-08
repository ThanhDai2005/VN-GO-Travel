# 3. PoC Scope

## Objective
Chứng minh rằng ứng dụng có thể:

1. lấy vị trí GPS
2. xác định POI gần người dùng
3. tự động phát thuyết minh
4. mở đúng POI bằng QR scanner trong app

## Features in PoC
- load danh sách POI từ local JSON / SQLite
- theo dõi vị trí người dùng
- tính khoảng cách đến POI
- trigger khi vào trong bán kính
- phát TTS tiếng Việt / tiếng Anh cơ bản
- chống phát lặp ở mức tối thiểu
- scan QR trong app để mở POI detail

## Not Included in PoC
- backend
- tài khoản
- AI
- quản trị CMS
- deferred deep linking
- landing page
- đồng bộ server

## Current PoC Status
### Đã có
- app mở được
- load được POI
- tra `Code -> POI`
- geofence hoạt động ở mức cơ bản
- QR in-app flow cơ bản đã có:
  - scanner page
  - parser
  - lookup DB
  - điều hướng sang detail

### Chưa chốt
- quy tắc chống trùng giữa geofence audio và QR audio
- link-based QR
- external camera flow
- deep link vào app

## Success Criteria
- ứng dụng chạy được trên thiết bị/emulator
- vị trí user cập nhật được
- khi user vào gần 1 POI thì app phát thuyết minh
- scan QR trong app mở đúng POI detail
- không bị phát đi phát lại liên tục
- không phát chồng audio bất hợp lý

## Done Definition cho PoC
- app mở được
- load được POI
- lấy được GPS
- vào gần POI thì phát TTS
- scan được QR `poi:CODE`
- không phát lặp vô hạn
