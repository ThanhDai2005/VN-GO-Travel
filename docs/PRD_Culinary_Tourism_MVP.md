# PRD — Hệ Thống Du Lịch Ẩm Thực Quận 4 (MVP)

> Tài liệu PRD mức định hướng sản phẩm (draft/historical).  
> Có thể khác phạm vi runtime hiện tại của app MAUI; không dùng làm contract kỹ thuật triển khai.

## 1. Thông tin tài liệu
- **Tên sản phẩm:** Hệ Thống Du Lịch Ẩm Thực Quận 4
- **Phiên bản PRD:** v0.1
- **Trạng thái:** Draft
- **Định dạng:** Markdown
- **Nguồn xây dựng:** Tài liệu kiến trúc/presentation hệ thống do người dùng cung cấp

---

## 2. Tóm tắt sản phẩm
Hệ Thống Du Lịch Ẩm Thực Quận 4 là một nền tảng du lịch ẩm thực theo vị trí, tập trung vào trải nghiệm khám phá các điểm ăn uống (POI) tại Quận 4, TP.HCM thông qua bản đồ tương tác, geofence, thuyết minh âm thanh đa ngôn ngữ và khả năng hoạt động offline-first.

Phiên bản MVP cần ưu tiên giải quyết bài toán cốt lõi sau:
1. Người dùng mở ứng dụng và xem được các POI trên bản đồ.
2. Ứng dụng xác định vị trí người dùng, phát hiện khi người dùng đi vào vùng geofence của POI.
3. Ứng dụng phát narration/audio phù hợp theo ngôn ngữ đã chọn.
4. Ứng dụng vẫn sử dụng được trong điều kiện mạng yếu hoặc mất mạng ở mức chấp nhận được.

Ngoài lõi trải nghiệm người dùng cuối, hệ thống còn có khu vực quản trị nội dung và cổng cho chủ quán nhằm hỗ trợ vận hành và mở rộng dữ liệu theo thời gian.

---

## 3. Bối cảnh và vấn đề cần giải quyết
Khách tham quan, đặc biệt là khách mới đến khu vực Quận 4 hoặc khách quốc tế, thường gặp khó khăn trong việc:
- Biết quán nào đáng chú ý trong khu vực đang đi qua.
- Hiểu nhanh điểm đặc sắc của từng địa điểm ăn uống.
- Truy cập thông tin khi mạng yếu, di chuyển ngoài đường hoặc không muốn thao tác quá nhiều trên điện thoại.
- Tiếp cận nội dung bằng ngôn ngữ phù hợp.

Sản phẩm này giải quyết vấn đề bằng cách biến việc đi bộ/di chuyển trong Quận 4 thành một trải nghiệm “đi tới đâu, nghe giới thiệu tới đó”, kết hợp bản đồ, vị trí thời gian thực, audio và dữ liệu offline.

---

## 4. Mục tiêu sản phẩm
### 4.1. Mục tiêu kinh doanh / học thuật
- Xây dựng một MVP có thể demo tốt và có tính ứng dụng thực tế.
- Chứng minh năng lực thiết kế một hệ thống full-stack offline-first có geofence và audio đa ngôn ngữ.
- Tạo nền tảng có thể mở rộng sang các quận/khu vực khác hoặc thêm mô hình thương mại sau này.

### 4.2. Mục tiêu người dùng
- Giúp người dùng khám phá ẩm thực Quận 4 thuận tiện hơn.
- Giảm thao tác tìm kiếm thủ công trong quá trình di chuyển.
- Tăng khả năng tiếp cận cho người dùng quốc tế.
- Đảm bảo trải nghiệm vẫn hữu ích khi mất kết nối Internet.

### 4.3. Mục tiêu MVP
- Hiển thị POI trên bản đồ.
- Geofence hoạt động ổn định ở mức đủ tốt cho thực địa.
- Tự động phát thuyết minh khi vào vùng POI.
- Có ít nhất một luồng fallback đáng tin cậy khi audio hoặc mạng gặp sự cố.
- Có công cụ quản trị tối thiểu để thêm/sửa/xóa POI.

