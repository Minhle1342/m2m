# m2m — Media Generation Expansion Plan
## Bổ sung node tạo ảnh, tạo video từ ảnh và Media Credentials

> **Dự án:** m2m — Max to Minus  
> **Giai đoạn:** Post-MVP / Media Generation Expansion  
> **Mục tiêu chính:** Bổ sung pipeline tạo ảnh và video tự động, ưu tiên chạy được trên localhost/development cho 1 người dùng trước.

---

# 1. Mục tiêu

Sau khi core workflow engine của m2m đã hoàn thành, phase tiếp theo bổ sung nhóm tính năng:

- Tạo ảnh từ prompt.
- Chỉnh sửa ảnh bằng prompt.
- Tạo video từ một ảnh đầu vào.
- Tạo video trực tiếp từ prompt.
- Tạo nhiều scene rồi render thành nhiều clip.
- Ghép các clip thành một video hoàn chỉnh.
- Lưu media output vào local storage.
- Theo dõi tiến trình generate bất đồng bộ.
- Quản lý model/provider trong `Add credential`.
- Hỗ trợ local/open-weight model trước.
- Hỗ trợ cloud provider có free credit/free tier sau.
- Hỗ trợ cloud provider trả phí nhưng phải gắn nhãn rõ ràng.

Pipeline mục tiêu:

```text
Idea / Prompt
     |
     v
Prompt Builder
     |
     v
Generate Image
     |
     v
Image To Video
     |
     v
Save Media
```

Pipeline nâng cao:

```text
Idea
 |
 v
Generate Script
 |
 v
Storyboard Splitter
 |
 v
Loop Scenes
 |
 +---------------------------+
 |                           |
 v                           |
Generate Image               |
 |                           |
 v                           |
Image To Video               |
 |                           |
 +---------------------------+
 |
 v
Merge Video
 |
 v
Final Video
```

---

# 2. Nguyên tắc Localhost-first

Media phase vẫn phải tuân theo:

```text
localhost first
single user first
local inference first
cloud provider second
distributed scaling later
```

Agent không được bắt đầu bằng:

- Kubernetes.
- GPU cluster.
- Multi-region rendering.
- Distributed media scheduler.
- Multi-tenant GPU quota.
- Enterprise billing.

Acceptance đầu tiên phải là:

```text
m2m localhost
   |
   v
ComfyUI localhost
   |
   v
Generate Image
   |
   v
Image To Video
   |
   v
Save output
```

---

# 3. Kiến trúc Media Provider

Không hard-code FLUX, Wan hoặc bất kỳ model nào trực tiếp vào workflow engine.

Thiết kế:

```text
Workflow Node
    |
    v
Media Service
    |
    v
MediaProviderAdapter
    |
    +---- ComfyUI Local
    |
    +---- Hugging Face
    |
    +---- Black Forest Labs
    |
    +---- Generic Media API
    |
    +---- Future Providers
```

Interface đề xuất:

```ts
export interface MediaProviderAdapter {
  getProviderInfo(): MediaProviderInfo;

  listModels(
    credential: ResolvedCredential,
  ): Promise<MediaModel[]>;

  generateImage(
    request: ImageGenerationRequest,
    credential: ResolvedCredential,
  ): Promise<MediaGenerationJob>;

  generateVideo(
    request: VideoGenerationRequest,
    credential: ResolvedCredential,
  ): Promise<MediaGenerationJob>;

  getJobStatus(
    providerJobId: string,
    credential: ResolvedCredential,
  ): Promise<MediaGenerationStatus>;

  cancelJob?(
    providerJobId: string,
    credential: ResolvedCredential,
  ): Promise<void>;
}
```

Workflow engine chỉ biết:

```text
provider
credentialId
modelId
input
parameters
```

---

# 4. Media Model Registry

Tạo package/module:

```text
packages/ai-core/src/media/
```

Cấu trúc:

```text
media/
├─ providers/
│  ├─ comfyui/
│  ├─ huggingface/
│  ├─ black-forest-labs/
│  └─ generic/
├─ models/
│  ├─ registry.ts
│  ├─ capabilities.ts
│  └─ licenses.ts
├─ jobs/
├─ storage/
├─ templates/
└─ types/
```

Model schema:

```ts
interface MediaModel {
  id: string;
  provider: string;
  displayName: string;

  task:
    | 'text-to-image'
    | 'image-to-image'
    | 'text-to-video'
    | 'image-to-video'
    | 'video-to-video';

  executionMode:
    | 'local'
    | 'cloud';

  costTier:
    | 'local-free'
    | 'free-credit'
    | 'paid'
    | 'unknown';

  capabilities: MediaModelCapabilities;

  license?: {
    name?: string;
    url?: string;
    commercialUse:
      | 'allowed'
      | 'restricted'
      | 'unknown';
  };

  documentationUrl?: string;
}
```

Frontend không được hard-code danh sách model trong component.

---

# 5. Model Capability

```ts
interface MediaModelCapabilities {
  textToImage?: boolean;
  imageToImage?: boolean;

  textToVideo?: boolean;
  imageToVideo?: boolean;
  videoToVideo?: boolean;

  referenceImage?: boolean;
  multipleReferenceImages?: boolean;

  negativePrompt?: boolean;
  seed?: boolean;
  customResolution?: boolean;
  aspectRatio?: boolean;

  duration?: boolean;
  fps?: boolean;

  synchronizedAudio?: boolean;

  minWidth?: number;
  maxWidth?: number;

  minHeight?: number;
  maxHeight?: number;

  minDurationSeconds?: number;
  maxDurationSeconds?: number;
}
```

UI phải render field theo capability.

Ví dụ:

```text
Model A supports FPS
=> hiển thị FPS

Model B không supports FPS
=> ẩn FPS
```

Backend vẫn phải validate.

---

# 6. Node — Generate Image

Node type:

```text
m2m.media.generateImage
```

Category:

```text
AI / Media
```

Input:

```text
prompt
negativePrompt?
referenceImages[]?
```

Config:

```text
Credential
Provider
Model

Width
Height
Aspect Ratio

Seed
Steps
Guidance

Number of Images
Output Format
```

Output:

```json
{
  "images": [
    {
      "id": "media_xxx",
      "type": "image",
      "mimeType": "image/png",
      "localPath": "...",
      "width": 1024,
      "height": 1024
    }
  ],
  "provider": "comfyui",
  "model": "flux2-klein-4b"
}
```

---

# 7. Node — Edit Image

Node:

```text
m2m.media.editImage
```

Input:

```text
image
prompt
mask?
referenceImages[]?
```

Use case:

```text
Generate Image
     |
     v
Edit Background
     |
     v
Image To Video
```

P1, không bắt buộc ở acceptance đầu tiên.

---

# 8. Node — Image To Video

Đây là node P0 của phase mới.

Node:

```text
m2m.media.imageToVideo
```

Input:

```text
image
prompt
negativePrompt?
```

Config dynamic:

```text
Credential
Provider
Model

Duration
FPS

Width
Height
Aspect Ratio

Seed
Steps
Guidance

Motion Strength
Camera Motion

Output Format
```

Không provider nào bắt buộc phải hỗ trợ toàn bộ field.

Node property schema phải phụ thuộc `MediaModelCapabilities`.

Output:

```json
{
  "video": {
    "id": "media_video_xxx",
    "type": "video",
    "mimeType": "video/mp4",
    "localPath": "...",
    "durationMs": 5000
  },
  "provider": "...",
  "model": "..."
}
```

