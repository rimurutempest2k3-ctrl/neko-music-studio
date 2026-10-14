# Neko Music Studio

Web soạn nhạc Delta Force cho Neko Auto Music, cùng thư viện nhạc cộng đồng.

Deploy bằng GitHub Pages từ branch main, thư mục root. Không cần build.
Supabase: `cloud/001_music_library.sql` trong dự án Android là migration tương ứng.
Khóa publishable trong cloud.mjs là khóa công khai; không chứa secret hay mật khẩu.
Ai cũng tải được; đăng nhập mới được đăng. RLS giới hạn cập nhật theo chủ bài.
File tối đa 256 KB, tối đa 100 bài/tài khoản. Gỡ bài sử dụng soft-delete.

Đăng nhập dùng email magic link. Supabase Auth Site URL và redirect allowlist cần trỏ
đến URL GitHub Pages của web. Để gửi thư cho người dùng ngoài nhóm quản trị,
cấu hình custom SMTP hoặc một nhà cung cấp OAuth trong Supabase.
