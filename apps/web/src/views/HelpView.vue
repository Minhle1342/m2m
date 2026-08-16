<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from '../services/i18n';
import { useAppStore } from '../stores/app';

const { locale, t } = useI18n();
const app = useAppStore();
const searchQuery = ref('');
const activeSection = ref('overview');

function copyText(code: string) {
  navigator.clipboard.writeText(code);
  app.notify(t('help.copied'));
}

const isVi = computed(() => locale.value === 'vi');

const shortcuts = [
  { key: 'Ctrl + Z', actionVi: 'Hoàn tác thay đổi vừa thực hiện', actionEn: 'Undo last change' },
  { key: 'Ctrl + Shift + Z / Ctrl + Y', actionVi: 'Làm lại thay đổi đã hoàn tác', actionEn: 'Redo previously undone change' },
  { key: 'Ctrl + S', actionVi: 'Lưu quy trình ngay lập tức', actionEn: 'Save workflow immediately' },
  { key: 'Delete / Backspace', actionVi: 'Xóa khối hoặc đường nối đang chọn', actionEn: 'Delete selected node or edge' },
  { key: 'Shift + Click', actionVi: 'Chọn nhiều khối cùng lúc', actionEn: 'Multi-select nodes' },
  { key: 'Lăn chuột / Mouse wheel', actionVi: 'Thu phóng Canvas (Zoom In / Out)', actionEn: 'Zoom in / out canvas' },
  { key: 'Hover vào Media Node', actionVi: 'Mở thanh công cụ Xem, Sửa ảnh, Tải về, Xóa Media', actionEn: 'Open quick toolbar: View, Edit, Download, Delete Media' }
];

const expressions = [
  { syntax: '{{$json.fieldName}}', descVi: 'Lấy giá trị của trường fieldName từ kết quả node trước', descEn: 'Extract fieldName from previous node output' },
  { syntax: '{{$json.media.previewUrl}}', descVi: 'Lấy đường dẫn URL của ảnh hoặc video vừa sinh ra', descEn: 'Get preview URL of the generated image or video asset' },
  { syntax: '{{$json.optimizedPrompt}}', descVi: 'Lấy câu prompt đã được AI tối ưu hóa cho FLUX/Wan', descEn: 'Get AI-enhanced prompt optimized for FLUX/Wan' },
  { syntax: '{{$node["Tên Node"].json.field}}', descVi: 'Lấy dữ liệu từ một node cụ thể theo tên', descEn: 'Reference a specific upstream node output by name' },
  { syntax: '{{$workflow.id}}', descVi: 'ID định danh của quy trình hiện tại', descEn: 'Current workflow unique identifier' },
  { syntax: '{{$execution.id}}', descVi: 'ID của lượt chạy hiện tại', descEn: 'Current execution run identifier' }
];