---

# 9. Node — Text To Video

Node:

```text
m2m.media.textToVideo
```

P1.

Input:

```text
prompt
negativePrompt?
```

Config lấy từ model capability.

---

# 10. Node — Save Media

Node:

```text
m2m.media.saveMedia
```

MVP destination:

```text
Local Storage
```

P1:

```text
S3-compatible
Cloudinary
Google Drive
```

Không lưu binary video trực tiếp vào SQLite.

---

# 11. Node — Storyboard Splitter

Node:

```text
m2m.media.storyboardSplitter
```

Input:

```text
script
```

Output:

```json
[
  {
    "scene": 1,
    "description": "...",
    "imagePrompt": "...",
    "videoPrompt": "...",
    "duration": 5
  },
  {
    "scene": 2,
    "description": "...",
    "imagePrompt": "...",
    "videoPrompt": "...",
    "duration": 5
  }
]
```

Có thể dùng AI Provider hiện tại của m2m để tạo storyboard.

---

# 12. Node — Prompt Builder

Node:

```text
m2m.ai.mediaPromptBuilder
```

Input:

```text
sceneDescription
style
targetModel?
```

Output:

```text
imagePrompt
videoPrompt
negativePrompt
cameraInstruction
```

Không hard-code prompt theo riêng FLUX hoặc Wan.

Có thể có adapter/preset:

```text
Generic
FLUX
Wan
LTX
CogVideoX
```

---

# 13. Node — Merge Video

Node:

```text
m2m.media.mergeVideo
```

Implementation MVP:

```text
FFmpeg
```

Input:

```text
video[]
```

Config:

```text
transition?
resolution?
fps?
```

MVP có thể chỉ hỗ trợ concat cơ bản.

Output:

```text
finalVideo
```

---

# 14. Node — Add Audio

P2.

```text
m2m.media.addAudio
```

Input:

```text
video
audio
```

Use case:

```text
Generated Video
   |
   v
Generated Narration
   |
   v
Add Audio
```

---

# 15. MediaFile object

Không truyền base64 lớn giữa nhiều node.

Dùng object reference:

```ts
interface MediaFile {
  id: string;

  type:
    | 'image'
    | 'video'
    | 'audio';

  mimeType: string;

  localPath?: string;
  url?: string;

  sizeBytes?: number;

  width?: number;
  height?: number;

  durationMs?: number;

  metadata?: Record<string, unknown>;
}
```

Workflow node truyền `MediaFile` metadata/reference.

Binary được giữ trong media storage.

---

# 16. Local Media Storage

MVP:

```text
./data/media/
```

Structure:

```text
data/media/
├─ executions/
│  └─ exec_xxx/
│     ├─ images/
│     ├─ videos/
│     └─ audio/
└─ temp/
```

Database lưu:

```text
id
executionId
nodeExecutionId
path
mimeType
size
dimensions
duration
metadata
```

---

# 17. Media cleanup

Environment:

```text
MEDIA_RETENTION_DAYS=7
```

Queue:

```text
media-cleanup
```

Không xóa file đang được pin hoặc còn được tham chiếu theo retention policy.

---

# 18. MediaGenerationJob

Generation ảnh/video có thể chạy lâu.

Entity:

```text
MediaGenerationJob
```

Fields:

```text
id

executionId
nodeExecutionId

provider
model

providerJobId

status
progress

input
output

error

createdAt
startedAt
finishedAt
```

Status:

```text
queued
submitted
processing
completed
failed
cancelled
```

---

# 19. Không block worker trong thời gian dài

Flow:

```text
Worker submits generation
       |
       v
Provider returns Job ID
       |
       v
Execution = WAITING
       |
       v
Poll provider / receive callback
       |
       v
Media completed
       |
       v
Resume workflow
```

Nếu ComfyUI local cung cấp queue/progress event thì adapter dùng cơ chế phù hợp của ComfyUI.

---

# 20. Queue riêng cho Media

Tạo queue:

```text
media-image-generation
media-video-generation
media-processing
```

Không để video generation dùng cùng concurrency với HTTP node.

Development default:

```text
LOCAL_IMAGE_CONCURRENCY=1
LOCAL_VIDEO_CONCURRENCY=1
```

Lý do:

```text
tránh nhiều generation cùng lúc làm hết VRAM/RAM.
```

---

# 21. Realtime progress

Event:

```text
media.generation.queued
media.generation.started
media.generation.progress
media.generation.completed
media.generation.failed
```

Editor:

```text
Image To Video
Generating...
```

Nếu provider có progress thật:

```text
Generating... 43%
```

Nếu không có:

```text
Generating...
```

Không fake percentage.

---

# 22. Provider P0 — ComfyUI Local

Đây là Media Provider ưu tiên số 1.

Credential/connection type:

```text
ComfyUI Local
```

Default:

```text
http://127.0.0.1:8188
```

Form:

```text
Credential Name:
Local ComfyUI

Base URL:
http://127.0.0.1:8188

API Key:
Optional

[Test Connection]
```

Local self-host thông thường không bắt buộc API key.

m2m dùng ComfyUI như inference backend.

---

# 23. ComfyUI Adapter

Tạo:

```text
ComfyUIMediaProvider
```

Nhiệm vụ:

- Test server connection.
- Submit API-format workflow.
- Upload input image.
- Theo dõi queue.
- Theo dõi execution/progress.
- Lấy history.
- Lấy output.
- Chuyển output thành `MediaFile`.
- Map lỗi thành `M2MError`.

---

# 24. ComfyUI Workflow Template Registry

Tạo:

```text
packages/ai-core/src/media/providers/comfyui/templates/
```

Template:

```text
flux2-klein-text-to-image.json

wan22-ti2v-image-to-video.json

cogvideox-i2v.json

ltx-i2v.json
```

m2m map input:

```text
prompt
image
seed
resolution
duration
```

vào API workflow JSON.

MVP không yêu cầu user tự viết ComfyUI JSON.

P2:

```text
Custom ComfyUI API Workflow
```

---

# 25. Tại sao ưu tiên ComfyUI

Kiến trúc:

```text
m2m
 |
 v
ComfyUI Local API
 |
 +---- FLUX
 |
 +---- Wan
 |
 +---- CogVideoX
 |
 +---- LTX
 |
 +---- SDXL
```

m2m chịu trách nhiệm:

```text
workflow orchestration
execution history
credentials
job state
node UX
media storage
```

ComfyUI chịu trách nhiệm:

```text
model loading
GPU inference
VRAM management
model workflow graph
```

Không cần tự xây inference runtime GPU riêng ở phase đầu.

---

# 26. Image Model P0 — FLUX.2 [klein] 4B

Internal model ID:

```text
flux2-klein-4b
```

Task:

```text
text-to-image
image editing
```

Execution:

```text
local
```

Cost badge:

```text
LOCAL
OPEN-WEIGHT
```

Credential:

```text
ComfyUI Local
```

Không cần BFL API key khi dùng open-weight model qua local inference.

Model entry phải chứa license metadata.

---

# 27. FLUX.2 [klein] license

Agent phải đọc official docs/model repo trước khi tích hợp.

Theo tài liệu Black Forest Labs hiện tại:

```text
FLUX.2 [klein] 4B
```

có open weights dưới Apache 2.0.

Không suy rộng điều này sang tất cả FLUX variants.

Ví dụ:

```text
FLUX.2 Klein 4B
!=
FLUX.2 Klein 9B
!=
FLUX.2 Dev
!=
FLUX.2 Pro
```

