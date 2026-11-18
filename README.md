# 🚀 TechPicks Review - Đánh Giá Công Nghệ & Thiết Bị Thông Minh (Tech & Smart Gadgets Hub)

Website blog chuyên biệt về **Đánh giá Công nghệ, Thiết bị Thông minh & Tối ưu hóa doanh thu (Monetization & CRO)**, tích hợp sẵn toàn bộ 4 trụ cột kiếm tiền hàng đầu hiện nay.

Hệ thống được thiết kế độc lập tại `C:\Web2`, vận hành trên các cổng **Port 3002 (Website chính)** và **Port 3003 (Admin CMS Studio)**, cho phép chạy song song ổn định mà không bị xung đột với bất kỳ website nào khác.

---

## 🌟 4 Trụ Cột Doanh Thu Tích Hợp Sẵn

### 1. Tiếp thị liên kết Công nghệ (Tech Affiliate Marketing)
- **Nút "Check Price / Xem Giá"**: Nổi bật với hiệu ứng Shimmer tím neon thu hút ánh nhìn, liên kết trực tiếp tới nhà phân phối chính hãng (Apple, Sony, Amazon, Shopee Mall, LazMall).
- **Bảng so sánh thông số & giá đa sàn (Price & Specs Comparison)**: So sánh giá bán thực tế, cấu hình, quà tặng kèm của từng sàn để khách đưa ra quyết định mua hàng nhanh nhất.
- **Hộp Voucher / Coupon Code 1-Click Copy**: Tự động sao chép mã giảm giá (ví dụ: `TECHPICKS15`) vào clipboard và tự động mở tab mua sắm.
- **Box Đánh giá Ưu & Nhược Điểm (Pros & Cons)**: Thiết kế trực quan, phân tích điểm mạnh - điểm yếu chi tiết theo chuẩn lab test.
- **Tuyên bố minh bạch liên kết (FTC & Google Compliance)**: Đầy đủ các thẻ `rel="sponsored nofollow noopener"`.

### 2. Mạng hiển thị quảng cáo (IAB Display Ads)
- **Header Leaderboard Ad (728x90 / 970x90)**: Đặt ngay bên dưới thanh điều hướng, vị trí có CTR cao nhất.
- **In-Article Ad Slot**: Khung quảng cáo theo ngữ cảnh nằm giữa các phần đánh giá chi tiết trong bài viết.
- **Sticky Sidebar Half-Page Ad (300x600)**: Bám theo màn hình khi độc giả cuộn đọc bài test, tương thích Google AdSense, Mediavine, Raptive, Ezoic.
- **Chuyển đổi "Vị trí Ads Demo"**: Nằm trên top bar cho phép xem trước bố cục banner linh hoạt.

### 3. Bài viết tài trợ & Hợp tác nhãn hàng (Sponsored Posts)
- **Huy hiệu "Tài trợ / Sponsored Post"**: Nổi bật trên ảnh bìa bài viết công nghệ.
- **Sponsor Acknowledgement Card**: Hộp ghi nhận đối tác đồng hành kèm link thương hiệu.
- **Trang Media Kit & Báo Giá Hợp Tác (`sponsor.html`)**:
  - Báo giá tài trợ dành riêng cho các hãng công nghệ & phụ kiện thông minh.
  - Form đặt gói booking tự động qua email `support@techpicks.pro`.

### 4. Cửa hàng sản phẩm số & Phụ kiện tuyển chọn (`shop.html`)
- **Cửa hàng số**: Trưng bày Preset màu ảnh công nghệ, Setup Checklist, Ebook hướng dẫn SEO Affiliate, Hướng dẫn xây dựng Smart Home.
- **Modal Thanh Toán Tự Động & Đa Tiền Tệ (USD $ / VND ₫)**:
  - Sinh mã VietQR chuyển khoản ngân hàng tự động.
  - Nhập email để hệ thống gửi liên kết tải tài nguyên ngay lập tức.

---

## 📂 Cấu Trúc Thư Mục Website (`C:\Web2`)