---

## 5. Non-goals cho MVP
Các hạng mục sau **không bắt buộc hoàn thiện sâu ở MVP**, dù có thể đã xuất hiện trong thiết kế tổng thể:
- Thanh toán, subscription, voucher.
- Routing nâng cao hoặc server-side geofencing phức tạp.
- Cá nhân hóa sâu theo hồ sơ hành vi người dùng.
- Hệ thống analytics nâng cao, báo cáo BI hoàn chỉnh.
- Bộ AI advisor hoàn thiện cho quy trình biên tập nội dung quy mô lớn.
- Owner portal đầy đủ nghiệp vụ vận hành thương mại.
- Quản lý nội dung cấp enterprise nhiều lớp phê duyệt.

---

## 6. Phân khúc người dùng
### 6.1. Người dùng chính
**Khách tham quan / khách du lịch**
- Muốn khám phá món ăn và địa điểm nổi bật ở Quận 4.
- Có thể là người Việt hoặc khách quốc tế.
- Thường sử dụng điện thoại khi đang di chuyển.

### 6.2. Người dùng phụ
**Quản trị viên nội dung**
- Thêm mới, cập nhật, xóa POI.
- Kiểm tra nội dung audio, hình ảnh, bản dịch.
- Kiểm soát chất lượng dữ liệu và vận hành hệ thống.

**Chủ quán / chủ POI**
- Đăng ký thông tin quán.
- Gửi nội dung đề xuất/chỉnh sửa.
- Theo dõi việc nội dung được duyệt.

---

## 7. User stories trọng tâm
### 7.1. Du khách
- Là một du khách, tôi muốn mở ứng dụng và thấy các POI quanh mình để biết nên khám phá ở đâu.
- Là một du khách, tôi muốn chọn ngôn ngữ để nghe nội dung phù hợp.
- Là một du khách, tôi muốn khi đi vào gần một địa điểm, ứng dụng tự giới thiệu bằng âm thanh mà không cần bấm nhiều.
- Là một du khách, tôi muốn nếu mạng yếu thì ứng dụng vẫn hiển thị dữ liệu và phát được audio ở mức tối thiểu.
- Là một du khách, tôi muốn nội dung ngắn gọn, dễ hiểu và không bị phát lặp lại quá nhiều.

### 7.2. Admin
- Là admin, tôi muốn tạo/sửa/xóa POI để duy trì dữ liệu hệ thống.
- Là admin, tôi muốn nội dung dịch và audio được sinh nền để tiết kiệm thao tác thủ công.
- Là admin, tôi muốn phân quyền người dùng để tránh sửa/xóa sai dữ liệu.

### 7.3. Chủ quán
- Là chủ quán, tôi muốn đăng ký và gửi thông tin quán của mình để được xuất hiện trên ứng dụng.
- Là chủ quán, tôi muốn cập nhật nội dung quán nhưng vẫn cần qua duyệt để đảm bảo chất lượng.

---

## 8. Giá trị cốt lõi của sản phẩm
1. **Khám phá theo vị trí thực tế:** nội dung xuất hiện đúng lúc người dùng đi tới gần địa điểm.
2. **Audio-first:** giảm nhu cầu nhìn màn hình liên tục.
3. **Đa ngôn ngữ:** mở rộng khả năng tiếp cận cho khách quốc tế.
4. **Offline-first:** ứng dụng vẫn hữu ích khi mạng yếu.
5. **Mở rộng được:** kiến trúc cho phép bổ sung quản trị, bản đồ offline, owner portal, AI sau MVP.

---