Mỗi model cần license riêng.

---

# 28. Image Model P1 — SDXL

Internal:

```text
sdxl
```

Provider:

```text
ComfyUI Local
```

Vai trò:

- Baseline compatibility.
- Fallback local.
- Dễ dùng để test Generate Image node.

Không bắt buộc làm default nếu FLUX chạy ổn.

---

# 29. Image Model Registry mở rộng

Kiến trúc phải cho phép thêm:

```text
FLUX family
Stable Diffusion family
Hunyuan Image
Qwen Image
future open-weight models
```

Không sửa workflow-core khi thêm model.

---

# 30. Video Model P0 — Wan2.2 TI2V-5B

Internal:

```text
wan2.2-ti2v-5b
```

Task:

```text
text-to-video
image-to-video
```

Provider:

```text
ComfyUI Local
```

hoặc sau này:

```text
Native Wan Local Adapter
```

Cost badge:

```text
LOCAL
OPEN-WEIGHT
```

Đây là model mục tiêu đầu tiên cho flow:

```text
Image
 |
 v
Wan2.2
 |
 v
Video
```

---

# 31. Wan2.2 integration requirements

Agent phải đọc official repository:

```text
https://github.com/Wan-Video/Wan2.2
```

Đặc biệt:

- TI2V model.
- Resolution support.
- Model files.
- Hardware requirements.
- License.
- Diffusers/ComfyUI integration status.

Không hard-code hardware requirement vào UI.

Có thể hiển thị informational metadata.

---

# 32. Video Model P1 — Wan2.1

Internal:

```text
wan2.1-i2v
```

Dùng khi:

- ComfyUI workflow ổn định hơn.
- Hardware local phù hợp hơn.
- Cần fallback.

Official repository:

```text
https://github.com/Wan-Video/Wan2.1
```

---

# 33. Video Model P1 — CogVideoX I2V

Model family:

```text
CogVideoX
CogVideoX1.5 I2V
```

Task:

```text
image-to-video
text-to-video
```

Provider:

```text
ComfyUI Local
```

hoặc:

```text
native local adapter
```

Official repository:

```text
https://github.com/zai-org/CogVideo
```

Agent phải kiểm tra model/license/version trước khi enable production.

---

# 34. Video Model P1/P2 — LTX

Model family:

```text
LTX-Video
LTX-2
```

Use case:

```text
text-to-video
image/video generation
audio-video generation tùy phiên bản/model
```

Provider:

```text
ComfyUI Local
```

hoặc:

```text
LTX local inference/API
```

Official repositories:

```text
https://github.com/Lightricks/LTX-Video

https://github.com/Lightricks/LTX-2
```

Agent phải kiểm tra license/version mới nhất trước khi đưa vào production.

---

# 35. Video Model P2 — HunyuanVideo I2V

Official:

```text
https://github.com/Tencent-Hunyuan/HunyuanVideo

https://github.com/Tencent-Hunyuan/HunyuanVideo-I2V
```

Use case:

```text
image-to-video
```

Không làm default localhost nếu yêu cầu GPU cao.

Agent phải đọc:

- Hardware requirement.
- Model license.
- Inference setup.

---

# 36. Optional — FLUX Video / FLUX 3

Black Forest Labs hiện đã mở rộng FLUX sang video ở thế hệ mới.

Không xem đây là free tier mặc định.

Nếu tích hợp:

```text
Provider:
Black Forest Labs

Badge:
PAID hoặc PREVIEW
```

Tính năng này là P2 sau khi official API ổn định cho use case m2m.

Agent phải đọc release notes/API docs tại thời điểm triển khai.

---

# 37. Add Credential — cấu trúc mới

Form `Add credential` cần chia category:

```text
LLM / Chat

Image Generation

Video Generation

Local Inference

Storage

Generic API
```

Search:

```text
Search credentials...
```

Provider card:

```text
Provider Name
Category
Capabilities
Cost Badge
Auth Type
```

---

# 38. Badge chuẩn

Chỉ dùng:

```text
LOCAL
OPEN-WEIGHT
FREE CREDIT
PAID
BYOK
EXPERIMENTAL
PREVIEW
```

Không dùng:

```text
FREE
```

cho cloud provider nếu thực tế chỉ có free credit/trial hạn chế.

---

# 39. Add Credential — ComfyUI Local

Card:

```text
ComfyUI Local

Local Inference
Image + Video

LOCAL
No API key required by default
```

Form:

```text
Name

Base URL
default: http://127.0.0.1:8188

API Key
optional

[Test Connection]
```

---

# 40. Add Credential — Hugging Face

Card:

```text
Hugging Face

Hosted Inference
Image + Video depending on provider/model

FREE CREDIT
BYOK
```

Form:

```text
Name

HF Access Token

Preferred Inference Provider
optional

[Test Credential]
```

Không hard-code quota/free credit vào source code.

---

# 41. Hugging Face free credit rule

Hugging Face Inference Providers hiện có monthly credits cho account.

Coding agent phải đọc trang pricing hiện tại:

```text
https://huggingface.co/docs/inference-providers/pricing
```

mỗi khi triển khai/điều chỉnh UI pricing.

UI chỉ nên ghi:

```text
FREE CREDIT
```

và link:

```text
View current provider pricing
```

Không ghi:

```text
Unlimited free
```

---

# 42. Add Credential — Black Forest Labs

Card:

```text
Black Forest Labs

FLUX
Image / Media

PAID
BYOK
```

Form:

```text
Name

API Key

API Base URL
optional / advanced

[Test Credential]
```

Docs:

```text
https://docs.bfl.ai/
```

Pricing:

```text
https://docs.bfl.ai/quick_start/pricing
```

Không hard-code price per image trong m2m.

---

# 43. BFL cloud != local FLUX

Phải phân biệt trong UI:

```text
FLUX.2 Klein 4B
via ComfyUI Local
=> LOCAL

FLUX.2 via Black Forest Labs API
=> PAID
```

Không gộp hai cách chạy thành một credential.

---

# 44. Add Credential — Generic Media API

P1/P2:

```text
Generic Media API
```

Form:

```text
Name

Base URL

Authentication:
- None
- Bearer
- API Key Header

API Key / Token

Header Name
optional
```

Dùng để tích hợp provider chưa có adapter chính thức.

Không cho arbitrary unsafe script trong credential.

---

# 45. CredentialTypeDefinition

```ts
interface CredentialTypeDefinition {
  type: string;
  displayName: string;

  category:
    | 'llm'
    | 'image'
    | 'video'
    | 'local-inference'
    | 'storage'
    | 'generic';

  capabilities: (
    | 'text-to-image'
    | 'image-to-image'
    | 'text-to-video'
    | 'image-to-video'
    | 'video-to-video'
  )[];

  costBadge?:
    | 'LOCAL'
    | 'FREE CREDIT'
    | 'PAID'
    | 'BYOK';

  fields: CredentialField[];

  documentationUrl?: string;

  testConnection?: boolean;
}
```

---

# 46. Credential secrets

Giữ nguyên security architecture:

```text
MASTER_ENCRYPTION_KEY
AES-256-GCM
```

Frontend không bao giờ nhận token đã decrypt.

Response:

```json
{
  "id": "cred_123",
  "name": "My Hugging Face",
  "type": "huggingFace",
  "configured": true
}
```

---

# 47. Dynamic model dropdown

Trong node:

```text
Credential
  |
  v
Provider
  |
  v
Model
```

