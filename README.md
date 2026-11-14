# Thư viện tài liệu

Web lưu trữ tài liệu học tập (TanStack Start + React + Vite, deploy Vercel).

## Chạy local
```bash
npm install
npm run dev      # http://localhost:8080
npm run build
```

## Giao diện
- Phong cách Pixel Fantasy trung tính: nền kem, tím khoáng, xanh ngọc và ánh vàng; hỗ trợ cả sáng/tối.
- Bộ linh thú pixel SVG: rồng, phượng hoàng, kỳ lân, Huyền Vũ, sư tử, slime, mèo đêm và gấu trúc; có thêm pha lê, trăng và nấm trang trí.
- Không sử dụng minh họa nhân vật dạng người; biểu tượng hồ sơ dùng dấu chân.
- Thanh điều hướng dưới: Trang chủ / Môn / Ôn tập / Tôi.
- Khung chờ (skeleton) khi tải, màn trống có hướng dẫn, icon theo loại file.
- Chế độ tối: Theo máy / Sáng / Tối, chọn ở tab Tôi (lưu trên từng thiết bị).

## Bảng xếp hạng, điểm và ẩn danh
- Điểm làm đề được lưu: đề HTML gửi kết quả về trang cha (`postMessage`). Mỗi đề tính **điểm cao nhất (%)**, bảng xếp hạng cộng điểm cao nhất của mọi đề. Làm lại để phá kỷ lục, làm thêm đề để cộng điểm. Chủ web không nằm trong bảng và làm thử không được lưu.
- Cách đề báo điểm (chọn một):
  - Gọi `reportQuizResult(score, total)` trong file đề (trang tự có sẵn hàm này khi chạy trong web).
  - Hoặc `parent.postMessage({ type: "quiz-result", score, total }, "*")`.
  - Nếu đề không làm gì cả, trang tự nhận màn kết quả dạng “Kết quả: 8/10” (cần có chữ như “Kết quả”, “Tổng kết”, “Hoàn thành”, “Điểm của bạn” cạnh số `8/10`).
- Thành viên bật "Ẩn danh trên bảng xếp hạng" ở tab Tôi hoặc ngay trong tab Xếp hạng. Người khác chỉ thấy "Ẩn danh".
- Việc che tên làm ở server: tên và tên đăng nhập của người ẩn danh không được gửi cho người khác. Chủ web và chính người đó vẫn thấy tên thật.

## Biệt danh trong bình luận
- Thành viên đặt biệt danh ở tab Tôi. Bình luận hiện biệt danh; chủ web luôn thấy thêm dòng “Tên thật”. Việc che tên làm ở server.
- Biệt danh không trùng nhau và không được dùng các tên dành riêng (owner, admin, chủ web…).

## Yêu thích, sắp xếp, tìm kiếm
- Chạm ngôi sao để lưu tài liệu hoặc đề; danh sách “Đã lưu” nằm ở tab Tôi (đồng bộ giữa các máy).
- Trong mỗi môn có sắp xếp: mới nhất, cũ nhất, tên A-Z, dung lượng, đã lưu trước.
- Tìm kiếm không phân biệt dấu, lọc theo môn, mục và loại file, nhớ 6 từ khóa gần đây.

## Chủ web
- Nút **Sửa** ở mỗi tài liệu: đổi tên và chuyển sang môn khác (lịch sử thống kê cập nhật theo).

## Thông báo và thao tác trên điện thoại
- Tab Môn có chấm báo khi có tài liệu mới (chủ web duyệt hoặc thêm); mỗi môn hiện số “mới” và file mới có nhãn “Mới”. Trạng thái đã xem lưu trên từng máy.
- Vuốt từ trái sang phải để quay lại; chuyển tab giữ nguyên màn và vị trí cuộn của tab đó.

## Migration
Cần chạy `0005_leaderboard_anonymous.sql` và `0006_results_favorites_nickname.sql` (tự chạy khi build/deploy).
