# Neko Music Studio

Web soạn nhạc Delta Force cho Neko Auto Music, cùng thư viện nhạc cộng đồng.

Deploy bằng GitHub Pages từ branch main, thư mục root. Không cần build.
Supabase: `cloud/001_music_library.sql` trong dự án Android là migration tương ứng.
Khóa publishable trong cloud.mjs là khóa công khai; không chứa secret hay mật khẩu.
Ai cũng tải được; đăng nhập mới được đăng. RLS giới hạn cập nhật theo chủ bài.
File tối đa 256 KB, tối đa 100 bài/tài khoản. Gỡ bài sử dụng soft-delete.

Đăng nhập bằng email và mật khẩu; có tạo tài khoản, quên mật khẩu và đặt mật khẩu
cho tài khoản dùng liên kết email trước đây. Supabase Auth Site URL và redirect
allowlist cần trỏ đến URL GitHub Pages. Email xác nhận và khôi phục vẫn cần SMTP
cho người dùng ngoài nhóm quản trị nếu máy chủ bật xác nhận email.

- Ba tab riêng: Trình soạn nhạc, Nhạc nháp, Nhạc đã đăng.
- Thư viện cộng đồng ở trang con `community.html`, có đường dẫn riêng. Chuyển từ
  Studio sẽ lưu bài trước; mở bài cộng đồng tạo nháp mới và giữ bài cũ trong nháp.
- Nháp tự lưu trên trình duyệt này; bài đang mở trước đây được chuyển vào danh sách.
  Mở bài khác không ghi đè nháp cũ. Nháp không đồng bộ qua tài khoản hoặc thiết bị.
- Nhạc đã đăng lọc theo tài khoản ở máy chủ, hỗ trợ phân trang và gỡ bài.
- Kéo thân nốt hoặc dùng mũi tên trái/phải để đổi thời điểm, giữ nguyên cao độ;
  mép phải để đổi độ dài. Di chuyển chồng nốt khác bị từ chối; có thể hoàn tác.
- Chọn nhiều bằng nút Chọn nhiều hoặc Ctrl/Shift + nhấp; Ctrl+A chọn toàn bộ.
  Bật Chọn nhiều rồi kéo trên vùng trống để tạo khung chọn như desktop, hoặc giữ
  Shift khi kéo. Ctrl/Shift + kéo thêm nốt vào nhóm đã chọn.
  Sao chép / Ctrl+C, đặt con trỏ rồi Dán / Ctrl+V. Kéo nốt trong nhóm để di chuyển
  cả nhóm, giữ khoảng cách và cao độ tương đối. Nhóm chồng nốt khác bị từ chối.
- Mặc định phát từ thanh cam, dừng rồi phát tiếp từ vị trí hiện tại. Chọn “Phát từ đầu”
  để nghe toàn bài. Đổi tone trước con trỏ được giữ khi nghe từ giữa bài.

Kiểm tra: `node --test tests/studio.test.mjs`; `node --check app.mjs`.