## 9. Phạm vi MVP
### 9.1. Trong phạm vi
#### A. Trải nghiệm người dùng cuối
- Chọn ngôn ngữ khi khởi động ứng dụng.
- Xem bản đồ và danh sách/marker POI.
- Lấy vị trí người dùng bằng GPS.
- Geofence để phát hiện vào vùng POI.
- Tự động phát narration/audio theo POI.
- Có cơ chế ưu tiên một audio tại một thời điểm để tránh chồng tiếng.
- Có fallback khi audio chính không sẵn sàng.
- Có dữ liệu offline cơ bản qua cache + IndexedDB.

#### B. Dữ liệu nội dung
- CRUD POI cơ bản.
- Mỗi POI có ít nhất: tên, mô tả ngắn, mô tả dài hoặc narration, tọa độ, bán kính geofence, hình ảnh cơ bản, thứ tự ưu tiên.
- Load toàn bộ POI theo ngôn ngữ yêu cầu.
- Fallback nội dung: ngôn ngữ yêu cầu → English → tiếng Việt.

#### C. Đa ngôn ngữ và audio
- Dịch on-demand cho POI chưa có bản dịch.
- Sinh audio từ TTS và lưu cache.
- Có thể dùng audio dựng sẵn nếu đã tồn tại.
- Có local speech synthesis làm fallback cuối.

#### D. Vận hành
- Đăng nhập admin.
- RBAC ở mức đủ dùng cho quản trị dữ liệu.
- Ghi log hành động chính.

### 9.2. Ngoài phạm vi của MVP đầu
- Thanh toán, gói thuê bao, voucher.
- Social features, đánh giá cộng đồng, bình luận.
- AI gợi ý hành trình cá nhân hóa nâng cao.
- Điều phối giao thông, chỉ đường turn-by-turn.
- Bản đồ offline quy mô ngoài Quận 4.
- Tối ưu thương mại cho hàng nghìn POI ngay từ đầu.

---

## 10. Luồng trải nghiệm người dùng chính
### 10.1. Luồng mở app
1. Người dùng mở ứng dụng.
2. Service Worker được đăng ký.
3. Người dùng chọn ngôn ngữ.
4. Ứng dụng tải dữ liệu offline sẵn có từ IndexedDB.
5. Ứng dụng gọi API tải dữ liệu POI mới nhất theo ngôn ngữ.
6. Ứng dụng lấy vị trí GPS ban đầu.
7. Ứng dụng hiển thị bản đồ và bắt đầu theo dõi geofence.

### 10.2. Luồng vào vùng POI
1. GPS cập nhật vị trí người dùng.
2. Geofence engine kiểm tra khoảng cách tới các POI.
3. Khi người dùng nằm trong bán kính POI đủ lâu qua debounce, hệ thống xác nhận sự kiện ENTER.
4. Hệ thống chọn POI ưu tiên để phát.
5. Narration engine đẩy audio vào hàng đợi phát.
6. Audio được phát theo tier phù hợp.

### 10.3. Luồng fallback audio
1. Nếu audio dựng sẵn có sẵn, phát ngay.
2. Nếu chỉ có fallback content, gọi on-demand translation + TTS.
3. Nếu chưa có file audio sẵn, gọi cloud TTS stream.
4. Nếu mạng/audio cloud thất bại, dùng local speech synthesis.

---

## 11. Functional requirements
## 11.1. Bản đồ và vị trí
- Hệ thống phải hiển thị marker các POI trên bản đồ.
- Hệ thống phải hiển thị vị trí hiện tại của người dùng khi có quyền truy cập vị trí.
- Hệ thống phải cập nhật vị trí người dùng định kỳ với cơ chế throttle để tránh hao pin quá mức.
- Hệ thống phải hỗ trợ ít nhất chế độ bản đồ cloud trong MVP.
- Hệ thống nên hỗ trợ offline pack/hybrid nếu đã sẵn nền tảng kỹ thuật.

