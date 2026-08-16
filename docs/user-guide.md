# Sổ tay Hướng dẫn Sử dụng m2m Automation Studio
# m2m Automation Studio User Guide

---

## 🇻🇳 Tiếng Việt

### 1. Tổng quan về m2m Automation Studio
**m2m (Max to Minus)** là nền tảng tự động hóa quy trình làm việc (workflow automation) trực quan, kết hợp sức mạnh của các tác vụ hệ thống với các mô hình trí tuệ nhân tạo (AI & LLM) và **pipeline tạo hình ảnh & video AI điện ảnh tiên tiến (FLUX.2 Klein 4B & Alibaba Wan2.2 TI2V-5B)**.

---

### 2. Các nhóm Khối xử lý (Node Taxonomy)

#### 2.1. Bộ kích hoạt (Triggers)
- **Kích hoạt thủ công (Manual Trigger)**: Chạy quy trình theo yêu cầu với dữ liệu đầu vào tùy chỉnh ngay trên giao diện.
- **Kích hoạt Webhook (Webhook Trigger)**: Tiếp nhận dữ liệu từ các dịch vụ bên ngoài gửi đến qua giao thức HTTP (POST/GET).
- **Kích hoạt Lập lịch (Schedule Trigger)**: Tự động chạy quy trình định kỳ theo số phút, theo giờ, hàng ngày, hàng tuần hoặc theo biểu thức **Cron** tiêu chuẩn.

#### 2.2. Tạo Ảnh & Video AI (Media Generation - FLUX & Wan)
- **Tạo ảnh từ Prompt (`m2m.media.generateImage`)**: Tạo hình ảnh chân thực chất lượng cao bằng mô hình mã nguồn mở `FLUX.2 [klein] 4B`, `Stable Diffusion XL`, `Hugging Face Inference` hoặc `Black Forest Labs API`.
- **Tạo video từ ảnh (`m2m.media.imageToVideo`)**: Biến ảnh tĩnh thành video chuyển động điện ảnh mượt mà bằng mô hình `Wan2.2 TI2V-5B` hoặc `CogVideoX`.
- **Chỉnh sửa ảnh / Inpaint (`m2m.media.editImage`)**: Chỉnh sửa ảnh, thay đổi hoặc xóa bỏ vật thể trong ảnh bằng cọ vẽ Mask tương tác và prompt.
- **Tách phân cảnh (`m2m.media.storyboardSplitter`)**: Phân tách kịch bản câu chuyện thành chuỗi prompt từng khung hình video chi tiết.
- **Tối ưu Prompt Media (`m2m.ai.mediaPromptBuilder`)**: AI hỗ trợ tự động gợi ý từ khóa ánh sáng, phong cách nghệ thuật và góc quay camera cho FLUX và Wan.
- **Lưu trữ Media (`m2m.media.saveMedia`)**: Xuất và lưu trữ tệp media về thư mục ổ cứng cục bộ (`./data/media/`).
- **Ghép nối Video (`m2m.media.mergeVideo`)**: Ghép nhiều đoạn video ngắn thành một video hoàn chỉnh.

#### 2.3. Khối Trí tuệ Nhân tạo (AI & LLM Nodes)
- **Nhắc lệnh AI (AI Prompt)**: Gửi prompt đến mô hình ngôn ngữ lớn (Ollama cục bộ, Gemini API, OpenAI-compatible) để phân tích, tóm tắt, trích xuất dữ liệu hoặc viết nội dung.
- **Tác tử AI (AI Agent)**: Tác tử thông minh có khả năng suy luận đa bước và gọi các công cụ hỗ trợ.
- **Đầu ra Cấu trúc (Structured Output)**: Ép mô hình AI trả về đúng chuẩn JSON Schema.
- **Véc-tơ Embeddings & Kho lưu trữ**: Tạo và tìm kiếm ngữ nghĩa theo véc-tơ tương đồng.

#### 2.4. Khối xử lý hệ thống (Core Actions)
- **Thiết lập dữ liệu (Set Data)**: Gán giá trị, khởi tạo biến hoặc biến đổi cấu trúc JSON giữa các bước.
- **Điều kiện IF (IF Condition)**: So sánh giá trị và rẽ nhánh luồng dữ liệu sang 2 cổng `true` hoặc `false`.
- **Yêu cầu HTTP (HTTP Request)**: Gửi request đến bất kỳ API bên ngoài nào (REST/GraphQL) với các phương thức `GET`, `POST`, `PUT`, `DELETE`.
- **Mã JavaScript (JavaScript Code)**: Chạy các hàm biến đổi logic phức tạp bằng ngôn ngữ JavaScript.
- **Phân luồng (Switch) & Vòng lặp (Loop)**: Điều hướng nhiều nhánh hoặc lặp qua từng phần tử của mảng dữ liệu.

