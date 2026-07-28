Triển khai AI fallback sang địa điểm tùy chọn
Tóm tắt
Thống nhất BE là nguồn duy nhất quyết định Venue match. Nếu AI không match chắc chắn với Venue trong DB, hệ thống giữ dữ liệu AI dưới dạng custom-location snapshot thay vì bỏ dữ liệu hoặc chỉ lưu chuỗi location. Không tự tạo Venue và chưa geocode trong lần triển khai này.
Thay đổi chính
BE: Extract và match Venue
Loại venueId khỏi schema đầu ra dành cho Gemini; không bao giờ tin ID hoặc placeId do model sinh.
Chỉ gán venueId sau khi findMatchingVenue() tìm được Venue đạt ngưỡng hiện tại.
Khi không match, giữ nguyên location và venue { name, address, district, city... }; bảo đảm venueId là undefined.
Giữ response /ai/extract-session tương thích ngược. Invariant mới:Có venueId: Venue đã được BE xác minh.
Không có venueId nhưng có venue/location: ứng viên custom location.

FE: Tạo kèo từ bài thường
Mở rộng ExtractedSessionData để nhận location và đầy đủ district/city cần dùng.
Thay venue handler bằng resolver xác định rõ hai nhánh:Có venueId: đặt locationType=VENUE, chọn Venue và xóa toàn bộ custom-location cũ.
Không có venueId: đặt locationType=CUSTOM, xóa Venue đã chọn và điền:tên: venue.name, fallback location, cuối cùng venue.address;
địa chỉ: venue.address nếu khác tên;
khu vực: ưu tiên newDistrict/newCity, fallback district/city;
xóa placeId và toạ độ vì chưa được xác minh.


Xóa client-side fuzzy auto-match và file helper nếu không còn consumer. User vẫn có thể tìm/chọn Venue bằng select hiện tại.
Hiện cảnh báo i18n trong phần địa điểm: AI không tìm thấy sân trong Vmito và user cần kiểm tra tên/địa chỉ. Cảnh báo có thể đóng và tự biến mất khi user chuyển sang Venue.
Xử lý pending AI data sau khi việc tải Venue kết thúc, kể cả danh sách Venue rỗng hoặc lỗi, để custom fallback không bị kẹt.
Bổ sung message tương ứng cho vi, en, cn; giữ UI trong client form hiện hữu, không thêm route hoặc Server Action.
BE: Bài Facebook
Trong createCrawledSession, xác minh lại matched Venue trước khi liên kết.
Nếu Venue hợp lệ: lưu venueId và để toàn bộ customLocation* là null.
Nếu không match hoặc ID không còn tồn tại:lưu customLocationName, customLocationAddress, district/city theo cùng quy tắc fallback của FE;
giữ location = customLocationName để tương thích code cũ;
đưa tên, địa chỉ và khu vực vào searchTerms;
để customLocationPlaceId/Lat/Lng là null.

Thêm data-only migration idempotent cho session crawler cũ chưa có Venue: lấy location làm customLocationName khi snapshot còn trống. Không cố tách lại địa chỉ từ chuỗi legacy.
Không gọi Google Places/Geocoding và không làm chậm webhook trong phiên bản này.
Test và tiêu chí nghiệm thu
Gemini service:match chắc chắn trả canonical Venue và venueId;
match yếu giữ dữ liệu extract nhưng không trả venueId;
venueId/placeId do model bịa không được sử dụng.

FE resolver/hook:Venue match chọn đúng Venue và xóa custom state;
không match tự mở custom editor, điền đúng tên/địa chỉ/khu vực;
chỉ có top-level location vẫn tạo custom location hợp lệ;
không còn trường hợp FE tự chọn Venue gần giống;
pending data vẫn được xử lý khi danh sách Venue rỗng.

Facebook crawler:match thành công lưu Venue và không lưu custom snapshot;
không match lưu đầy đủ custom snapshot;
chỉ có free-form location vẫn import được;
Venue ID không hợp lệ fallback sang custom thay vì lỗi foreign key.

Chạy Jest BE liên quan, unit test FE mới, i18n:check, type/build của cả FE và BE.
Giả định đã khóa
Bài thường tự động chuyển sang custom location và yêu cầu user kiểm tra trước khi submit.
BE là nguồn match duy nhất; FE không fuzzy auto-match lần hai.
Custom location không tạo Venue mới trong directory.
Chưa geocode tự động; địa chỉ AI là text chưa xác minh.
Luồng chỉnh sửa kèo tiếp tục dùng snapshot custom-location hiện có và không bị thay đổi contract.