Ví dụ:

```text
Credential:
Local ComfyUI

Node:
Generate Image

Model dropdown:
- FLUX.2 Klein 4B
- SDXL
```

Image To Video:

```text
- Wan2.2 TI2V-5B
- CogVideoX I2V
- LTX
- HunyuanVideo I2V
```

Chỉ hiển thị model hỗ trợ task hiện tại.

---

# 48. API cho credential/model discovery

```text
GET /api/v1/credential-types
```

```text
GET /api/v1/media/providers
```

```text
GET /api/v1/media/models
```

Filter:

```text
GET /api/v1/media/models?task=image-to-video
```

```text
GET /api/v1/media/models?credentialId=cred_xxx&task=text-to-image
```

---

# 49. Provider connection test

Endpoint:

```text
POST /api/v1/credentials/:id/test
```

ComfyUI test:

```text
server reachable
queue reachable
basic API available
```

Hugging Face:

```text
token accepted
```

BFL:

```text
credential accepted
```

Không chạy generation tốn phí chỉ để test credential nếu provider có cách test nhẹ hơn.

---

# 50. Model installation state

Local ComfyUI model có thể:

```text
AVAILABLE
NOT_INSTALLED
UNKNOWN
```

UI:

```text
Wan2.2 TI2V-5B
Not installed locally
```

Không tự download model hàng chục GB nếu user chưa chủ động yêu cầu.

MVP chỉ detect và hướng dẫn.

---

# 51. Local provider health

Development settings:

```text
/settings/developer
```

Hiển thị:

```text
ComfyUI       ONLINE

Image Models
FLUX.2        AVAILABLE

Video Models
Wan2.2        AVAILABLE
```

Nếu offline:

```text
ComfyUI       OFFLINE
```

---

# 52. Error types mới

```text
MEDIA_PROVIDER_UNAVAILABLE

MEDIA_MODEL_NOT_FOUND

MEDIA_MODEL_NOT_INSTALLED

MEDIA_GENERATION_FAILED

MEDIA_GENERATION_TIMEOUT

MEDIA_PROVIDER_RATE_LIMIT

MEDIA_PROVIDER_QUOTA_EXCEEDED

MEDIA_PROVIDER_INSUFFICIENT_CREDIT

MEDIA_RESOURCE_ERROR

MEDIA_INVALID_INPUT

MEDIA_OUTPUT_NOT_FOUND
```

GPU out-of-memory:

```text
MEDIA_RESOURCE_ERROR
```

Không trả stack trace raw cho frontend production.

---

# 53. Retry policy

Retryable:

```text
provider timeout
HTTP 429
HTTP 502
HTTP 503
temporary provider failure
temporary ComfyUI connection issue
```

Không retry mặc định:

```text
invalid API key
insufficient credits
model not installed
invalid input image
unsupported parameter
GPU OOM
```

GPU OOM không được loop retry vô hạn.

---

# 54. Timeout

Config:

```text
MEDIA_IMAGE_TIMEOUT_MS
MEDIA_VIDEO_TIMEOUT_MS
```

Video timeout phải tách khỏi HTTP Request node timeout.

Không hard-code một timeout ngắn cho mọi video model.

---

# 55. Input image validation

Image To Video phải kiểm tra:

```text
mime type
file size
width/height
file existence
supported formats
```

Không tin extension file.

---

# 56. Remote media URL security

Nếu node cho phép input:

```text
https://...
```

phải có SSRF protection.

Không cho provider fetch tùy ý:

```text
localhost
private network
cloud metadata endpoints
```

nếu không được policy cho phép.

Ưu tiên:

```text
download -> validate -> local MediaFile
```

rồi gửi tới provider.

---

# 57. Media output security

Không phục vụ toàn bộ:

```text
./data/
```

bằng static public route.

Dùng controlled endpoint:

```text
GET /api/v1/media/:id
```

và authorization.

Single-user localhost vẫn giữ abstraction để production không phải viết lại.

---

# 58. Workflow example — FLUX -> Wan

Acceptance workflow P0:

```text
Manual Trigger
      |
      v
Set Prompt
      |
      v
Generate Image
FLUX.2 Klein 4B
      |
      v
Image To Video
Wan2.2 TI2V-5B
      |
      v
Save Media
```

Acceptance:

```text
workflow SUCCESS

image output exists

video output exists

execution inspector shows both outputs
```

---

# 59. Workflow example — Upload Image -> Video

```text
Manual Trigger
      |
      v
Upload Image
      |
      v
Set Video Prompt
      |
      v
Image To Video
      |
      v
Save Media
```

Đây là flow đơn giản nhất cần hoàn thành trước.

---

# 60. Workflow example — Automatic scenes

```text
Webhook
  |
  v
AI Generate Script
  |
  v
Storyboard Splitter
  |
  v
Loop
  |
  +---- Generate Image
  |          |
  |          v
  |     Image To Video
  |          |
  +----------+
  |
  v
Merge Video
  |
  v
Output
```

P1/P2.

---

# 61. Phase Media 0 — Foundation

Xây:

- Media types.
- `MediaProviderAdapter`.
- Media Model Registry.
- MediaFile.
- Media storage.
- MediaGenerationJob.
- Media queue.
- Credential metadata.

Definition of Done:

```text
provider adapter có thể register
model registry trả được model
media file được lưu local
job state lưu database
```

---

# 62. Phase Media 1 — ComfyUI Local

Xây:

- `ComfyUI Local` credential.
- Test connection.
- Submit workflow.
- Upload input media.
- Poll/progress.
- Get output.
- Error mapping.

Definition of Done:

```text
m2m gọi được ComfyUI localhost
```

---

# 63. Phase Media 2 — Generate Image

Model target:

```text
FLUX.2 Klein 4B
```

Fallback test model:

```text
SDXL
```

Definition of Done:

```text
Manual Trigger
 ->
Generate Image
 ->
output PNG
```

---

# 64. Phase Media 3 — Image To Video

Model target:

```text
Wan2.2 TI2V-5B
```

Definition of Done:

```text
Upload Image
 ->
Image To Video
 ->
output MP4
```

---

# 65. Phase Media 4 — Full FLUX -> Wan flow

Definition of Done:

```text
Prompt
 ->
FLUX image
 ->
Wan video
 ->
Save Media
```

Không sang cloud provider trước khi flow này chạy ổn trên local nếu hardware development cho phép.

---

# 66. Phase Media 5 — Add Credential Cloud Providers

Thêm:

```text
Hugging Face
Black Forest Labs
```

Mục tiêu:

- Người không có GPU vẫn có đường tích hợp cloud.
- Có free-credit path khi provider hiện tại hỗ trợ.
- Có official BFL API path cho FLUX cloud.

---

# 67. Phase Media 6 — More video models

Thêm lần lượt:

```text
CogVideoX I2V
LTX
HunyuanVideo I2V
```

Không thêm đồng loạt nếu chưa có test.

Mỗi model cần:

- Model definition.
- Capabilities.
- License metadata.
- ComfyUI/native template.
- Integration test.
- Example workflow.

---

# 68. Phase Media 7 — Video composition

Thêm:

```text
Storyboard Splitter
Loop Scenes
Merge Video
Add Audio
Thumbnail
```

---

# 69. Acceptance Test — ComfyUI

## Case 1

```text
ComfyUI online
```

Expected:

```text
Test Connection = SUCCESS
```

## Case 2

```text
ComfyUI offline
```

Expected:

```text
COMFYUI_UNAVAILABLE
```