---

### 3. Trình xem trực tiếp trên Canvas & Trình sửa ảnh (Image Editor)

#### 3.1. Trình xem Thumbnail & Video Player trên Canvas
Khi một node tạo ảnh hoặc video chạy xong, giao diện sẽ hiển thị ảnh thumbnail hoặc trình phát video có nút ▶ Play trực tiếp ngay trên khối node. Rê chuột vào ảnh để mở thanh công cụ thao tác nhanh:
- 🔍 **Xem (View / Inspector)**: Mở trình xem ảnh phóng to hoặc trình phát video chuẩn HTML5 (seek bar, tua thời gian, toàn màn hình) kèm metadata chi tiết (kích thước, dung lượng, seed, model).
- ✏️ **Sửa ảnh (Edit Image)**: Mở trình chỉnh sửa ảnh với cọ vẽ mask để inpainting và thay thế vật thể.
- ⬇ **Tải về (Download)**: Tải ảnh PNG hoặc video MP4 về máy tính.
- 🗑 **Xóa Media (Delete Media)**: Xóa file ảnh/video khỏi ổ cứng nhưng vẫn giữ nguyên node trong quy trình.

#### 3.2. Cọ vẽ Mask & Thay thế vật thể (Interactive Image Editor)
1. **Dùng Cọ Mask (Brush)**: Tô lớp màu đỏ lên vật thể hoặc khu vực bạn muốn thay đổi.
2. **Chọn chế độ**:
   - `Thay đổi vật thể (Replace Object)`: Ví dụ "Đổi chiếc xe thành siêu xe màu xanh neon".
   - `Xóa vật thể (Remove Object)`: Xóa bỏ vật thể và AI sẽ tự bù nền xung quanh.
3. **So sánh Trước / Sau**: Xem tab so sánh side-by-side kết quả vừa tạo.
4. **Lịch sử phiên bản (Version History)**: Xem lại các lần sửa trước đó và có thể Khôi phục (Restore) bất cứ lúc nào.
5. **Áp dụng lên Canvas (Apply Version)**: Cập nhật ngay kết quả mới cho các bước sinh video hoặc lưu trữ tiếp theo trong luồng.

---

### 4. Cú pháp biểu thức động (Dynamic Expressions)
- `{{$json.fieldName}}`: Lấy trường dữ liệu từ node liền trước.
- `{{$json.media.previewUrl}}`: Lấy đường dẫn URL của ảnh hoặc video vừa tạo.
- `{{$json.optimizedPrompt}}`: Lấy prompt đã được AI tối ưu cho FLUX/Wan.
- `{{$node["Tên Node"].json.fieldName}}`: Lấy dữ liệu từ một node cụ thể theo tên.
- `{{$workflow.id}}`: ID của quy trình hiện tại.
- `{{$execution.id}}`: ID của lượt chạy hiện tại.

---

### 5. Thiết lập ComfyUI Local Backend (0đ chi phí API)
1. Khởi động ComfyUI trên máy tính:
   ```bash
   python main.py --listen 127.0.0.1 --port 8188
   ```
2. Mở trang **Khóa xác thực (Credentials)** -> Chọn **＋ Thêm xác thực**.
3. Chọn loại: **ComfyUI Local (`comfyui`)** -> Base URL: `http://127.0.0.1:8188`.
4. Bấm **⚡ Kiểm tra kết nối (`Test Connection`)** và lưu khóa xác thực.

---

### 6. Bảng phím tắt tiện ích (Keyboard Shortcuts)

| Phím tắt | Tác vụ |
| :--- | :--- |
| `Ctrl + Z` | Hoàn tác thay đổi vừa thực hiện (Undo) |
| `Ctrl + Shift + Z` | Làm lại thay đổi (Redo) |
| `Ctrl + S` | Lưu quy trình ngay lập tức (Save) |
| `Ctrl + C` | Sao chép khối đang chọn (Copy) |
| `Ctrl + V` | Dán khối đã sao chép vào vị trí mới (Paste) |
| `Delete` / `Backspace` | Xóa khối hoặc đường nối đang chọn |
| `Shift + Click` | Chọn nhiều khối cùng lúc |
| `Lăn chuột` | Thu phóng phóng to / thu nhỏ canvas |

---

<br/>

## 🇬🇧 English