const nodeCategories = computed(() => [
  {
    categoryVi: 'Bộ kích hoạt (Triggers)',
    categoryEn: 'Triggers',
    icon: '▶',
    nodes: [
      { nameVi: 'Kích hoạt thủ công (Manual Trigger)', nameEn: 'Manual Trigger', descVi: 'Chạy quy trình theo yêu cầu với payload tùy chỉnh ngay trên giao diện.', descEn: 'Start execution on-demand with custom test payload.' },
      { nameVi: 'Kích hoạt Webhook (Webhook Trigger)', nameEn: 'Webhook Trigger', descVi: 'Nhận yêu cầu HTTP (POST/GET) từ dịch vụ bên ngoài gửi đến endpoint.', descEn: 'Receive incoming HTTP calls from external services.' },
      { nameVi: 'Kích hoạt Lập lịch (Schedule Trigger)', nameEn: 'Schedule Trigger', descVi: 'Chạy tự động theo định kỳ phút, giờ, ngày, tuần hoặc biểu thức Cron.', descEn: 'Run recurring executions using interval or 5-field Cron.' }
    ]
  },
  {
    categoryVi: 'Tạo Ảnh & Video AI (Media Generation)',
    categoryEn: 'Media Generation (FLUX & Wan)',
    icon: '🎬',
    nodes: [
      { nameVi: 'Tạo ảnh từ Prompt (Generate Image)', nameEn: 'Generate Image', descVi: 'Tạo ảnh chân thực độ nét cao bằng FLUX.2 Klein 4B, SDXL, Hugging Face hoặc BFL.', descEn: 'Generate high fidelity images using FLUX.2 Klein 4B, SDXL, or Cloud APIs.' },
      { nameVi: 'Tạo video từ ảnh (Image To Video)', nameEn: 'Image To Video', descVi: 'Biến ảnh tĩnh thành video chuyển động điện ảnh mượt mà bằng Wan2.2 TI2V-5B hoặc CogVideoX.', descEn: 'Animate static images into cinematic video using Wan2.2 TI2V-5B or CogVideoX.' },
      { nameVi: 'Chỉnh sửa ảnh / Inpaint (Edit Image)', nameEn: 'Edit Image / Inpaint', descVi: 'Vẽ cọ mask trực tiếp để thay đổi hoặc xóa bỏ vật thể trong ảnh theo prompt.', descEn: 'Interactive brush mask canvas to replace or remove objects in images.' },
      { nameVi: 'Tách phân cảnh (Storyboard Splitter)', nameEn: 'Storyboard Splitter', descVi: 'Phân tách kịch bản dài thành chuỗi prompt từng khung hình video.', descEn: 'Decompose a narrative script into structured scene shot prompts.' },
      { nameVi: 'Tối ưu Prompt Media (Media Prompt Builder)', nameEn: 'Media Prompt Builder', descVi: 'AI hỗ trợ tự động gợi ý từ khóa ánh sáng, phong cách nghệ thuật và góc quay camera.', descEn: 'AI optimizer for lighting, camera direction, and style keywords.' },
      { nameVi: 'Lưu trữ Media (Save Media)', nameEn: 'Save Media', descVi: 'Xuất ảnh và video ra thư mục đĩa cứng cục bộ theo quy tắc đặt tên tự động.', descEn: 'Export generated media to local storage directory with custom filenames.' }
    ]
  },
  {
    categoryVi: 'Trí tuệ nhân tạo (AI & LLM)',
    categoryEn: 'AI & LLM',
    icon: '✦',
    nodes: [
      { nameVi: 'Nhắc lệnh AI (AI Prompt)', nameEn: 'AI Prompt', descVi: 'Gửi prompt đến AI (Ollama cục bộ, Gemini API, OpenAI) để sinh nội dung văn bản.', descEn: 'Prompt local Ollama or cloud models (Gemini, OpenAI).' },
      { nameVi: 'Tác tử AI (AI Agent)', nameEn: 'AI Agent', descVi: 'Tác tử thông minh có khả năng suy luận đa bước và tự động gọi các công cụ.', descEn: 'Autonomous reasoning agent with tool execution capabilities.' },
      { nameVi: 'Đầu ra Cấu trúc (Structured Output)', nameEn: 'Structured Output', descVi: 'Ép mô hình AI trả về dữ liệu đúng chuẩn định dạng JSON Schema.', descEn: 'Enforce strict JSON schema on model responses.' },
      { nameVi: 'Véc-tơ Embeddings & Kho lưu trữ', nameEn: 'Embeddings & Vector Store', descVi: 'Tạo véc-tơ ngữ nghĩa và tìm kiếm thông tin tương đồng.', descEn: 'Generate embeddings and perform semantic vector search.' }
    ]
  },
  {
    categoryVi: 'Tác vụ hệ thống (Core Actions)',
    categoryEn: 'Core Actions',
    icon: '⌁',
    nodes: [
      { nameVi: 'Thiết lập dữ liệu (Set Data)', nameEn: 'Set Data', descVi: 'Gán biến, tạo payload JSON mới hoặc mở rộng dữ liệu đầu vào.', descEn: 'Assign variables, create new JSON objects, or extend payload.' },
      { nameVi: 'Điều kiện IF (IF Condition)', nameEn: 'IF Condition', descVi: 'So sánh giá trị (bằng, lớn hơn, chứa...) và phân nhánh true/false.', descEn: 'Evaluate condition and route execution to true or false handle.' },
      { nameVi: 'Yêu cầu HTTP (HTTP Request)', nameEn: 'HTTP Request', descVi: 'Gửi request GET, POST, PUT, DELETE đến bất kỳ API bên ngoài nào.', descEn: 'Call external REST/GraphQL APIs with custom headers & body.' },
      { nameVi: 'Mã JavaScript (JavaScript Code)', nameEn: 'JavaScript Code', descVi: 'Biến đổi dữ liệu phức tạp bằng code JavaScript tùy biến.', descEn: 'Custom JavaScript logic for complex data transformations.' },
      { nameVi: 'Phân luồng (Switch Router)', nameEn: 'Switch Router', descVi: 'Điều hướng nhiều nhánh khác nhau theo quy tắc khớp dữ liệu.', descEn: 'Multi-branch routing according to match conditions.' }
    ]
  }
]);
</script>