Không treo request.

---

# 70. Acceptance Test — Generate Image

```text
Prompt:
"A small robot working at a desk"
```

Expected:

```text
Generate Image SUCCESS
MediaFile created
File exists in data/media
Execution output references media ID
```

---

# 71. Acceptance Test — Image To Video

Input:

```text
MediaFile image
```

Expected:

```text
Video generation submitted
Execution WAITING if async
Generation completes
Execution resumes
MP4 MediaFile created
```

---

# 72. Acceptance Test — Model not installed

```text
Wan2.2 missing locally
```

Expected:

```text
MEDIA_MODEL_NOT_INSTALLED
```

Frontend phải nêu model bị thiếu.

Không auto-download ngầm.

---

# 73. Acceptance Test — GPU resource error

Nếu local inference hết VRAM:

```text
MEDIA_RESOURCE_ERROR
```

Execution:

```text
FAILED
```

Không loop retry tự động.

---

# 74. Acceptance Test — Cloud quota

Provider trả quota/credit error:

```text
MEDIA_PROVIDER_QUOTA_EXCEEDED
```

hoặc:

```text
MEDIA_PROVIDER_INSUFFICIENT_CREDIT
```

Không retry liên tục.

---

# 75. Acceptance Test — Credential UI

Phải có:

- `ComfyUI Local`.
- `Hugging Face`.
- `Black Forest Labs`.
- Category Image Generation.
- Category Video Generation.
- Category Local Inference.
- Badge LOCAL.
- Badge OPEN-WEIGHT.
- Badge FREE CREDIT.
- Badge PAID.
- Test Connection.
- Secret masking.
- Dynamic model list.
- Task-based model filtering.

---

# 76. README local setup

Coding agent phải thêm:

```text
docs/media-local-setup.md
```

Nội dung:

```text
1. Run m2m
2. Run ComfyUI
3. Configure ComfyUI Local credential
4. Install/select FLUX image model
5. Install/select Wan video model
6. Test connection
7. Import sample workflow
8. Run FLUX -> Wan workflow
9. Locate output
10. Debug common errors
```

Không giả định tất cả developer có GPU giống nhau.

---

# 77. Sample workflows

Tạo:

```text
examples/workflows/
```

Files:

```text
local-flux-generate-image.json

local-image-to-wan-video.json

local-flux-to-wan-video.json

cloud-huggingface-image.json

bfl-flux-image.json
```

Không export credential secret.

---

# 78. Official References — ComfyUI

Documentation:

```text
https://docs.comfy.org/
```

API overview:

```text
https://docs.comfy.org/development/api-development/overview
```

Server API:

```text
https://docs.comfy.org/development/comfyui-server/comms_overview
```

Routes:

```text
https://docs.comfy.org/development/comfyui-server/comms_routes
```

Examples:

```text
https://docs.comfy.org/development/comfyui-server/api-examples
```

Repository:

```text
https://github.com/Comfy-Org/ComfyUI
```

Agent phải ưu tiên official docs.

---

# 79. Official References — Black Forest Labs / FLUX

Documentation:

```text
https://docs.bfl.ai/
```

FLUX.2:

```text
https://docs.bfl.ai/flux_2
```

Pricing:

```text
https://docs.bfl.ai/quick_start/pricing
```

FLUX.2 repository:

```text
https://github.com/black-forest-labs/flux2
```

FLUX.2 Klein training/license:

```text
https://docs.bfl.ai/flux_2/flux2_klein_training
```

Release notes:

```text
https://docs.bfl.ai/release-notes
```

---

# 80. Official References — Hugging Face

Inference Providers:

```text
https://huggingface.co/docs/inference-providers/index
```

Pricing / free credits:

```text
https://huggingface.co/docs/inference-providers/pricing
```

Agent phải đọc pricing ở thời điểm triển khai.

Không hard-code quota/free credits.

---

# 81. Official References — Wan

Wan2.2:

```text
https://github.com/Wan-Video/Wan2.2
```

Wan2.1:

```text
https://github.com/Wan-Video/Wan2.1
```

---

# 82. Official References — CogVideoX

```text
https://github.com/zai-org/CogVideo
```

---

# 83. Official References — HunyuanVideo

```text
https://github.com/Tencent-Hunyuan/HunyuanVideo
```

Image-to-video:

```text
https://github.com/Tencent-Hunyuan/HunyuanVideo-I2V
```

---

# 84. Official References — LTX

LTX-Video:

```text
https://github.com/Lightricks/LTX-Video
```

LTX-2:

```text
https://github.com/Lightricks/LTX-2
```

---

# 85. Quy tắc cho Agent khi thêm model

Trước khi thêm bất kỳ model nào:

```text
1. Mở official repository/docs.
2. Xác nhận model version.
3. Xác nhận supported task.
4. Xác nhận local/cloud.
5. Xác nhận license.
6. Xác nhận commercial-use restriction.
7. Xác nhận hardware requirement.
8. Xác nhận input/output formats.
9. Xác nhận async behavior.
10. Tạo MediaModel definition.
11. Tạo provider/template.
12. Viết integration test.
13. Thêm example workflow.
```

Không dựa vào blog SEO hoặc model aggregator nếu official docs tồn tại.

---

# 86. Quy tắc Free Tier

Agent phải dùng định nghĩa:

```text
LOCAL
= model chạy local, không có inference API fee.

FREE CREDIT
= cloud provider có credit/quota miễn phí giới hạn.

PAID
= cloud API tính phí.

BYOK
= user cung cấp key/account.
```

Không gắn nhãn `FREE` cho FLUX cloud API chỉ vì có FLUX open-weight model.

---

# 87. Quy tắc License

Mỗi `MediaModel` phải có:

```text
license.name
license.url
license.commercialUse
```

Nếu chưa chắc:

```text
commercialUse = unknown
```

UI:

```text
License requires review before production use.
```

Không suy luận:

```text
open-source/open-weight
=
free for all commercial use
```

---

# 88. Priority cuối cùng

## P0

```text
MediaProviderAdapter
Media Model Registry
MediaFile
MediaGenerationJob
ComfyUI Local credential
Generate Image
FLUX.2 Klein 4B
Image To Video
Wan2.2 TI2V-5B
Local Media Storage
Execution progress
```

## P1

```text
Hugging Face credential
Black Forest Labs credential
SDXL
CogVideoX
LTX
Storyboard Splitter
Merge Video
```

## P2

```text
HunyuanVideo
FLUX video cloud
Video-to-video
Add Audio
Cloud storage
Custom ComfyUI workflow
Additional hosted inference providers
```

---


# 89. Media Preview trực tiếp trên Workflow Canvas

Media output không được chỉ xuất hiện trong `Execution History`.

Sau khi một node tạo hoặc chỉnh sửa media chạy thành công, workflow canvas phải hiển thị preview trực tiếp ngay bên trong node hoặc output card của node.

Ví dụ:

```text
┌──────────────────────────────────┐
│ Generate Image                   │
│ SUCCESS                          │
│                                  │
│ ┌──────────────────────────────┐ │
│ │                              │ │
│ │      Generated Image         │ │
│ │                              │ │
│ └──────────────────────────────┘ │
│                                  │
│ Edit | Regenerate | ⋯            │
└──────────────────────────────────┘
```

Video:

```text
┌──────────────────────────────────┐
│ Image To Video                   │
│ SUCCESS                          │
│                                  │
│ ┌──────────────────────────────┐ │
│ │          ▶                   │ │
│ │      Video Preview           │ │
│ └──────────────────────────────┘ │
│                                  │
│ Play | Regenerate | ⋯            │
└──────────────────────────────────┘
```