## 11.2. Geofence
- Mỗi POI phải có bán kính geofence.
- Hệ thống phải xác định sự kiện vào vùng dựa trên khoảng cách giữa vị trí người dùng và POI.
- Hệ thống phải có debounce để tránh trigger giả do nhiễu GPS.
- Hệ thống phải có cooldown để không phát lại liên tục khi người dùng dao động quanh biên vùng.
- Hệ thống phải có cơ chế ưu tiên nếu nhiều POI cùng hợp lệ.

## 11.3. Nội dung POI
- Hệ thống phải lưu dữ liệu POI gốc bằng tiếng Việt.
- Hệ thống phải hỗ trợ trả dữ liệu POI theo ngôn ngữ yêu cầu.
- Hệ thống phải có fallback nội dung khi thiếu bản dịch.
- Hệ thống phải cho phép admin thêm/sửa/xóa POI.
- Khi xóa POI, hệ thống phải dọn các localization và tệp liên quan.

## 11.4. Audio / narration
- Mỗi POI nên có narration ngắn phục vụ auto-play.
- Hệ thống phải hỗ trợ phát audio dựng sẵn nếu có.
- Hệ thống phải hỗ trợ sinh audio bằng TTS.
- Hệ thống phải tránh phát chồng nhiều audio cùng lúc.
- Hệ thống phải có fallback local speech synthesis.
- Hệ thống nên cache audio để dùng lại ở các lần sau.

## 11.5. Đa ngôn ngữ
- Người dùng phải chọn được ngôn ngữ trước khi bắt đầu trải nghiệm chính.
- Hệ thống phải hỗ trợ ít nhất các ngôn ngữ mục tiêu đã thiết kế: vi, en, zh, ja, ko.
- Hệ thống phải hỗ trợ hotset để chuẩn bị trước audio/bản dịch cho các POI gần người dùng.
- Hệ thống nên hỗ trợ warmup để chuẩn bị toàn bộ corpus dưới nền.

## 11.6. Offline / PWA
- Ứng dụng phải hoạt động như một PWA.
- Dữ liệu POI phải có bản lưu cục bộ.
- Ứng dụng phải có chiến lược cache cho dữ liệu, audio, hình ảnh.
- Ứng dụng phải có khả năng hoạt động tối thiểu khi mất mạng.
- Ứng dụng nên quản lý cache theo ngôn ngữ để tối ưu dung lượng.

## 11.7. Quản trị
- Admin phải đăng nhập được an toàn.
- Hệ thống phải có phân quyền vai trò cơ bản.
- Admin phải thao tác CRUD POI.
- Hệ thống phải lưu audit log các hành động chính.

## 11.8. Owner portal
- Chủ quán phải đăng ký được tài khoản đề xuất.
- Admin phải duyệt/từ chối đơn đăng ký chủ quán.
- Chủ quán đã được xác minh có thể gửi nội dung đề xuất cho quán của mình.
- Nội dung từ owner phải qua duyệt trước khi hiển thị công khai.

---

## 12. Non-functional requirements
### 12.1. Hiệu năng
- Dữ liệu offline phải hiển thị gần như ngay lập tức nếu đã có cache cục bộ.
- Khi mở app, hệ thống nên tải được vị trí đầu tiên trong khoảng thời gian chấp nhận được.
- Trigger geofence phải ổn định, tránh trễ quá mức gây mất ngữ cảnh trải nghiệm.
- Audio ưu tiên phải phát với độ trễ thấp khi file đã cache.

### 12.2. Độ tin cậy
- Hệ thống phải có nhiều tầng fallback cho nội dung và audio.
- Người dùng không nên gặp màn hình trống khi mất mạng.
- Việc thiếu bản dịch không được làm hỏng trải nghiệm toàn bộ.

### 12.3. Khả năng mở rộng
- Kiến trúc phải cho phép thêm POI, thêm ngôn ngữ và thêm module mới.
- Nên tách biệt tương đối rõ content, audio, localization, admin, maps.