### 1. Overview
**m2m (Max to Minus)** is an enterprise visual workflow automation studio combining resilient event-driven execution with advanced AI reasoning and **first-class AI image & video generation pipelines (FLUX.2 Klein 4B & Alibaba Wan2.2 TI2V-5B)**.

---

### 2. Node Categories

#### 2.1. Triggers
- **Manual Trigger**: Start execution on-demand with custom test payload.
- **Webhook Trigger**: Receive incoming HTTP calls (POST/GET) from external services.
- **Schedule Trigger**: Run recurring executions using interval or 5-field standard Cron expressions.

#### 2.2. AI Media Generation (FLUX & Wan)
- **Generate Image (`m2m.media.generateImage`)**: High-fidelity text-to-image with `FLUX.2 [klein] 4B`, `SDXL`, `Hugging Face`, or `Black Forest Labs`.
- **Image To Video (`m2m.media.imageToVideo`)**: Animate static images into cinematic 5-second videos using `Wan2.2 TI2V-5B` or `CogVideoX`.
- **Edit Image / Inpaint (`m2m.media.editImage`)**: Interactive brush mask canvas to replace or remove objects in images.
- **Storyboard Splitter (`m2m.media.storyboardSplitter`)**: Decompose a narrative script into structured scene shot prompts.
- **Media Prompt Builder (`m2m.ai.mediaPromptBuilder`)**: AI prompt optimizer for lighting, camera direction, and style keywords.
- **Save Media (`m2m.media.saveMedia`)**: Export generated images and videos to local storage directory (`./data/media/`).
- **Merge Video (`m2m.media.mergeVideo`)**: Concatenate multiple video clips into a single video asset.

#### 2.3. AI & LLM Nodes
- **AI Prompt**: Prompt local Ollama or cloud models (Gemini, OpenAI) for text analysis, summarization, and copywriting.
- **AI Agent**: Autonomous reasoning agent with tool execution.
- **Structured Output**: Enforce strict JSON schema on model responses.
- **Embeddings & Vector Store**: Semantic vector embeddings and nearest-neighbor search.

#### 2.4. Core Actions
- **Set Data**: Assign variables, construct JSON payloads, or extend input data.
- **IF Condition**: Evaluate boolean conditions and route to `true` or `false` branches.
- **HTTP Request**: Send REST/GraphQL API requests (`GET`, `POST`, `PUT`, `DELETE`).
- **JavaScript Code**: Custom JavaScript transformations for advanced data manipulation.
- **Switch Router & Loop**: Route across multiple branches or iterate over array items.

---

### 3. Canvas Live Preview & Image Inpainting Editor

#### 3.1. Canvas Thumbnail & Video Player
When a media generation node finishes, its thumbnail or video poster renders **directly on the canvas node** with an embedded ▶ Play indicator. Hovering on the thumbnail brings up the action toolbar:
- 🔍 **View in Inspector**: Zoom image or play video with seek bar, duration, volume, and detailed metadata specs.
- ✏️ **Edit Image**: Open interactive brush mask editor for inpainting and object replacement.
- ⬇ **Download**: Instantly download PNG image or MP4 video.
- 🗑 **Delete Media**: Delete media binary from disk while preserving the workflow node.

#### 3.2. Interactive Image Editor & Version Control
1. **Brush Mask Tool**: Paint a red mask overlay over objects you wish to edit or remove.
2. **Operations**:
   - `Replace Object`: e.g., "Replace the car with a vintage blue roadster".
   - `Remove Object`: Seamlessly remove objects with natural background fill.
3. **Before / After Comparison**: Compare original vs edited images side-by-side.
4. **Version History**: Review past edit iterations and restore any version with one click.
5. **Apply to Canvas**: Push the edited version to downstream nodes on the canvas.

---

### 4. Expression Syntax
- `{{$json.fieldName}}`: Access field from previous node.
- `{{$json.media.previewUrl}}`: Access preview URL of generated image/video.
- `{{$json.optimizedPrompt}}`: Access AI-optimized prompt for FLUX/Wan.
- `{{$node["Node Name"].json.field}}`: Reference data from a specific named node.
- `{{$workflow.id}}`: Current workflow ID.
- `{{$execution.id}}`: Current execution ID.

---

### 5. Local ComfyUI Setup (Zero API Cost)
1. Run ComfyUI locally:
   ```bash
   python main.py --listen 127.0.0.1 --port 8188
   ```
2. Navigate to **Credentials** -> Click **＋ Add credential**.
3. Select **ComfyUI Local (`comfyui`)** -> Base URL: `http://127.0.0.1:8188`.
4. Click **⚡ Test Connection** and save.