Yêu cầu:

- Image node hiển thị thumbnail sau khi execution thành công.
- Video node hiển thị poster/thumbnail và nút Play.
- Không bắt buộc user phải mở trang Execution History để xem kết quả.
- Preview phải được lấy từ `MediaFile` / `MediaAsset` reference.
- Không truyền base64 lớn trực tiếp vào Vue Flow state.
- Click preview mở `Media Inspector`.
- Các action phổ biến phải có thể thực hiện trực tiếp từ canvas.

---

# 90. Canvas Media Action Toolbar

Khi hover hoặc chọn media preview, hiển thị action toolbar.

Image:

```text
View
Edit
Regenerate
Download
Delete Media
Open Execution
```

Video:

```text
Play
View
Regenerate
Download
Delete Media
Open Execution
```

Không dùng cùng một nút `Delete` cho cả:

```text
Delete Node
```

và:

```text
Delete Media
```

Hai hành động phải tách biệt rõ ràng.

Menu ví dụ:

```text
⋯
├─ View media
├─ Edit image
├─ Regenerate
├─ Download
├─ Open execution
├─ Remove node from workflow
└─ Delete media permanently
```

`Delete media permanently` phải là destructive action riêng.

---

# 91. Media Inspector

Khi click ảnh/video trên canvas:

```text
Canvas
  |
  v
Media Inspector
```

Có thể triển khai bằng:

```text
Modal
Drawer
Fullscreen overlay
```

Image Inspector phải hiển thị:

```text
Image Preview

Filename
Resolution
File size
Provider
Model
Seed
Created At
Execution ID
Node ID

[Edit Image]
[Regenerate]
[Download]
[Delete Media]
```

Video Inspector:

```text
Video Player

Duration
Resolution
FPS nếu có
File size
Provider
Model
Created At
Execution ID
Node ID

[Regenerate]
[Download]
[Delete Media]
```

---

# 92. Video Player ngay trên Canvas

Video được tạo ra phải xem được mà không rời workflow editor.

MVP:

```text
Poster Thumbnail
      |
      v
Click Play
      |
      v
Inline Video Player
```

Hoặc:

```text
Click Preview
      |
      v
Media Inspector Video Player
```

Yêu cầu:

- Không autoplay tất cả video khi load workflow.
- Không preload toàn bộ video lớn.
- Dùng metadata/poster trước.
- Chỉ tải video khi user Play hoặc mở inspector.
- Backend hỗ trợ HTTP Range request nếu cần để seek video.
- Có Play/Pause.
- Có timeline.
- Có volume.
- Có fullscreen.
- Có download.
- Có delete media.

---

# 93. Image Editor

Bổ sung Image Editor cho media image.

Luồng:

```text
Generated Image
      |
      v
Click Edit
      |
      v
Image Editor
      |
      +---- Select Object
      |
      +---- Brush Mask
      |
      +---- Erase Mask
      |
      +---- Prompt
      |
      v
Generate Edited Version
      |
      v
Before / After Preview
      |
      v
Apply
```

Không sửa binary gốc ngay lập tức.

Mỗi lần AI edit thành công phải tạo:

```text
MediaAsset Version mới
```

để hỗ trợ Undo/Restore.

---

# 94. Chọn vật thể trong ảnh

MVP phải hỗ trợ ít nhất:

```text
Brush Mask
```

User dùng brush tô vùng vật thể cần sửa/xóa.

Phase tiếp theo:

```text
Click Object
Lasso
Rectangle Selection
Automatic Segmentation
```

Kiến trúc:

```text
Image Editor
    |
    v
ObjectSelectionAdapter
    |
    +---- Manual Mask
    |
    +---- Local Segmentation Model
    |
    +---- Cloud Segmentation Provider
```

Không hard-code segmentation model vào frontend.

Output của selection:

```ts
interface ImageSelection {
  type:
    | 'mask'
    | 'polygon'
    | 'bounding-box'
    | 'segmentation';

  maskAssetId?: string;

  points?: Array<{
    x: number;
    y: number;
  }>;
}
```

---

# 95. Thay đổi vật thể bằng Prompt

Use case:

```text
User chọn chiếc xe
      |
      v
Prompt:
"Đổi chiếc xe thành xe màu đen"
      |
      v
Image Edit Node
      |
      v
Edited Image
```

Hoặc:

```text
User chọn áo
      |
      v
Prompt:
"Thay áo hiện tại bằng áo khoác màu xanh"
```

Image Editor gửi:

```text
sourceImage
selection/mask
prompt
negativePrompt
provider
model
```

Backend gọi:

```text
MediaProviderAdapter
```

với capability:

```text
image-edit
inpainting
masked-edit
```

Model dropdown phải chỉ hiển thị model có capability phù hợp.

---

# 96. Xóa vật thể bằng Prompt / Mask

User có thể:

```text
Select Object
      |
      v
Remove Object
```

Hoặc nhập prompt:

```text
"Xóa người phía sau"
```

MVP đáng tin cậy nhất:

```text
Selection/Mask
      |
      v
Remove Object
```

Backend thực hiện thông qua model/provider hỗ trợ:

```text
inpainting
masked image editing
```

Kết quả là một asset version mới.

Không overwrite file gốc ngay.

---

# 97. Image Editor UX

Bố cục đề xuất:

```text
┌──────────────────────────────────────────────────────────┐
│ Image Editor                                      Close  │
├───────────────────────────────┬──────────────────────────┤
│                               │ Tool                     │
│                               │                          │
│          IMAGE                │ Select Object            │
│                               │ Brush Mask               │
│                               │ Eraser                   │
│                               │ Reset Mask               │
│                               │                          │
│                               │ Prompt                   │
│                               │ [......................] │
│                               │                          │
│                               │ Model                    │
│                               │ [FLUX/Edit Model ▼]      │
│                               │                          │
│                               │ [Generate Preview]       │
├───────────────────────────────┴──────────────────────────┤
│ Original | Edited | Compare                             │
│                              [Cancel] [Apply Version]    │
└──────────────────────────────────────────────────────────┘
```

MVP tools:

```text
Pan
Zoom
Brush
Eraser
Reset Mask
```

P1:

```text
Object Click
Lasso
Rectangle
Auto Segment
```

---

# 98. Before / After và Versioning

Mỗi edit phải lưu quan hệ:

```text
Original Asset
      |
      +---- Version 1
      |
      +---- Version 2
      |
      +---- Version 3
```

Entity:

```ts
interface MediaAssetVersion {
  id: string;
  assetId: string;

  parentVersionId?: string;

  operation:
    | 'generated'
    | 'edit'
    | 'remove-object'
    | 'replace-object'
    | 'regenerate';

  prompt?: string;

  provider?: string;
  model?: string;

  fileId: string;

  createdAt: Date;
}
```

Image Inspector cần:

```text
Original
Previous Version
Current Version
```

Action:

```text
Restore Version
```

---

# 99. Regenerate từ Canvas

Image/video preview phải có:

```text
Regenerate
```

Khi click:

```text
Current Node Parameters
        |
        v
New Execution / Node Re-run
        |
        v
New Media Asset
```

Không overwrite media output cũ trước khi generation mới thành công.

Sau khi thành công:

```text
Set new output as current
```

và giữ history nếu retention policy cho phép.

---

# 100. Xóa ảnh trực tiếp trên Canvas