### 12.4. Bảo mật
- Xác thực admin phải an toàn.
- JWT secret và các khóa nhạy cảm không được dùng giá trị mặc định khi chạy thực tế.
- PII của chủ quán phải được mã hóa khi lưu trữ.
- Hệ thống phải có phân quyền vai trò rõ ràng.
- Hệ thống bản đồ offline phải chặn path traversal cho file tĩnh.

### 12.5. Bảo trì
- Mỗi module phải có trách nhiệm tương đối rõ.
- API, dữ liệu POI và logic geofence nên được kiểm thử độc lập.
- Hệ thống nên có log vận hành để debug.

---

## 13. Kiến trúc sản phẩm ở mức PRD
### 13.1. Thành phần chính
- **Frontend PWA:** React + Vite PWA
- **Backend API:** FastAPI
- **Database:** MongoDB
- **Map:** MapLibre + PMTiles
- **Audio:** Edge-TTS + local speech synthesis fallback
- **Localization:** on-demand + hotset + warmup
- **Auth/Admin:** JWT + RBAC + audit logs

### 13.2. Module lõi cần phản ánh trong PRD
- content
- audio
- admin
- ai_advisor
- localization
- maps

Lưu ý: trong PRD, các module này chỉ nên được trình bày như các **năng lực sản phẩm**, không sa đà vào quá nhiều chi tiết code-level.

---

## 14. Dữ liệu cốt lõi
### 14.1. POI
Mỗi POI tối thiểu cần có:
- ID
- Tên
- Tọa độ
- Bán kính geofence
- Mô tả/narration gốc
- Hình ảnh
- Trạng thái hiển thị
- Độ ưu tiên audio

### 14.2. Localization
Mỗi localization nên có:
- poi_id
- ngôn ngữ
- tên đã dịch
- mô tả/narration đã dịch
- audio_url
- cờ fallback hay không

### 14.3. User / role
- Admin user
- Owner user
- Role
- Permission set

---

## 15. Ràng buộc và giả định
### 15.1. Ràng buộc
- GPS trên thiết bị di động có thể nhiễu.
- Kết nối mạng ngoài thực địa không ổn định.
- Tài nguyên lưu trữ thiết bị có giới hạn.
- Audio đa ngôn ngữ sinh động nhưng cần kiểm soát chi phí.

### 15.2. Giả định
- Dữ liệu POI ban đầu có thể nhập tay ở quy mô nhỏ.
- Khu vực mục tiêu ban đầu giới hạn ở Quận 4.
- Khối lượng người dùng MVP chưa quá lớn.
- Chất lượng bản dịch máy ở mức đủ dùng cho MVP, sẽ có bước rà soát thủ công nếu cần.

---

## 16. Rủi ro sản phẩm
### 16.1. Rủi ro trải nghiệm
- GPS trigger sai hoặc trễ làm người dùng khó tin tưởng.
- Audio phát lặp hoặc phát sai POI gây khó chịu.
- Mạng yếu làm chậm on-demand translation/TTS.

### 16.2. Rủi ro kỹ thuật
- Cache offline phình to vượt quota thiết bị.
- Quản lý nhiều ngôn ngữ khiến logic fallback phức tạp.
- Geofence cạnh tranh giữa nhiều POI gần nhau.

### 16.3. Rủi ro nội dung
- Dữ liệu POI không đủ hấp dẫn hoặc thiếu nhất quán.
- Bản dịch máy không tự nhiên.
- Audio giọng đọc không đồng đều giữa các ngôn ngữ.

---

## 17. Chỉ số thành công đề xuất cho MVP
### 17.1. Chỉ số kỹ thuật
- Tỷ lệ trigger geofence đúng trong test thực địa đạt mức chấp nhận được.
- Tỷ lệ phát audio thành công khi vào vùng POI cao.
- Tỷ lệ tải được dữ liệu POI khi offline từ cache đạt gần như tuyệt đối nếu đã warm trước.