```
C:\Web2\
├── index.html            # Trang chủ: Hero Spotlight, Bài viết nổi bật, Khung Ads, Shop, Newsletter
├── post.html             # Trang chi tiết bài viết (ToC, Bảng so sánh, Coupon, Rating breakdown)
├── shop.html             # Cửa hàng sản phẩm & tài nguyên số (Bộ lọc danh mục, Thanh toán tự động)
├── sponsor.html          # Trang Media Kit & Báo giá tài trợ công nghệ
├── admin.html            # Trang chuyển hướng nhanh vào Admin Studio
├── admin-cms/            # Bộ công cụ Quản trị nội dung & Đăng bài (CMS Studio)
│   ├── index.html        # Giao diện Dashboard quản trị hiện đại
│   ├── admin.css         # CSS riêng cho giao diện Admin
│   └── admin.js          # Logic tạo bài viết mới, chỉnh sửa bài, cấu hình email, ghim bài
├── css/
│   └── custom.css        # Hiệu ứng Shimmer, glow tím, thanh tiến trình đọc ToC, coupon box
├── js/
│   ├── app.js            # Điều khiển Dark/Light mode, Mobile menu, Ticker dự án, Newsletter
│   ├── post.js           # Mục lục tự động (ToC), Reading progress bar, Copy voucher
│   ├── checkout.js       # Giỏ hàng & Modal quét mã VietQR tự động
│   ├── i18n.js           # Bộ dịch đa ngôn ngữ (Tiếng Việt, English, 中文) & Đa tiền tệ ($ / ₫)
│   ├── article-i18n.js   # Đa ngôn ngữ nội dung bài viết
│   └── home-articles.js  # Tự động nạp bài viết trang chủ theo danh mục
├── data/
│   ├── posts.json        # Dữ liệu 36+ bài đánh giá thiết bị thông minh & công nghệ
│   ├── products.json     # Dữ liệu sản phẩm số & phụ kiện
│   ├── pinned_project.json # Cấu hình bài viết tiêu điểm Hero Spotlight
│   ├── ticker_items.json # Tin vắn chạy đầu trang (Top announcement ticker)
│   ├── messages.json     # Lưu trữ tin nhắn liên hệ từ độc giả
│   └── email_config.json # Cấu hình SMTP nhận thông báo
├── server.ps1            # Máy chủ cục bộ phục vụ Website (Port 3002) và Admin CMS (Port 3003)
├── start-server.bat      # Khởi động nhanh Website và Admin bằng 1 click chuột
├── start-admin.bat       # Khởi động Admin CMS Studio bằng 1 click chuột
├── worker.js / _worker.js# Mã nguồn Cloudflare Worker sẵn sàng triển khai Edge
└── wrangler.toml         # File cấu hình Cloudflare Wrangler
```

---

## 🚀 Hướng Dẫn Khởi Động & Sử Dụng

### Cách 1: Chạy máy chủ cục bộ (Khuyến nghị - Đầy đủ tính năng Admin & Lưu trữ)
1. Nhấp đúp chuột vào file **`start-server.bat`** (hoặc file **`start-admin.bat`**) trong thư mục `C:\Web2`.
2. Trình duyệt sẽ tự động mở 2 cổng độc lập:
   - **Website Chính**: [http://localhost:3002](http://localhost:3002)
   - **Admin CMS Studio**: [http://localhost:3003](http://localhost:3003)
3. Bạn có thể đăng nhập vào Admin CMS Studio bằng các tài khoản quản trị mặc định:
   - `xuanlongtran921@gmail.com` / `1532004Long@`
   - `minhthanhcenter@gmail.com` / `thanh123@`

### Cách 2: Mở trực tiếp không cần server
- Mở trực tiếp file `index.html` trong `C:\Web2` bằng bất kỳ trình duyệt nào (Chrome, Edge, Firefox).

### Cách 3: Đưa lên mạng Internet (Hosting Miễn Phí)
- Bạn có thể tải toàn bộ thư mục `C:\Web2` lên **Vercel**, **Netlify**, **Cloudflare Pages** hoặc **GitHub Pages** chỉ với 1 thao tác kéo thả (hoàn toàn miễn phí, hỗ trợ HTTPS và gắn tên miền riêng).