Image preview phải có action:

```text
Delete Media
```

Luồng:

```text
Click Delete Media
      |
      v
Check References
      |
      +---- No References
      |       |
      |       v
      |   Confirm Delete
      |       |
      |       v
      |   Delete Asset
      |
      +---- Has References
              |
              v
          Show Warning
```

Confirmation:

```text
Delete this generated image?

This removes the media file from local storage.
The workflow node itself will remain.

[Cancel] [Delete Media]
```

Sau khi xóa:

```text
Node vẫn tồn tại
```

nhưng preview chuyển thành:

```text
Media deleted
[Regenerate]
```

---

# 101. Xóa video trực tiếp trên Canvas

Video preview có action:

```text
Delete Media
```

Luồng giống image.

Sau khi xóa:

```text
Image To Video Node
      |
      v
Output:
MEDIA_DELETED
```

UI:

```text
Video deleted

[Regenerate]
[Open Execution]
```

Không tự động xóa input image khi xóa video.

---

# 102. Phân biệt Delete Node và Delete Media

Đây là rule bắt buộc.

## Delete Node

```text
User xóa node khỏi workflow canvas.
```

Mặc định:

```text
Không xóa media file ngay.
```

Media vẫn có thể:

- Tồn tại trong execution history.
- Được node khác tham chiếu.
- Được retention cleanup xử lý sau.

## Delete Media

```text
User chủ động xóa file ảnh/video.
```

Hành động này:

- Xóa file khỏi local media storage khi an toàn.
- Cập nhật database.
- Đánh dấu asset deleted.
- Không tự xóa node workflow.
- Không tự xóa execution history record.
- Không xóa các asset khác.

---

# 103. Soft Delete trước, Physical Delete sau

Để tránh làm hỏng workflow/execution history:

MVP ưu tiên:

```text
User Delete
    |
    v
MediaAsset.deletedAt = now
    |
    v
Preview unavailable
    |
    v
Cleanup Job
    |
    v
Physical file deletion
```

Có thể cấu hình:

```text
MEDIA_DELETE_GRACE_PERIOD_HOURS
```

Ví dụ local:

```text
24
```

Trong khoảng grace period có thể hỗ trợ:

```text
Undo Delete
```

Nếu muốn đơn giản hơn cho MVP:

```text
Soft delete ngay
Physical cleanup định kỳ
```

---

# 104. Media Reference Tracking

Không dùng filesystem path đơn thuần để quyết định có thể xóa asset.

Tạo quan hệ:

```text
MediaAsset
    |
    +---- Node Execution Output
    |
    +---- Workflow Node Parameter
    |
    +---- Media Version Parent
    |
    +---- Generated Video Input
```

Có thể dùng:

```text
MediaAssetReference
```

Fields:

```text
id
assetId

referenceType:
  node-input
  node-output
  workflow
  execution
  media-parent

referenceId

createdAt
```

Trước permanent delete:

```text
Check active references
```

---

# 105. Media Asset API

Bổ sung:

```text
GET    /api/v1/media/assets/:id
GET    /api/v1/media/assets/:id/content
GET    /api/v1/media/assets/:id/versions

POST   /api/v1/media/assets/:id/restore
POST   /api/v1/media/assets/:id/regenerate

DELETE /api/v1/media/assets/:id
```

Image editing:

```text
POST /api/v1/media/assets/:id/edit
```

Payload:

```json
{
  "prompt": "Replace the red car with a black car",
  "maskAssetId": "media_mask_123",
  "credentialId": "cred_123",
  "modelId": "..."
}
```

Nếu operation chạy lâu:

```text
POST edit
   |
   v
MediaGenerationJob
   |
   v
202 Accepted
```

---

# 106. Media Preview API và File Serving

Không trả local path kiểu:

```text
C:\project\data\media\...
```

cho frontend.

Frontend chỉ nhận:

```text
assetId
previewUrl
contentUrl
```

Ví dụ:

```text
/api/v1/media/assets/media_123/content
```

Backend chịu trách nhiệm:

- Resolve file path.
- Check asset state.
- Set MIME type.
- Support video range request.
- Prevent path traversal.
- Không cho user nhập filesystem path tùy ý.
- Không expose thư mục `data/media` trực tiếp nếu không cần.

---

# 107. Canvas State không chứa Binary Media

Vue Flow state chỉ lưu:

```ts
{
  mediaAssetId: "media_123",
  previewUrl: "/api/v1/media/assets/media_123/content",
  mediaType: "image"
}
```

Không lưu:

```text
base64 video
base64 full-resolution image
Blob lớn trong workflow JSON
```

Mục tiêu:

- Workflow JSON nhỏ.
- Reload canvas nhanh.
- Không làm Pinia/Vue Flow state quá lớn.
- Không làm autosave gửi hàng chục MB.

---

# 108. Phase Media 8 — Media Canvas & Image Editor

Đây là phase bắt buộc sau khi:

```text
Generate Image
Image To Video
```

đã chạy ổn định.

## Step 1 — Canvas Preview

Xây:

- Image thumbnail trong node.
- Video poster trong node.
- Media Inspector.
- Inline/open video player.

Acceptance:

```text
User chạy workflow
      |
      v
Image/video xuất hiện trực tiếp trên canvas.
```

## Step 2 — Canvas Actions

Xây:

```text
View
Download
Regenerate
Delete Media
```

Acceptance:

```text
User có thể xóa ảnh/video từ action trên preview.
```

## Step 3 — Image Editor

Xây:

```text
Brush Mask
Eraser
Prompt
Generate Edited Version
Before/After
Apply
```

Acceptance:

```text
Image
  ->
Select Object
  ->
Prompt
  ->
Edited Image
```

## Step 4 — Remove Object

Xây:

```text
Mask
  ->
Remove Object
  ->
New Media Version
```

## Step 5 — Object Selection nâng cao

P1:

```text
Click Object
Automatic Segmentation
Lasso
Rectangle
```

## Step 6 — Versioning

Xây:

```text
Original
Edited Versions
Restore
```

## Step 7 — Asset Lifecycle

Xây:

```text
Soft Delete
Reference Check
Cleanup
```

---

# 109.1. Acceptance Test — Replace Object bằng Prompt

Workflow:

```text
Manual Trigger
      |
      v
Generate Image
```

Trên canvas:

```text
Open Image
  ->
Edit
  ->
Brush object
  ->
Prompt:
"Replace the red cup with a blue cup"
  ->
Generate Preview
  ->
Apply
```

Expected:

```text
New MediaAssetVersion created.
Original image remains available.
Current preview changes to edited image.
Execution/media history records provider/model.
```

---

# 109.2. Acceptance Test — Remove Object

```text
Open Image
  ->
Select object using mask
  ->
Remove Object
```

Expected:

```text
New edited version.
Original asset not overwritten.
```

---

# 109.3. Acceptance Test — Delete Image on Canvas

```text
Generated Image
  ->
Delete Media
  ->
Confirm
```

Expected:

```text
Asset soft-deleted.
Image disappears from preview.
Node remains on workflow canvas.
Regenerate action remains available.
Execution record remains readable.
```

---

# 109.4. Acceptance Test — Delete Video on Canvas

```text
Generated Video
  ->
Delete Media
  ->
Confirm
```

Expected:

```text
Video becomes unavailable.
Video file scheduled for physical cleanup.
Input image is not deleted.
Image To Video node remains.
```

---

# 109.5. Acceptance Test — Delete Node

