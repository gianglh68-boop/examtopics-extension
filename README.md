# ExamTopics Popup Killer

Chrome extension (Manifest V3) cho `examtopics.com`:

- Tắt popup **"This section is not available anymore"** và các overlay tương tự đang chặn nội dung.
- Khôi phục scroll khi trang bị khoá bởi `modal-open` / `overflow: hidden`.
- Thêm nút **◀ Prev / Next ▶** cố định ở góc dưới phải khi đang xem một câu trong `/discussions/<exam>/view/<n>-...` để nhảy nhanh sang câu trước / sau.

## Cài đặt

### Cách 1 - Tải release (khuyến nghị)

1. Vào [Releases](../../releases) và tải `examtopics-extension-vX.Y.Z.zip` mới nhất.
2. Giải nén ra một thư mục bất kỳ.
3. Mở `chrome://extensions`, bật **Developer mode** (góc trên phải).
4. Bấm **Load unpacked** và trỏ tới thư mục vừa giải nén.

### Cách 2 - Clone repo

```bash
git clone https://github.com/gianglh68-boop/examtopics-extension.git
```

Rồi làm bước 3-4 ở trên, trỏ vào thư mục đã clone.

## Cách hoạt động

| File | Vai trò |
| --- | --- |
| `manifest.json` | Khai báo MV3, match `*://*.examtopics.com/*`, chạy `document_start`, áp dụng cho mọi frame. |
| `content.js` | Quét DOM tìm popup theo text (`"this section is not available anymore"` / `"please use the main exam page"`), ẩn nó cùng `.modal-backdrop`, gỡ class `modal-open`. Dùng `MutationObserver` (throttle 200 ms) để bắt popup chèn sau. Đồng thời inject nút Prev/Next dựa trên số câu trong URL. |
| `block.css` | Buộc `overflow: auto`, ẩn element đã đánh dấu `data-killed-by-popup-killer`, style cho nút điều hướng. |

Việc ẩn popup được làm bằng **text-match trong JS** (không phải selector CSS rộng) để tránh ẩn nhầm nội dung hợp lệ của trang.

## Bảo trì

- Extension chỉ chạy trên `examtopics.com`, không request thêm permission nào.
- Không gửi dữ liệu ra ngoài, không có background script, không có popup UI.