### 17.2. Chỉ số trải nghiệm
- Người dùng có thể hoàn thành luồng “mở app → chọn ngôn ngữ → đi vào POI → nghe audio” một cách mượt.
- Số thao tác tay cần thiết để nghe nội dung là tối thiểu.
- Người dùng không bị lạc hoặc rối khi chuyển trạng thái online/offline.

### 17.3. Chỉ số vận hành
- Admin thêm mới/chỉnh sửa/xóa POI thành công.
- Localization và audio generation nền hoàn thành ổn định cho tập POI mẫu.

---

## 18. Release plan đề xuất
### Phase 1 — Core MVP
- Hiển thị bản đồ
- CRUD POI cơ bản
- GPS + geofence cơ bản
- Auto narration cơ bản
- Một ngôn ngữ phụ ngoài tiếng Việt
- Cache offline dữ liệu cơ bản

### Phase 2 — MVP hoàn thiện hơn
- 5 ngôn ngữ mục tiêu
- Hotset + on-demand translation/TTS
- Audio fallback nhiều tầng
- Admin auth + RBAC
- Audit log

### Phase 3 — Near-production MVP
- Warmup toàn bộ corpus
- Audio pack / map pack offline
- Owner registration + submission flow
- AI advisor hỗ trợ nội dung

---

## 19. Acceptance criteria mức sản phẩm
### 19.1. Với người dùng cuối
- Người dùng mở app, chọn ngôn ngữ và thấy POI trên bản đồ.
- Khi đi vào gần một POI hợp lệ, ứng dụng phát narration phù hợp.
- Nếu thiếu audio dựng sẵn, hệ thống vẫn có cách fallback hợp lệ.
- Nếu mất mạng sau khi đã có dữ liệu cục bộ, ứng dụng vẫn hiển thị nội dung ở mức tối thiểu.

### 19.2. Với admin
- Admin đăng nhập được.
- Admin tạo được POI mới với dữ liệu tối thiểu.
- Admin chỉnh sửa/xóa được POI.
- Hệ thống lưu log hành động quan trọng.

### 19.3. Với owner
- Owner đăng ký được.
- Admin duyệt được owner.
- Owner đã duyệt gửi được đề xuất nội dung.

---

## 20. Danh sách mở cần làm rõ thêm sau PRD
1. MVP chính xác có cần owner portal ngay đợt đầu hay không.
2. Tập POI ban đầu là bao nhiêu điểm.
3. Ngôn ngữ nào là bắt buộc ở release đầu.
4. UI danh sách POI ngoài bản đồ có cần ngay không.
5. Có cần analytics người dùng từ MVP hay để sau.
6. Mức độ hoàn thiện của map offline pack ở mốc đầu tiên.
7. Tiêu chuẩn biên tập narration ngắn và narration dài.

---

## 21. Phiên bản PRD rút gọn cho định hướng triển khai
Nếu ưu tiên làm thật chắc theo hướng MVP thực dụng, thứ tự nên là:
1. **POI data model + CRUD admin**
2. **Map + hiển thị POI + lấy GPS**
3. **Geofence engine ổn định**
4. **Narration/audio pipeline tối thiểu**
5. **Fallback content/audio**
6. **Offline cache dữ liệu**
7. **Hotset/warmup đa ngôn ngữ**
8. **RBAC, owner portal, AI advisor**

---

## 22. Ghi chú nguồn
PRD này được biên tập lại từ tài liệu kiến trúc/presentation của hệ thống, trong đó mô tả các thành phần như: 6 module backend chính, geofence với debounce/cooldown, 4-tier hybrid audio, 3-tier content fallback, cơ chế hotset/warmup, offline-first PWA, map pack PMTiles, admin/auth/RBAC và owner portal. Những chi tiết đó đã được chuyển hóa từ góc nhìn kỹ thuật sang góc nhìn yêu cầu sản phẩm để phù hợp với tài liệu PRD.
