# ExamTopics Popup Killer

Chrome extension (Manifest V3) cho `examtopics.com`:

- Tắt popup **"This section is not available anymore"** và các overlay tương tự đang chặn nội dung.
- Khôi phục scroll khi trang bị khoá bởi `modal-open` / `overflow: hidden`.
- Nút **◀ Prev / Next ▶** cố định ở góc dưới phải khi xem một câu trong `/discussions/<exam>/view/<n>-...` để nhảy nhanh sang câu trước / sau.
- Nút **💾 Save** lưu câu hiện tại (đề bài, A/B/C/D, đáp án được vote nhiều nhất, link ảnh) vào bank cục bộ — gom theo **mã đề** trích từ URL (vd `AB-731`, `AZ-104`).
- Nút **📚 Bank** mở panel xem các câu đã lưu, đổi giữa các mã đề, xoá từng câu hoặc **Export JSON** cả bộ.

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
| `manifest.json` | Khai báo MV3, match `*://*.examtopics.com/*`, chạy `document_start`, áp dụng cho mọi frame. Permission duy nhất là `storage` (dùng cho bank). |
| `content.js` | (1) Quét DOM tìm popup theo text, ẩn cùng `.modal-backdrop`, gỡ class `modal-open` — dùng `MutationObserver` throttle 200 ms để bắt popup chèn sau. (2) Inject Prev / Save / Next / Bank dựa vào URL. (3) Scrape `.question-body p.card-text` + `.question-choices-container li.multi-choice-item` + `.voted-answers-tally` để dựng bản ghi câu hỏi. (4) Lưu / đọc qua `chrome.storage.local` key `etkBank`. |
| `block.css` | Buộc `overflow: auto`, ẩn element đã đánh dấu `data-killed-by-popup-killer`, style cho nút điều hướng, toast và panel bank. |

Việc ẩn popup được làm bằng **text-match trong JS** (không phải selector CSS rộng) để tránh ẩn nhầm nội dung hợp lệ của trang.

## Cấu trúc dữ liệu bank

`chrome.storage.local["etkBank"]` là object `{ [examCode]: { [questionId]: questionRecord } }`.

```jsonc
{
  "AB-731": {
    "984716": {
      "questionId": 984716,
      "examCode": "AB-731",
      "vendor": "microsoft",
      "topic": 1,
      "questionNumber": 1,
      "url": "https://www.examtopics.com/discussions/microsoft/view/384116-exam-ab-731-topic-1-question-1-discussion/",
      "question": "Your company plans to build a generative AI solution...",
      "images": ["https://img.examtopics.com/ab-731/image1.png"],
      "options": [
        { "letter": "A", "text": "Provides a scalable platform...", "isCorrect": true },
        { "letter": "B", "text": "Removes the need to select...", "isCorrect": false }
      ],
      "suggestedAnswer": "A",
      "voted": [{ "voted_answers": "A", "vote_count": 8, "is_most_voted": true }],
      "savedAt": 1719155123456
    }
  }
}
```

- Mã đề được lấy từ slug URL (`...-exam-ab-731-topic-1-question-1-discussion` → `AB-731`).
- Khi câu hỏi có ảnh, `<img>` được giữ inline trong `question` / `options[].text` dưới dạng `[IMG: <url>]` và liệt kê riêng trong mảng `images`.

## Bảo trì

- Extension chỉ chạy trên `examtopics.com`. Permission duy nhất là `storage` (lưu cục bộ trong trình duyệt).
- Không gửi dữ liệu ra ngoài, không có background script, không có popup UI riêng — toàn bộ UI inject thẳng vào trang.
