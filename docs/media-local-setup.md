# Local Media Generation Setup Guide (FLUX.2 & Wan2.2)

Hệ thống m2m hỗ trợ pipeline tạo hình ảnh và video AI cục bộ (Local GPU) không tốn chi phí API, kết hợp linh hoạt với các dịch vụ đám mây (Cloud BYOK).

---

## 1. Yêu cầu hệ thống phần cứng (Hardware Requirements)

| Tác vụ | Mô hình khuyến nghị | VRAM tối thiểu | VRAM tối ưu | CPU / RAM |
| :--- | :--- | :--- | :--- | :--- |
| **Tạo ảnh Text-to-Image** | `FLUX.2 [klein] 4B` | 6GB VRAM (NF4 / Q4) | 12GB - 16GB VRAM | 16GB RAM |
| **Tạo video Image-to-Video** | `Wan2.2 TI2V-5B` | 8GB VRAM (Q4 / GGUF) | 16GB - 24GB VRAM | 32GB RAM |
| **Tạo video chất lượng cao** | `Wan2.1 / CogVideoX / LTX` | 12GB VRAM | 24GB VRAM | 32GB RAM |

---

## 2. Thiết lập ComfyUI Local Backend

m2m giao tiếp với ComfyUI thông qua REST API chuẩn (`/prompt`, `/history`, `/upload/image`, `/view`).

### Bước 1: Cài đặt ComfyUI
```bash
git clone https://github.com/comfyanonymous/ComfyUI.git
cd ComfyUI
pip install -r requirements.txt
```

### Bước 2: Tải Mô hình Checkpoint
1. **FLUX.2 Klein 4B / FLUX Schnell**: Đặt file `.safetensors` vào thư mục `ComfyUI/models/unet/` hoặc `ComfyUI/models/checkpoints/`.
2. **Wan2.2 TI2V-5B**: Đặt checkpoint vào `ComfyUI/models/diffusion_models/`.
3. **Clip & VAE**: Đặt `t5xxl_fp8` và `flux_vae` vào `ComfyUI/models/clip/` và `ComfyUI/models/vae/`.

### Bước 3: Khởi động ComfyUI
```bash
python main.py --listen 127.0.0.1 --port 8188 --highvram
```
*(Nếu sử dụng card đồ họa có VRAM dưới 12GB, thêm cờ `--lowvram` hoặc `--fp8_e4m3fn`)*

---

## 3. Cấu hình Credential trong m2m

1. Mở giao diện **m2m Studio** -> Chọn mục **Khóa xác thực (Credentials)**.
2. Nhấn nút **＋ Thêm xác thực** (`Add credential`).
3. Chọn loại: **ComfyUI Local (`comfyui`)**.
4. Thiết lập Base URL: `http://127.0.0.1:8188`.
5. Bấm **⚡ Kiểm tra kết nối (`Test Connection`)** để đảm bảo backend ComfyUI đã sẵn sàng.
6. Bấm **Mã hóa & lưu (`Encrypt & save`)**.

---

## 4. Tùy chọn Cloud Provider (Hugging Face / Black Forest Labs)

Nếu máy tính không có GPU chuyên dụng, bạn có thể chuyển sang chế độ Cloud:

### Hugging Face Hosted Inference
- **Model**: `black-forest-labs/FLUX.1-schnell`
- **Cost**: Miễn phí trong hạn mức Free Tier credits hàng tháng.
- **Credential**: Tạo Access Token tại `https://huggingface.co/settings/tokens`.

### Black Forest Labs Cloud API
- **Model**: `flux-pro-1.1`, `flux-dev`
- **Cost**: Trả theo từng lượt tạo (Paid BYOK).
- **Credential**: Lấy API Key từ `https://bfl.ml`.

---

## 5. Danh sách Node Media trong m2m Workflow

- 🎬 `m2m.media.generateImage`: Tạo hình ảnh từ prompt text conditioning.
- 🎥 `m2m.media.imageToVideo`: Tạo video chuyển động từ một bức ảnh đầu vào.
- 🎨 `m2m.media.editImage`: Chỉnh sửa ảnh, inpainting, thay thế vật thể bằng cọ vẽ mask trực tiếp trên canvas.
- 💾 `m2m.media.saveMedia`: Lưu ảnh và video đã tạo vào thư mục lưu trữ (`./data/media/`).
- 📜 `m2m.media.storyboardSplitter`: Tách kịch bản thành danh sách scene prompts.
- ✨ `m2m.ai.mediaPromptBuilder`: Trí tuệ nhân tạo tối ưu từ khóa mô tả và góc quay camera.
- 🎞 `m2m.media.mergeVideo`: Ghép nối các clip ngắn thành một video hoàn chỉnh.
