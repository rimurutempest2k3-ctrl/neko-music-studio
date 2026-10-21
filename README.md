# Neko Music Studio

## Studio 2 — 2026-10-21

- Workspace mới giữ nhận diện mint: lưới soạn trung tâm, bảng công cụ thu gọn, bảng thuộc tính và thanh phát bám khi cuộn.
- Công cụ vẽ/chọn/tẩy, kéo nốt theo hai chiều, nâng/hạ nhóm, nhân đôi, sao chép/dán và hoàn tác.
- BPM 20–400 tách khỏi độ chính xác tick. Đổi BPM giữ quan hệ thời gian giữa nốt, khoảng nghỉ và các lần đổi tone; lưu ở độ chính xác 1 ms.
- Nghe thử với ba âm sắc, âm lượng master, máy đếm nhịp và đoạn lặp. Web Audio dùng bộ lập lịch theo cửa sổ thời gian, không tạo trước toàn bộ oscillator của bài.
- Nhập MIDI loại 0/1: chọn track/kênh, chọn nốt cao/thấp khi đồng thời, xem số nốt bị chuyển cao độ. Chưa chuyển sustain pedal, SMPTE hoặc MIDI loại 2.
- Xuất `.nekomusic`, Standard MIDI và WAV mono PCM 44,1 kHz / 16-bit. WAV giới hạn 5 phút / 5.000 nốt để giới hạn bộ nhớ; hai định dạng dữ liệu giữ giới hạn 50.000 nốt.
- Metadata tùy chọn `editor.bpm` giữ nhịp khi mở lại. Android vẫn đọc các trường `ticks_per_second`, `timeline`, `tick`, `keys`, `duration_ticks` như trước và bỏ qua metadata này.
- Trang cộng đồng dùng cùng bảng màu. Giữ tài khoản, bản nháp và thư viện hiện có; không chạy thay đổi schema dữ liệu.
- Bản gốc được giữ nguyên ở `/classic/`, theo tree Git `4d2fdbcb59e80a115ba3a8c5cde17c396c4bce68`. Không sửa file bên trong bản gốc khi nâng cấp Studio.
- Thêm `?test=interaction` hoặc `?test=playback` để dùng bài và danh sách nháp thử riêng. Không đăng bài thử lên cộng đồng.

Kiểm tra đầy đủ: `node --test tests`. Bản này bổ sung kiểm tra MIDI, BPM, WAV, bộ lập lịch, đoạn lặp và liên kết tài nguyên.

Đây là studio giai điệu cho hệ 8 phím Neko. Chưa có ghi microphone, phối nhiều track, VST, automation hiệu ứng hay cộng tác thời gian thực. Âm nghe thử là âm tổng hợp, không phải bản thu nhạc cụ trong game.

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

## Giao diện mint và tài khoản

- Studio và trang cộng đồng dùng cùng bảng màu xanh đen/mint, logo nhân vật bo góc.
- Nút Tài khoản ở góc trên mở đăng nhập, tạo tài khoản, khôi phục mật khẩu, tên hiển thị và đăng xuất ngay tại chỗ.
- Dùng lại hệ thống Supabase cũ: không tạo kho tài khoản mới hay đổi ID của người dùng.
- Người đăng lấy từ tên tài khoản đã xác thực; có thể sửa tên trong khung Tài khoản. Tên mới áp dụng cho bài đăng mới.
- Tài khoản chưa đặt tên dùng phần trước @ của email cho đến khi đặt tên hiển thị.
- Các module dùng chung phiên đăng nhập, cập nhật trạng thái giữa Studio và trang cộng đồng.
- Bản nháp vẫn lưu trên thiết bị; đăng nhập không tự đăng bài.