<template>
  <section class="page help-page">
    <header class="page-head">
      <div>
        <p class="eyebrow">{{ t('help.eyebrow') }}</p>
        <h1>{{ t('help.title') }}</h1>
        <p>{{ t('help.subtitle') }}</p>
      </div>
      <div class="doc-badge-wrap">
        <span class="badge active">docs/user-guide.md</span>
        <span class="badge" style="background: #19271c; color: var(--lime); border-color: #2e5234;">FLUX.2 & Wan2.2 Ready</span>
      </div>
    </header>

    <div class="help-grid-layout">
      <!-- Quick Navigation Sidebar -->
      <aside class="help-toc">
        <h3>{{ isVi ? 'Mục lục nhanh' : 'Quick Navigation' }}</h3>
        <nav>
          <a
            href="#overview"
            :class="{ active: activeSection === 'overview' }"
            @click="activeSection = 'overview'"
          >
            1. {{ isVi ? 'Tổng quan' : 'Overview' }}
          </a>
          <a
            href="#media-features"
            :class="{ active: activeSection === 'media-features' }"
            @click="activeSection = 'media-features'"
          >
            2. {{ isVi ? 'Tạo Ảnh & Video AI (FLUX & Wan)' : 'AI Media Generation' }}
          </a>
          <a
            href="#image-editor"
            :class="{ active: activeSection === 'image-editor' }"
            @click="activeSection = 'image-editor'"
          >
            3. {{ isVi ? 'Trình sửa ảnh & Cọ vẽ Mask' : 'Image Editor & Inpainting' }}
          </a>
          <a
            href="#concepts"
            :class="{ active: activeSection === 'concepts' }"
            @click="activeSection = 'concepts'"
          >
            4. {{ isVi ? 'Danh mục Khối xử lý (Nodes)' : 'Node Taxonomy' }}
          </a>
          <a
            href="#workflow-steps"
            :class="{ active: activeSection === 'workflow-steps' }"
            @click="activeSection = 'workflow-steps'"
          >
            5. {{ isVi ? 'Xây dựng quy trình từng bước' : 'Step-by-Step Tutorial' }}
          </a>
          <a
            href="#expressions"
            :class="{ active: activeSection === 'expressions' }"
            @click="activeSection = 'expressions'"
          >
            6. {{ isVi ? 'Cú pháp biểu thức' : 'Expression Syntax' }}
          </a>
          <a
            href="#shortcuts"
            :class="{ active: activeSection === 'shortcuts' }"
            @click="activeSection = 'shortcuts'"
          >
            7. {{ isVi ? 'Phím tắt thao tác' : 'Keyboard Shortcuts' }}
          </a>
          <a
            href="#credentials"
            :class="{ active: activeSection === 'credentials' }"
            @click="activeSection = 'credentials'"
          >
            8. {{ isVi ? 'Khóa xác thực & ComfyUI' : 'Credentials & ComfyUI' }}
          </a>
        </nav>
      </aside>

      <!-- Main Content Area -->
      <main class="help-main-content">
        <!-- 1. Overview -->
        <article id="overview" class="doc-card">
          <div class="doc-header">
            <span class="doc-step-num">01</span>
            <h2>{{ isVi ? 'Tổng quan về m2m Automation Studio' : 'Overview of m2m Automation Studio' }}</h2>
          </div>
          <p v-if="isVi">
            <strong>m2m (Max to Minus)</strong> là giải pháp tự động hóa quy trình làm việc (visual workflow automation) chuyên nghiệp, kết hợp giữa các luồng xử lý dữ liệu hệ thống, suy luận AI tác tử và <strong>pipeline tạo hình ảnh / video AI điện ảnh tiên tiến nhất hiện nay (FLUX.2 Klein 4B & Wan2.2 TI2V-5B)</strong>.
          </p>
          <p v-else>
            <strong>m2m (Max to Minus)</strong> is a state-of-the-art visual workflow automation studio combining resilient event-driven execution with advanced AI reasoning and <strong>first-class local AI image and video generation pipelines (FLUX.2 Klein 4B & Wan2.2 TI2V-5B)</strong>.
          </p>

          <div class="doc-callout info">
            <span class="callout-icon">💡</span>
            <div>
              <strong>{{ isVi ? 'Kiến trúc lưu trữ an toàn & hiệu năng cao' : 'High Performance & Safe Storage' }}</strong>
              <p>
                {{
                  isVi
                    ? 'Tất cả file ảnh và video được lưu trữ tại ./data/media/ độc lập với SQLite. Giao diện canvas chỉ truyền tải metadata và liên kết xem trước nhẹ nhàng, đảm bảo canvas luôn mượt mà 60fps kể cả với luồng video 4K.'
                    : 'Generated media binaries are saved into ./data/media/ outside SQLite. Canvas nodes only handle lightweight URLs and metadata, keeping Vue Flow smooth even with high resolution video workflows.'
                }}
              </p>
            </div>
          </div>
        </article>

        <!-- 2. AI Media Generation Feature -->
        <article id="media-features" class="doc-card">
          <div class="doc-header">
            <span class="doc-step-num">02</span>
            <h2>{{ isVi ? 'Tạo Ảnh & Video AI (FLUX.2 & Wan2.2)' : 'AI Image & Video Generation (FLUX & Wan)' }}</h2>
          </div>
          <p v-if="isVi">
            m2m tích hợp sẵn các mô hình sinh ảnh và video chất lượng điện ảnh cao cấp:
          </p>
          <p v-else>
            m2m features native support for local open-weight and cloud media models:
          </p>

          <div class="model-highlights-grid">
            <div class="model-card">
              <div class="model-badge-head">
                <span class="cost-pill local">LOCAL</span>
                <span class="cost-pill open-weight">OPEN-WEIGHT</span>
              </div>
              <h4>FLUX.2 [klein] 4B</h4>
              <p>{{ isVi ? 'Tạo ảnh từ văn bản siêu nét, giấy phép Apache 2.0, tối ưu VRAM (chạy mượt trên GPU từ 6GB-12GB).' : 'High-fidelity text-to-image, Apache 2.0 license, optimized for 6GB-12GB VRAM.' }}</p>
            </div>

            <div class="model-card">
              <div class="model-badge-head">
                <span class="cost-pill local">LOCAL</span>
                <span class="cost-pill open-weight">OPEN-WEIGHT</span>
              </div>
              <h4>Wan2.2 TI2V-5B</h4>
              <p>{{ isVi ? 'Biến ảnh tĩnh thành video chuyển động chân thực 5 giây, kiểm soát góc máy và hiệu ứng chuyển động mượt mà.' : 'Animate images into 5s cinematic videos with camera & motion control.' }}</p>
            </div>

            <div class="model-card">
              <div class="model-badge-head">
                <span class="cost-pill free-credit">FREE CREDIT</span>
                <span class="cost-pill byok">BYOK</span>
              </div>
              <h4>Hugging Face Inference</h4>
                <p>{{ isVi ? 'Chạy FLUX.1 Schnell tạo ảnh và LTX Video tạo video từ ảnh qua cloud, dùng credit hàng tháng của Hugging Face.' : 'Run FLUX.1 Schnell image generation and LTX image-to-video in the cloud using monthly Hugging Face credits.' }}</p>
            </div>

            <div class="model-card">
              <div class="model-badge-head">
                <span class="cost-pill paid">PAID</span>
                <span class="cost-pill byok">BYOK</span>
              </div>
              <h4>Black Forest Labs</h4>
              <p>{{ isVi ? 'API thương mại chính hãng từ tác giả FLUX: FLUX 1.1 [pro] và FLUX.1 [dev].' : 'Enterprise cloud API directly from BFL: FLUX 1.1 [pro] & FLUX.1 [dev].' }}</p>
            </div>
          </div>

          <div class="doc-subgroup">
            <h3>{{ isVi ? 'Trình xem trực tiếp & Thao tác nhanh trên Canvas' : 'Canvas Live Preview & Quick Actions' }}</h3>
            <p v-if="isVi">
              Khi một node tạo ảnh hoặc video hoàn thành, ảnh thumbnail hoặc video player sẽ <strong>hiển thị trực tiếp ngay trên khối node</strong>. Bạn chỉ cần rê chuột vào ảnh để kích hoạt thanh công cụ:
            </p>
            <p v-else>
              When a generation node completes, its thumbnail or video poster renders <strong>directly on the canvas node</strong> with a hover toolbar:
            </p>
            <ul class="feature-bullets">
              <li><strong>🔍 {{ isVi ? 'Xem (View / Inspector)' : 'View in Inspector' }}:</strong> {{ isVi ? 'Phóng to ảnh hoặc mở trình phát video chuẩn HTML5 (seek bar, time, fullscreen) kèm thông số chi tiết.' : 'Zoom high-res image or play video with seek bar, duration and specs.' }}</li>
              <li><strong>✏️ {{ isVi ? 'Sửa ảnh (Edit Image)' : 'Edit Image' }}:</strong> {{ isVi ? 'Mở trình chỉnh sửa ảnh với cọ vẽ Mask tô chọn vật thể để inpainting / thay thế vật thể.' : 'Open interactive canvas brush editor to replace or remove objects.' }}</li>
              <li><strong>⬇ {{ isVi ? 'Tải về (Download)' : 'Download' }}:</strong> {{ isVi ? 'Lưu ngay tệp ảnh PNG hoặc video MP4 về máy tính.' : 'Instantly save PNG or MP4 to your computer.' }}</li>
              <li><strong>🗑 {{ isVi ? 'Xóa Media (Delete Media)' : 'Delete Media' }}:</strong> {{ isVi ? 'Xóa tệp media khỏi đĩa cứng lưu trữ nhưng vẫn giữ nguyên node trên canvas.' : 'Remove media binary from disk while preserving the workflow node configuration.' }}</li>
            </ul>
          </div>
        </article>

        <!-- 3. Image Editor Modal & Brush Mask -->
        <article id="image-editor" class="doc-card">
          <div class="doc-header">
            <span class="doc-step-num">03</span>
            <h2>{{ isVi ? 'Trình chỉnh sửa ảnh & Cọ vẽ Mask (Image Inpainting)' : 'Image Editor & Brush Inpainting' }}</h2>
          </div>
          <p v-if="isVi">
            Tính năng <strong>Image Editor</strong> cho phép bạn chỉnh sửa cục bộ bất kỳ hình ảnh nào do quy trình tạo ra mà không làm mất bố cục gốc:
          </p>
          <p v-else>
            The built-in <strong>Image Editor</strong> lets you perform inpainting and object modifications without leaving m2m:
          </p>

          <div class="editor-guide-box">
            <div class="guide-step">
              <span class="g-num">1</span>
              <div>
                <strong>{{ isVi ? 'Tô chọn vùng cần sửa bằng Cọ Mask' : 'Paint the Region with Brush Mask' }}</strong>
                <p>{{ isVi ? 'Dùng công cụ Cọ vẽ (Brush) tô lớp màu đỏ lên vật thể (ví dụ: chiếc xe, trang phục, vật cản phía sau). Bạn có thể chỉnh kích thước cọ hoặc dùng Tẩy (Eraser).' : 'Use the red brush to highlight any object you want to change. Adjust brush radius or use Eraser.' }}</p>
              </div>
            </div>

            <div class="guide-step">
              <span class="g-num">2</span>
              <div>
                <strong>{{ isVi ? 'Chọn chế độ & Nhập prompt' : 'Select Operation & Prompt' }}</strong>
                <p>{{ isVi ? 'Chọn "Thay đổi vật thể" (vd: "Đổi chiếc xe thành siêu xe màu đỏ neon") hoặc chọn "Xóa vật thể" để AI tự bù nền tự nhiên.' : 'Choose "Replace Object" (e.g. "red neon sports car") or "Remove Object" to seamlessly blend background.' }}</p>
              </div>
            </div>

            <div class="guide-step">
              <span class="g-num">3</span>
              <div>
                <strong>{{ isVi ? 'So sánh Trước / Sau & Lịch sử phiên bản' : 'Compare Before/After & Versions' }}</strong>
                <p>{{ isVi ? 'Xem so sánh Side-by-side trước và sau khi chỉnh sửa. Mọi lần sửa đều được lưu vào Lịch sử phiên bản (Version History) để bạn có thể Khôi phục (Restore) bất cứ lúc nào.' : 'View side-by-side comparison tabs. Every edit is tracked in Version History and can be restored anytime.' }}</p>
              </div>
            </div>

            <div class="guide-step">
              <span class="g-num">4</span>
              <div>
                <strong>{{ isVi ? 'Áp dụng lên Canvas' : 'Apply to Canvas' }}</strong>
                <p>{{ isVi ? 'Nhấn nút "Áp dụng phiên bản lên Canvas" để cập nhật ngay kết quả mới cho các bước tạo video hoặc lưu trữ tiếp theo.' : 'Click "Apply Version to Canvas" to update the node output for downstream video generation.' }}</p>
              </div>
            </div>
          </div>
        </article>

        <!-- 4. Core Concepts & Taxonomy -->
        <article id="concepts" class="doc-card">
          <div class="doc-header">
            <span class="doc-step-num">04</span>
            <h2>{{ isVi ? 'Danh mục Khối xử lý (Node Taxonomy)' : 'Node Taxonomy & Categories' }}</h2>
          </div>
          <p v-if="isVi">
            Quy trình được hình thành từ các khối (Nodes) kết nối với nhau qua các cổng kết nối (Handles). Dưới đây là các nhóm khối chính:
          </p>
          <p v-else>
            Workflows are assembled by dragging nodes onto the canvas and linking their ports:
          </p>

          <div class="category-block-list">
            <div v-for="cat in nodeCategories" :key="cat.categoryEn" class="category-block">
              <div class="category-title">
                <span class="category-icon">{{ cat.icon }}</span>
                <h3>{{ isVi ? cat.categoryVi : cat.categoryEn }}</h3>
              </div>
              <div class="node-item-grid">
                <div v-for="node in cat.nodes" :key="node.nameEn" class="node-info-card">
                  <strong>{{ isVi ? node.nameVi : node.nameEn }}</strong>
                  <p>{{ isVi ? node.descVi : node.descEn }}</p>
                </div>
              </div>
            </div>
          </div>
        </article>

        <!-- 5. Step-by-Step Workflow Guide -->
        <article id="workflow-steps" class="doc-card">
          <div class="doc-header">
            <span class="doc-step-num">05</span>
            <h2>{{ isVi ? 'Hướng dẫn từng bước xây dựng quy trình' : 'Step-by-Step Workflow Tutorial' }}</h2>
          </div>

          <div class="steps-flow">
            <div class="step-card">
              <span class="step-badge">1</span>
              <h4>{{ isVi ? 'Tạo quy trình mới' : 'Create Workflow' }}</h4>
              <p>{{ isVi ? 'Nhấn "＋ Quy trình mới" tại trang Quy trình hoặc chọn mẫu sẵn có trong danh sách Template.' : 'Click "＋ New workflow" or pick a pre-built template from the gallery.' }}</p>
            </div>

            <div class="step-card">
              <span class="step-badge">2</span>
              <h4>{{ isVi ? 'Kéo thả & Nối khối' : 'Drag & Connect' }}</h4>
              <p>{{ isVi ? 'Kéo các node vào canvas, nối đầu ra Generate Image với Image To Video; chọn Wan2.2 local hoặc LTX cloud theo cấu hình máy.' : 'Connect Generate Image to Image To Video, then choose local Wan2.2 or cloud LTX for your hardware.' }}</p>
            </div>

            <div class="step-card">
              <span class="step-badge">3</span>
              <h4>{{ isVi ? 'Cấu hình tham số' : 'Configure Properties' }}</h4>
              <p>{{ isVi ? 'Chỉnh kích thước, steps và prompt; chọn credential ComfyUI cho local hoặc Hugging Face cho cloud.' : 'Tune resolution, steps, and prompts; use a ComfyUI credential locally or Hugging Face for cloud inference.' }}</p>
            </div>

            <div class="step-card">
              <span class="step-badge">4</span>
              <h4>{{ isVi ? 'Kiểm tra & Chạy thử' : 'Validate & Run' }}</h4>
              <p>{{ isVi ? 'Bấm "Kiểm tra" rồi nhấn "▶ Chạy" để quan sát tiến trình tạo ảnh và video trực tiếp.' : 'Click "Validate", then "▶ Run" to watch live generation progress on canvas.' }}</p>
            </div>

            <div class="step-card">
              <span class="step-badge">5</span>
              <h4>{{ isVi ? 'Kích hoạt tự động' : 'Activate Automation' }}</h4>
              <p>{{ isVi ? 'Nhấn nút "Kích hoạt" để quy trình tự động sinh video theo lịch trình hoặc nhận trigger qua Webhook.' : 'Toggle "Activate" to automate recurring media creation via Webhooks or Cron.' }}</p>
            </div>
          </div>
        </article>

        <!-- 6. Expressions -->
        <article id="expressions" class="doc-card">
          <div class="doc-header">
            <span class="doc-step-num">06</span>
            <h2>{{ isVi ? 'Cú pháp Biểu thức Động (Expression Syntax)' : 'Dynamic Expression Syntax' }}</h2>
          </div>
          <p v-if="isVi">
            Bạn có thể dùng cú pháp <code>&#123;&#123; $json.property &#125;&#125;</code> để truyền dữ liệu và đường dẫn media linh hoạt giữa các bước:
          </p>
          <p v-else>
            Use expression syntax within parameters to pass runtime data and media asset paths dynamically between nodes:
          </p>

          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{{ isVi ? 'Cú pháp' : 'Syntax' }}</th>
                  <th>{{ isVi ? 'Mô tả tác dụng' : 'Description' }}</th>
                  <th>{{ isVi ? 'Thao tác' : 'Action' }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="exp in expressions" :key="exp.syntax">
                  <td><code class="mono">{{ exp.syntax }}</code></td>
                  <td>{{ isVi ? exp.descVi : exp.descEn }}</td>
                  <td>
                    <button class="copy-btn" @click="copyText(exp.syntax)">
                      {{ isVi ? 'Sao chép' : 'Copy' }}
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </article>

        <!-- 7. Keyboard Shortcuts -->
        <article id="shortcuts" class="doc-card">
          <div class="doc-header">
            <span class="doc-step-num">07</span>
            <h2>{{ isVi ? 'Bảng phím tắt thao tác nhanh (Shortcuts)' : 'Keyboard Shortcuts Cheat-sheet' }}</h2>
          </div>

          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{{ isVi ? 'Phím tắt' : 'Shortcut' }}</th>
                  <th>{{ isVi ? 'Tác vụ' : 'Action' }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in shortcuts" :key="item.key">
                  <td><kbd class="shortcut-kbd">{{ item.key }}</kbd></td>
                  <td>{{ isVi ? item.actionVi : item.actionEn }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </article>

        <!-- 8. Credentials & ComfyUI Setup -->
        <article id="credentials" class="doc-card">
          <div class="doc-header">
            <span class="doc-step-num">08</span>
            <h2>{{ isVi ? 'Quản lý Khóa xác thực & Kết nối ComfyUI Local' : 'Credentials & ComfyUI Local Setup' }}</h2>
          </div>
          <p v-if="isVi">
            Mọi khóa bí mật (Gemini API, Hugging Face Token, BFL API Key) lưu tại trang <strong>Khóa xác thực (Credentials)</strong> đều được mã hóa bằng thuật toán mã hóa đối xứng trước khi lưu vào SQLite.
          </p>
          <p v-else>
            All provider secrets (Gemini API, Hugging Face Token, BFL API Key) are encrypted with symmetric keys before SQLite storage.
          </p>

          <div class="doc-callout tip">
            <span class="callout-icon">⚡</span>
            <div>
              <strong>{{ isVi ? 'Cấu hình ComfyUI Local (0 đồng chi phí API)' : 'ComfyUI Local Setup (Zero API Cost)' }}</strong>
              <p>
                {{
                  isVi
                    ? 'Để tạo ảnh FLUX và video Wan2.2 trên GPU nội bộ, hãy khởi động ComfyUI với lệnh: python main.py --listen 127.0.0.1 --port 8188. Sau đó thêm credential ComfyUI với Base URL http://127.0.0.1:8188 và nhấn [⚡ Kiểm tra kết nối].'
                    : 'To generate with FLUX & Wan2.2 locally, start ComfyUI using: python main.py --listen 127.0.0.1 --port 8188. Then add a ComfyUI credential with Base URL http://127.0.0.1:8188 and click [⚡ Test Connection].'
                }}
              </p>
            </div>
          </div>
        </article>
      </main>
    </div>
  </section>
</template>

<style scoped>
.help-page {
  padding-bottom: 60px;
}

.doc-badge-wrap {
  display: flex;
  gap: 8px;
}

.help-grid-layout {
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: 28px;
  align-items: start;
}

.help-toc {
  position: sticky;
  top: 24px;
  background: #11151e;
  border: 1px solid #202736;
  border-radius: 12px;
  padding: 16px;
}

.help-toc h3 {
  font-size: 11px;
  font-family: 'Space Mono', monospace;
  text-transform: uppercase;
  color: #7d889d;
  margin: 0 0 12px;
  letter-spacing: 1px;
}

.help-toc nav {
  display: grid;
  gap: 4px;
}

.help-toc nav a {
  display: block;
  padding: 7px 10px;
  font-size: 12px;
  color: #929cb0;
  text-decoration: none;
  border-radius: 6px;
  transition: all 0.15s ease;
}

.help-toc nav a:hover {
  background: #1b212f;
  color: #fff;
}

.help-toc nav a.active {
  background: #1d2536;
  color: var(--lime);
  font-weight: 600;
}

.help-main-content {
  display: grid;
  gap: 28px;
}

.doc-card {
  background: #10141d;
  border: 1px solid #202736;
  border-radius: 14px;
  padding: 24px;
}

.doc-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}

.doc-step-num {
  font-family: 'Space Mono', monospace;
  font-size: 11px;
  font-weight: 700;
  color: var(--lime);
  background: #192b1e;
  border: 1px solid #295030;
  padding: 3px 8px;
  border-radius: 6px;
}

.doc-header h2 {
  margin: 0;
  font-size: 17px;
  color: #f0f3fa;
}

.doc-card p {
  color: #98a3b8;
  font-size: 13px;
  line-height: 1.6;
  margin: 0 0 16px;
}

.doc-callout {
  display: flex;
  gap: 14px;
  padding: 14px 16px;
  border-radius: 10px;
  margin-top: 16px;
  background: #141924;
  border: 1px solid #232c3f;
}

.doc-callout.info {
  border-left: 3px solid #4a8dff;
}

.doc-callout.tip {
  border-left: 3px solid var(--lime);
}

.callout-icon {
  font-size: 18px;
}

.doc-callout strong {
  display: block;
  font-size: 12px;
  color: #e5eaf5;
  margin-bottom: 4px;
}

.doc-callout p {
  margin: 0;
  font-size: 12px;
  color: #8c97ad;
}

.model-highlights-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
  margin: 18px 0;
}

.model-card {
  background: #141822;
  border: 1px solid #242c3c;
  border-radius: 10px;
  padding: 14px;
}

.model-badge-head {
  display: flex;
  gap: 6px;
  margin-bottom: 10px;
}

.cost-pill {
  font-family: 'Space Mono', monospace;
  font-size: 8px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
}

.cost-pill.local {
  background: #142a1b;
  color: var(--lime);
}

.cost-pill.open-weight {
  background: #271d3a;
  color: #c993ff;
}

.cost-pill.free-credit {
  background: #16283a;
  color: #72b5ff;
}

.cost-pill.paid {
  background: #3a1c22;
  color: #ff8597;
}

.cost-pill.byok {
  background: #252a36;
  color: #9ba6bc;
}

.model-card h4 {
  margin: 0 0 6px;
  font-size: 13px;
  color: #eef2fa;
}

.model-card p {
  margin: 0;
  font-size: 11px;
  line-height: 1.5;
  color: #8692a8;
}

.doc-subgroup {
  margin-top: 20px;
  border-top: 1px solid #1c2230;
  padding-top: 18px;
}

.doc-subgroup h3 {
  font-size: 14px;
  margin: 0 0 10px;
  color: #e2e7f3;
}

.feature-bullets {
  margin: 0;
  padding-left: 20px;
  display: grid;
  gap: 8px;
  font-size: 12px;
  color: #9aa5bb;
  line-height: 1.5;
}

.feature-bullets strong {
  color: #e2e7f3;
}

.editor-guide-box {
  display: grid;
  gap: 10px;
  margin-top: 14px;
}

.guide-step {
  background: #141824;
  border: 1px solid #232c3d;
  border-radius: 9px;
  padding: 12px 14px;
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.g-num {
  font-family: 'Space Mono', monospace;
  font-size: 11px;
  font-weight: 700;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #202738;
  color: var(--lime);
  display: grid;
  place-items: center;
  flex-shrink: 0;
}

.guide-step strong {
  display: block;
  font-size: 12px;
  color: #e5eaf5;
  margin-bottom: 3px;
}

.guide-step p {
  margin: 0;
  font-size: 11px;
  color: #8591a7;
}

.category-block-list {
  display: grid;
  gap: 18px;
  margin-top: 14px;
}

.category-block {
  background: #131722;
  border: 1px solid #222a3b;
  border-radius: 10px;
  padding: 16px;
}

.category-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.category-icon {
  font-size: 13px;
  color: var(--lime);
}

.category-title h3 {
  margin: 0;
  font-size: 13px;
  color: #eef2fa;
}

.node-item-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 10px;
}

.node-info-card {
  background: #0c0f16;
  border: 1px solid #1e2535;
  border-radius: 8px;
  padding: 10px 12px;
}

.node-info-card strong {
  display: block;
  font-size: 12px;
  color: #dee3f0;
  margin-bottom: 4px;
}

.node-info-card p {
  margin: 0;
  font-size: 11px;
  line-height: 1.4;
  color: #7b869c;
}

.steps-flow {
  display: grid;
  gap: 10px;
  margin-top: 14px;
}

.step-card {
  background: #131722;
  border: 1px solid #222a3a;
  border-radius: 9px;
  padding: 12px 16px;
  display: flex;
  align-items: center;
  gap: 14px;
}

.step-badge {
  font-family: 'Space Mono', monospace;
  font-size: 11px;
  font-weight: 700;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: #1b2f1e;
  border: 1px solid #2d5534;
  color: var(--lime);
  display: grid;
  place-items: center;
  flex-shrink: 0;
}

.step-card h4 {
  margin: 0 0 3px;
  font-size: 12px;
  color: #e5eaf5;
}

.step-card p {
  margin: 0;
  font-size: 11px;
  color: #8490a6;
}

.table-wrap {
  overflow-x: auto;
  margin-top: 14px;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

th {
  text-align: left;
  padding: 9px 12px;
  background: #141824;
  border-bottom: 1px solid #242c3d;
  color: #8a96ad;
  font-size: 11px;
  font-family: 'Space Mono', monospace;
}

td {
  padding: 10px 12px;
  border-bottom: 1px solid #1a202d;
  color: #9da8be;
}

.copy-btn {
  padding: 4px 8px;
  font-size: 10px;
  border-radius: 4px;
}

.shortcut-kbd {
  display: inline-block;
  padding: 3px 7px;
  background: #1a202d;
  border: 1px solid #2c364c;
  border-radius: 5px;
  font-family: 'Space Mono', monospace;
  font-size: 11px;
  color: #dbe0ed;
}

@media (max-width: 860px) {
  .help-grid-layout {
    grid-template-columns: 1fr;
  }
  .help-toc {
    display: none;
  }
}
</style>