```text
Generated Image Node
  ->
Delete Node
```

Expected:

```text
Node removed from workflow.
Existing execution media is NOT immediately physically deleted.
Retention/reference policy handles media separately.
```

---

# 109.6. Acceptance Test — Referenced Asset

Ví dụ:

```text
Image Asset
   |
   v
Image To Video
```

User chọn:

```text
Delete Media
```

Nếu asset đang được workflow hiện tại tham chiếu:

Expected:

```text
Warning:
"This image is used by Image To Video."

Options:
Cancel
Remove reference and delete
```

Không âm thầm làm hỏng downstream node.

---

# 109.7. Acceptance Test — Video Preview

Sau execution:

```text
Image To Video SUCCESS
```

Expected:

```text
Video poster visible on canvas.
User can Play.
User can Pause.
User can seek if backend supports range.
User can open fullscreen viewer.
User can download.
User can delete media.
```

---

# 109.8. Error Handling cho Media Canvas

Chuẩn hóa thêm error:

```text
MEDIA_ASSET_NOT_FOUND
MEDIA_ASSET_DELETED
MEDIA_ASSET_IN_USE
MEDIA_EDIT_UNSUPPORTED
MEDIA_MASK_INVALID
MEDIA_EDIT_FAILED
MEDIA_PREVIEW_FAILED
MEDIA_FILE_READ_ERROR
MEDIA_DELETE_FAILED
```

UI không chỉ hiển thị:

```text
Internal Server Error
```

Ví dụ:

```text
This media was deleted.
Regenerate the node to create a new output.
```

---

# 109.9. Definition of Done bổ sung cho Media Canvas

Media expansion chưa được xem là hoàn chỉnh nếu chỉ tạo được file.

Bắt buộc pass thêm:

- [ ] Generated image hiển thị trực tiếp trên workflow canvas.
- [ ] Generated video hiển thị trực tiếp trên workflow canvas.
- [ ] Video có thể Play/View từ canvas.
- [ ] Click image mở Media Inspector.
- [ ] Click video mở Media Inspector.
- [ ] Image có action Edit.
- [ ] Image có action Regenerate.
- [ ] Image có action Download.
- [ ] Image có action Delete Media.
- [ ] Video có action Regenerate.
- [ ] Video có action Download.
- [ ] Video có action Delete Media.
- [ ] User có thể brush mask một vùng/vật thể.
- [ ] User có thể thay đổi vùng/vật thể bằng prompt.
- [ ] User có thể xóa vật thể bằng mask/edit model.
- [ ] Edit tạo version mới, không overwrite bản gốc.
- [ ] Có Before/After preview.
- [ ] Có thể Restore version cũ.
- [ ] Delete Node không đồng nghĩa Delete Media.
- [ ] Delete Media không tự xóa workflow node.
- [ ] Asset đang được tham chiếu phải cảnh báo trước khi xóa.
- [ ] Video deletion không xóa input image.
- [ ] Canvas state không chứa binary media lớn.
- [ ] Backend không expose filesystem path.
- [ ] Media soft-delete/cleanup hoạt động.

---

# 109. Definition of Done

Media expansion được xem là hoàn thành ở mức đầu tiên khi:

```text
1. m2m chạy localhost.
2. ComfyUI chạy localhost.
3. User thêm credential "ComfyUI Local".
4. Test Connection thành công.
5. User tạo workflow.
6. User thêm Generate Image node.
7. User chọn FLUX local model.
8. Image được generate.
9. User nối Image To Video.
10. User chọn Wan local model.
11. Video được generate.
12. Media output được lưu local.
13. Execution history hiển thị image/video.
14. Workflow chạy lại được.
15. Lỗi provider/model/GPU hiển thị rõ.
16. Credential form có LOCAL/FREE CREDIT/PAID badges.
17. Hugging Face và BFL credentials có thể được thêm độc lập.
18. Không có secret bị trả xuống frontend.
19. Generated image hiển thị trực tiếp trên workflow canvas.
20. Generated video xem được trực tiếp từ workflow canvas.
21. User có thể mở Image Editor từ image preview.
22. User có thể brush mask/chọn vùng cần sửa.
23. User có thể thay đổi vật thể/vùng ảnh bằng prompt.
24. User có thể xóa vật thể bằng mask + image edit/inpainting capability.
25. Mỗi edit tạo media version mới.
26. User có thể xem Before/After và restore version trước.
27. User có thể Delete Media trực tiếp từ image preview.
28. User có thể Delete Media trực tiếp từ video preview.
29. Delete Media và Delete Node là hai hành động độc lập.
30. Asset reference được kiểm tra trước permanent deletion.
31. Canvas không lưu binary/base64 media lớn trong workflow JSON.
```

---

# 110. Prompt cố định cho Coding Agent

```text
M2M MEDIA EXPANSION REQUIREMENT

The m2m core project is already working.

The next goal is to add first-class image and video generation workflows,
with priority on generating videos automatically from images.

Keep the existing localhost-first and single-user-first architecture.

Implement in this order:

1. Create a MediaProviderAdapter abstraction.
2. Create a dynamic Media Model Registry.
3. Create MediaFile and MediaGenerationJob persistence.
4. Add ComfyUI Local as the first media provider.
5. Add ComfyUI Local to the Add Credential form.
6. Add Generate Image node.
7. Target FLUX.2 Klein 4B as the first local/open-weight image model.
8. Add Image To Video node.
9. Target Wan2.2 TI2V-5B as the first local image-to-video model.
10. Store generated media outside SQLite and persist references/metadata.
11. Handle long-running generation asynchronously.
12. Show generation progress/status in the existing execution UI.
13. Add Hugging Face to Add Credential as a FREE CREDIT / BYOK provider.
14. Add Black Forest Labs to Add Credential as a PAID / BYOK provider.
15. Add model/provider cost badges: LOCAL, OPEN-WEIGHT, FREE CREDIT, PAID, BYOK.
16. Never hard-code cloud quotas or prices.
17. Fetch or verify current official provider documentation before implementation.
18. Store model license metadata and do not assume open weights allow unrestricted commercial use.
19. Add task-aware dynamic model dropdowns.
20. Add CogVideoX, LTX and HunyuanVideo only after the FLUX -> Wan local flow works.
21. Add sample workflow:
    Prompt -> FLUX Image -> Wan Image-to-Video -> Save Media.
22. Add integration tests and document local setup.
23. Render generated image previews directly inside workflow canvas nodes.
24. Render generated video previews/player access directly inside workflow canvas nodes.
25. Add a Media Inspector for image/video metadata and actions.
26. Add an Image Editor opened from the canvas.
27. Support Brush Mask and Eraser in the first Image Editor version.
28. Allow the user to replace a selected image region/object using a prompt.
29. Allow the user to remove a selected object using mask + image-edit/inpainting capability.
30. Save each image edit as a new MediaAssetVersion instead of overwriting the original.
31. Add Before/After comparison and Restore Version.
32. Add Regenerate, Download and Delete Media actions directly on media previews.
33. Keep Delete Node and Delete Media as separate actions.
34. Check MediaAsset references before permanent deletion.
35. Use soft delete plus cleanup for generated media.
36. Never store large base64 image/video binaries in workflow JSON or Vue Flow state.
37. Never expose local filesystem paths directly to the frontend.
38. Add end-to-end tests for edit, replace-object, remove-object, image deletion and video deletion.

Before implementing each provider/model, read its official documentation/repository
listed in this plan and document any behavior that differs from m2m.
```
