import { ref } from 'vue';

export type Locale = 'en' | 'vi';

const STORAGE_KEY = 'm2m_lang';

function getInitialLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'vi' || saved === 'en') return saved;
  } catch {
    // ignore
  }
  return 'en';
}

export const currentLocale = ref<Locale>(getInitialLocale());

export function setLocale(lang: Locale) {
  currentLocale.value = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // ignore
  }
}

export function toggleLocale(): Locale {
  const next: Locale = currentLocale.value === 'en' ? 'vi' : 'en';
  setLocale(next);
  return next;
}

export const translations = {
  en: {
    nav: {
      workflows: 'Workflows',
      executions: 'Executions',
      credentials: 'Credentials',
      developer: 'Developer',
      help: 'Help',
      user: 'm2m User',
      currentWorkspace: 'Current Workspace',
      signOut: 'Sign out',
      toggleLang: 'Switch language (EN / VI)',
      language: 'Language'
    },
    common: {
      details: 'Details & Metadata',
      cancel: 'Cancel',
      confirm: 'Confirm',
      save: 'Save',
      delete: 'Delete',
      close: 'Close',
      all: 'All'
    },
    media: {
      editImage: 'Edit Image / Inpaint',
      download: 'Download',
      regenerate: 'Regenerate',
      deleteMedia: 'Delete Media',
      deleteConfirmTitle: 'Delete Generated Media File?',
      deleteConfirmDesc: 'This removes the generated image/video from storage. The workflow node will remain on canvas.',
      deleteWarning: 'Warning: This media is referenced by downstream nodes.',
      deleteSuccess: 'Media asset deleted successfully',
      mediaDeletedNotice: 'Media deleted',
      brushEditor: 'Brush & Mask Editor',
      compare: 'Before / After',
      history: 'Version History',
      versionHistory: 'Edit Versions',
      noVersions: 'No previous edits found for this asset.',
      tool: 'Drawing Tool',
      brushSize: 'Brush Size',
      operation: 'Edit Operation',
      editPrompt: 'Edit Prompt',
      model: 'Model',
      generatePreview: 'Generate Edited Preview',
      applyVersion: 'Apply Version to Canvas',
      restore: 'Restore',
      brushHint: 'Use the brush tool to highlight the object or region you want to edit or remove.'
    },
    help: {
      eyebrow: 'DOCUMENTATION & MANUAL',
      title: 'User Guide & Help',
      subtitle: 'Master visual workflow automation, AI image & video generation, triggers, and integrations.',
      quickJump: 'Quick Navigation',
      searchPlaceholder: 'Filter documentation topics…',
      copied: 'Copied to clipboard',
      readMarkdownFile: 'Markdown file located at docs/user-guide.md'
    },
    workflows: {
      eyebrow: 'AUTOMATION STUDIO',
      title: 'Workflows',
      subtitle: 'Build once. Let the machine carry the repetition.',
      newWorkflow: '＋ New workflow',
      loading: 'Loading workflows…',
      emptyTitle: 'Your canvas is clear',
      emptySubtitle: 'Create a workflow to begin automating.',
      createWorkflow: 'Create workflow',
      active: 'ACTIVE',
      draft: 'DRAFT',
      nodes: 'nodes',
      version: 'version',
      updated: 'Updated',
      duplicate: 'Duplicate',
      delete: 'Delete',
      deleteConfirm: 'Delete this workflow and its graph?',
      duplicatedNotice: 'Workflow duplicated'
    },
    executions: {
      eyebrow: 'RUN HISTORY',
      title: 'Executions',
      subtitle: 'Every run, result and failure in one durable timeline.',
      refresh: '↻ Refresh',
      status: 'Status',
      mode: 'Mode',
      execution: 'Execution',
      started: 'Started',
      duration: 'Duration',
      noExecutions: 'No executions yet.',
      detailEyebrow: 'EXECUTION DETAIL',
      retry: '↻ Retry execution',
      retryQueued: 'Retry queued',
      failed: 'Execution failed',
      attempt: 'Attempt',
      input: 'INPUT',
      output: 'OUTPUT',
      error: 'ERROR',
      selectNode: 'Select a node to inspect its data.'
    },
    credentials: {
      eyebrow: 'SECRET VAULT',
      title: 'Credentials',
      subtitle: 'Secrets are encrypted before SQLite persistence and never returned here.',
      addCredential: '＋ Add credential',
      empty: 'No credentials configured. Ollama and ComfyUI work locally without API keys.',
      deleteConfirm: 'Delete this credential?',
      dialogTitle: 'Add credential',
      name: 'Name',
      namePlaceholder: 'My provider',
      type: 'Provider Type',
      category: 'Category',
      apiKeyToken: 'API key / token',
      baseUrl: 'Base URL',
      baseUrlPlaceholder: 'http://127.0.0.1:8188',
      cancel: 'Cancel',
      encryptAndSave: 'Encrypt & save',
      testConnection: 'Test Connection',
      savedNotice: 'Credential encrypted and saved',
      categories: {
        all: 'All Categories',
        llm: 'LLM & Chat',
        image: 'Image Generation',
        video: 'Video Generation',
        'local-inference': 'Local Inference (ComfyUI / Ollama)',
        storage: 'Storage',
        generic: 'Generic API'
      }
    },
    developer: {
      eyebrow: 'LOCAL RUNTIME',
      title: 'Developer health',
      subtitle: 'See exactly which localhost dependency needs attention.',
      checkAgain: '↻ Check again',
      online: 'ONLINE',
      offline: 'OFFLINE',
      notConfigured: 'NOT CONFIGURED'
    },
    auth: {
      welcomeBack: 'Welcome back',
      createWorkspace: 'Create your workspace',
      signInSubtitle: 'Sign in to continue building your workflows.',
      registerSubtitle: 'Start your private automation instance.',
      displayName: 'Display name',
      email: 'Email',
      password: 'Password',
      workspaceName: 'Workspace name',
      pleaseWait: 'Please wait…',
      signIn: 'Sign in',
      createAccount: 'Create account',
      needAccount: 'Need an account? Register',
      haveAccount: 'Already have an account? Sign in'
    },
    editor: {
      back: 'Back to workflows',
      saved: 'Saved',
      saving: 'Saving…',
      unsaved: 'Unsaved',
      saveFailed: 'Save failed',
      undo: 'Undo (Ctrl+Z)',
      redo: 'Redo (Ctrl+Shift+Z)',
      validate: 'Validate',
      save: 'Save',
      activate: 'Activate',
      active: 'Active',
      run: '▶ Run',
      nodes: 'Nodes',
      dragToCanvas: 'Drag to canvas',
      execution: 'Execution',
      nodeName: 'Node name',
      credential: 'Credential',
      matchingCredentials: '⭐ Matching Provider Credentials',
      allCredentials: 'All Stored Credentials',
      noneEnvironment: 'None / Environment default',
      duplicate: 'Duplicate',
      disabled: 'Disabled',
      deleteNode: 'Delete node',
      emptySettings: 'Select a node on canvas to configure parameters & credentials.',
      needsAttention: 'Needs attention',
      loading: 'Loading editor…',
      workflowSaved: 'Workflow saved',
      workflowValid: 'Workflow is valid and ready to run',
      workflowInvalid: 'Workflow contains errors',
      executionQueued: 'Execution queued',
      workflowActivated: 'Workflow activated',
      workflowDeactivated: 'Workflow deactivated',
      invalidJson: 'Invalid JSON',
      categories: {
        trigger: 'Triggers',
        core: 'Core Operations',
        ai: 'AI & Intelligence',
        media: 'Media Generation (FLUX & Wan)',
        data: 'Data & Transform',
        logic: 'Logic & Branching'
      }
    }
  },
  vi: {
    nav: {
      workflows: 'Quy trình',
      executions: 'Lịch sử chạy',
      credentials: 'Khóa xác thực',
      developer: 'Nhà phát triển',
      help: 'Hướng dẫn',
      user: 'Người dùng m2m',
      currentWorkspace: 'Không gian hiện tại',
      signOut: 'Đăng xuất',
      toggleLang: 'Đổi ngôn ngữ (EN / VI)',
      language: 'Ngôn ngữ'
    },
    common: {
      details: 'Chi tiết & Thông số',
      cancel: 'Hủy',
      confirm: 'Xác nhận',
      save: 'Lưu',
      delete: 'Xóa',
      close: 'Đóng',
      all: 'Tất cả'
    },
    media: {
      editImage: 'Chỉnh sửa ảnh / Inpaint',
      download: 'Tải về',
      regenerate: 'Tạo lại',
      deleteMedia: 'Xóa file media',
      deleteConfirmTitle: 'Xác nhận xóa file media đã tạo?',
      deleteConfirmDesc: 'Thao tác này sẽ xóa tệp ảnh/video khỏi bộ nhớ lưu trữ. Khối node trong quy trình vẫn sẽ được giữ lại.',
      deleteWarning: 'Cảnh báo: File media này đang được tham chiếu bởi các node tiếp theo.',
      deleteSuccess: 'Đã xóa file media thành công',
      mediaDeletedNotice: 'Media đã bị xóa',
      brushEditor: 'Vẽ cọ & Tạo Mask',
      compare: 'Trước & Sau',
      history: 'Lịch sử phiên bản',
      versionHistory: 'Các phiên bản chỉnh sửa',
      noVersions: 'Chưa có phiên bản chỉnh sửa nào.',
      tool: 'Công cụ vẽ',
      brushSize: 'Kích thước cọ',
      operation: 'Chế độ chỉnh sửa',
      editPrompt: 'Prompt chỉnh sửa',
      model: 'Mô hình AI',
      generatePreview: 'Tạo bản xem trước',
      applyVersion: 'Áp dụng phiên bản lên Canvas',
      restore: 'Khôi phục',
      brushHint: 'Dùng cọ vẽ tô chọn vật thể hoặc vùng bạn muốn chỉnh sửa / xóa trên ảnh.'
    },
    help: {
      eyebrow: 'TÀI LIỆU & HƯỚNG DẪN',
      title: 'Hướng dẫn sử dụng',
      subtitle: 'Làm chủ công cụ tự động hóa quy trình, pipeline tạo ảnh & video AI, triggers và tích hợp.',
      quickJump: 'Mục lục nhanh',
      searchPlaceholder: 'Tìm kiếm chủ đề tài liệu…',
      copied: 'Đã sao chép vào bộ nhớ tạm',
      readMarkdownFile: 'Tài liệu Markdown đầy đủ được lưu tại docs/user-guide.md'
    },
    workflows: {
      eyebrow: 'XƯỞNG TỰ ĐỘNG HÓA',
      title: 'Quy trình',
      subtitle: 'Xây dựng một lần. Để hệ thống xử lý các tác vụ lặp lại.',
      newWorkflow: '＋ Quy trình mới',
      loading: 'Đang tải quy trình…',
      emptyTitle: 'Không gian làm việc đang trống',
      emptySubtitle: 'Tạo quy trình đầu tiên để bắt đầu tự động hóa.',
      createWorkflow: 'Tạo quy trình',
      active: 'HOẠT ĐỘNG',
      draft: 'BẢN NHÁP',
      nodes: 'khối',
      version: 'phiên bản',
      updated: 'Cập nhật',
      duplicate: 'Nhân bản',
      delete: 'Xóa',
      deleteConfirm: 'Xóa quy trình này và sơ đồ liên quan?',
      duplicatedNotice: 'Đã nhân bản quy trình'
    },
    executions: {
      eyebrow: 'LỊCH SỬ CHẠY',
      title: 'Lịch sử thực thi',
      subtitle: 'Mọi lượt chạy, kết quả và lỗi trên dòng thời gian thống nhất.',
      refresh: '↻ Làm mới',
      status: 'Trạng thái',
      mode: 'Chế độ',
      execution: 'Mã thực thi',
      started: 'Bắt đầu',
      duration: 'Thời lượng',
      noExecutions: 'Chưa có lượt chạy nào.',
      detailEyebrow: 'CHI TIẾT THỰC THI',
      retry: '↻ Chạy lại',
      retryQueued: 'Đã đưa vào hàng đợi',
      failed: 'Thực thi thất bại',
      attempt: 'Lần thử',
      input: 'ĐẦU VÀO',
      output: 'ĐẦU RA',
      error: 'LỖI',
      selectNode: 'Chọn một khối để kiểm tra dữ liệu.'
    },
    credentials: {
      eyebrow: 'KHO BẢO MẬT',
      title: 'Thông tin xác thực',
      subtitle: 'Khóa bí mật được mã hóa trước khi lưu trữ và không bao giờ hiển thị lại.',
      addCredential: '＋ Thêm xác thực',
      empty: 'Chưa có thông tin xác thực. Ollama và ComfyUI có thể chạy nội bộ mà không cần khóa.',
      deleteConfirm: 'Xóa thông tin xác thực này?',
      dialogTitle: 'Thêm thông tin xác thực',
      name: 'Tên định danh',
      namePlaceholder: 'Nhà cung cấp của tôi',
      type: 'Loại nhà cung cấp',
      category: 'Phân loại',
      apiKeyToken: 'Khóa API / Token',
      baseUrl: 'Base URL',
      baseUrlPlaceholder: 'http://127.0.0.1:8188',
      cancel: 'Hủy',
      encryptAndSave: 'Mã hóa & lưu',
      testConnection: 'Kiểm tra kết nối',
      savedNotice: 'Đã mã hóa và lưu thông tin xác thực',
      categories: {
        all: 'Tất cả danh mục',
        llm: 'LLM & Trò chuyện',
        image: 'Tạo hình ảnh',
        video: 'Tạo Video',
        'local-inference': 'Inference Cục bộ (ComfyUI / Ollama)',
        storage: 'Lưu trữ',
        generic: 'API Tùy chỉnh'
      }
    },
    developer: {
      eyebrow: 'MÔI TRƯỜNG CỤC BỘ',
      title: 'Trạng thái phát triển',
      subtitle: 'Kiểm tra dịch vụ localhost nào đang cần xử lý.',
      checkAgain: '↻ Kiểm tra lại',
      online: 'HOẠT ĐỘNG',
      offline: 'NGOẠI TUYẾN',
      notConfigured: 'CHƯA CẤU HÌNH'
    },
    auth: {
      welcomeBack: 'Chào mừng trở lại',
      createWorkspace: 'Khởi tạo không gian làm việc',
      signInSubtitle: 'Đăng nhập để tiếp tục xây dựng tự động hóa.',
      registerSubtitle: 'Bắt đầu không gian quy trình riêng tư.',
      displayName: 'Tên hiển thị',
      email: 'Email',
      password: 'Mật khẩu',
      workspaceName: 'Tên không gian làm việc',
      pleaseWait: 'Vui lòng đợi…',
      signIn: 'Đăng nhập',
      createAccount: 'Tạo tài khoản',
      needAccount: 'Chưa có tài khoản? Đăng ký ngay',
      haveAccount: 'Đã có tài khoản? Đăng nhập'
    },
    editor: {
      back: 'Quay lại danh sách quy trình',
      saved: 'Đã lưu',
      saving: 'Đang lưu…',
      unsaved: 'Chưa lưu',
      saveFailed: 'Lưu thất bại',
      undo: 'Hoàn tác (Ctrl+Z)',
      redo: 'Làm lại (Ctrl+Shift+Z)',
      validate: 'Kiểm tra',
      save: 'Lưu',
      activate: 'Kích hoạt',
      active: 'Đang kích hoạt',
      run: '▶ Chạy',
      nodes: 'Khối xử lý',
      dragToCanvas: 'Kéo thả vào canvas',
      execution: 'Lượt chạy',
      nodeName: 'Tên khối',
      credential: 'Khóa xác thực',
      matchingCredentials: '⭐ Khóa xác thực khớp Nhà cung cấp',
      allCredentials: 'Tất cả khóa xác thực đã lưu',
      noneEnvironment: 'Không dùng / Mặc định môi trường',
      duplicate: 'Nhân bản',
      disabled: 'Vô hiệu hóa',
      deleteNode: 'Xóa khối',
      emptySettings: 'Chọn một khối trên canvas để cấu hình tham số và khóa xác thực.',
      needsAttention: 'Cần lưu ý kiểm tra',
      loading: 'Đang tải trình chỉnh sửa…',
      workflowSaved: 'Đã lưu quy trình thành công',
      workflowValid: 'Quy trình hợp lệ, sẵn sàng chạy',
      workflowInvalid: 'Quy trình có lỗi cấu hình',
      executionQueued: 'Đã đưa lượt chạy vào hàng đợi',
      workflowActivated: 'Đã kích hoạt quy trình',
      workflowDeactivated: 'Đã tắt kích hoạt quy trình',
      invalidJson: 'JSON không hợp lệ',
      categories: {
        trigger: 'Bộ kích hoạt (Triggers)',
        core: 'Tác vụ hệ thống (Core)',
        ai: 'Trí tuệ nhân tạo (AI)',
        media: 'Tạo Media (FLUX & Wan)',
        data: 'Dữ liệu & Biến đổi',
        logic: 'Điều kiện & Phân nhánh'
      }
    }
  }
};

const nodeTranslations: Record<
  string,
  { displayName: { en: string; vi: string }; description?: { en: string; vi: string } }
> = {
  'trigger.manual': {
    displayName: { en: 'Manual Trigger', vi: 'Kích hoạt thủ công' },
    description: { en: 'Start execution manually with custom input.', vi: 'Khởi chạy luồng thủ công với dữ liệu tùy chỉnh.' }
  },
  'trigger.webhook': {
    displayName: { en: 'Webhook Trigger', vi: 'Kích hoạt Webhook' },
    description: { en: 'Trigger workflow via incoming HTTP request.', vi: 'Kích hoạt quy trình qua yêu cầu HTTP gửi đến.' }
  },
  'trigger.schedule': {
    displayName: { en: 'Schedule Trigger', vi: 'Kích hoạt Lập lịch' },
    description: { en: 'Run workflow on a recurring schedule or cron.', vi: 'Chạy quy trình theo định kỳ thời gian hoặc cron.' }
  },
  'core.setData': {
    displayName: { en: 'Set Data', vi: 'Thiết lập dữ liệu' },
    description: { en: 'Set or modify variables and payload.', vi: 'Gán hoặc biến đổi biến dữ liệu và payload.' }
  },
  'core.if': {
    displayName: { en: 'IF Condition', vi: 'Điều kiện IF' },
    description: { en: 'Route execution based on condition.', vi: 'Phân nhánh luồng xử lý theo điều kiện.' }
  },
  'core.switch': {
    displayName: { en: 'Switch Router', vi: 'Bộ định tuyến Switch' },
    description: { en: 'Route to multiple branches based on value.', vi: 'Định tuyến đến nhiều nhánh tùy theo giá trị.' }
  },
  'core.loop': {
    displayName: { en: 'Loop', vi: 'Vòng lặp Loop' },
    description: { en: 'Iterate over array items sequentially.', vi: 'Lặp qua các phần tử trong danh sách.' }
  },
  'core.code': {
    displayName: { en: 'JavaScript Code', vi: 'Mã lệnh JavaScript' },
    description: { en: 'Execute custom JavaScript code transformations.', vi: 'Thực thi mã lệnh JavaScript tùy biến dữ liệu.' }
  },
  'core.httpRequest': {
    displayName: { en: 'HTTP Request', vi: 'Yêu cầu HTTP' },
    description: { en: 'Call external REST APIs with custom headers & auth.', vi: 'Gọi REST API bên ngoài với headers và xác thực.' }
  },
  'core.delay': {
    displayName: { en: 'Delay Pause', vi: 'Tạm dừng Delay' },
    description: { en: 'Pause workflow execution for a duration.', vi: 'Tạm dừng quy trình trong một khoảng thời gian.' }
  },
  'core.respondWebhook': {
    displayName: { en: 'Respond Webhook', vi: 'Phản hồi Webhook' },
    description: { en: 'Send custom HTTP response back to caller.', vi: 'Gửi phản hồi HTTP tùy chỉnh về cho client.' }
  },
  'ai.prompt': {
    displayName: { en: 'AI Prompt', vi: 'Nhắc lệnh AI Prompt' },
    description: { en: 'Generate text or answers using LLM models.', vi: 'Tạo văn bản hoặc trả lời bằng mô hình LLM.' }
  },
  'ai.chatModel': {
    displayName: { en: 'Chat Model', vi: 'Cấu hình Chat Model' },
    description: { en: 'Provide reusable model config to AI agents.', vi: 'Cung cấp cấu hình mô hình tái sử dụng cho Agent.' }
  },
  'ai.agent': {
    displayName: { en: 'AI Agent', vi: 'Tác tử AI Agent' },
    description: { en: 'Autonomous multi-step reasoning agent with tools.', vi: 'Tác tử tự hành suy luận đa bước kết hợp công cụ.' }
  },
  'ai.tool': {
    displayName: { en: 'AI Tool', vi: 'Công cụ AI Tool' },
    description: { en: 'Declare capabilities for AI agents to invoke.', vi: 'Khai báo công cụ để tác tử AI có thể gọi khi cần.' }
  },
  'ai.structuredOutput': {
    displayName: { en: 'Structured Output', vi: 'Đầu ra Cấu trúc JSON' },
    description: { en: 'Enforce strict JSON schema on LLM generation.', vi: 'Ép mô hình AI trả về đúng chuẩn JSON Schema.' }
  },
  'ai.textClassification': {
    displayName: { en: 'Text Classification', vi: 'Phân loại Văn bản' },
    description: { en: 'Categorize text into predefined labels.', vi: 'Phân loại văn bản vào các nhãn định sẵn.' }
  },
  'ai.informationExtraction': {
    displayName: { en: 'Information Extraction', vi: 'Trích xuất Thông tin' },
    description: { en: 'Extract structured entity fields from text.', vi: 'Trích xuất các trường dữ liệu từ văn bản thô.' }
  },
  'ai.embedding': {
    displayName: { en: 'Text Embedding', vi: 'Véc-tơ Embedding' },
    description: { en: 'Convert text into vector representations.', vi: 'Chuyển đổi văn bản thành véc-tơ không gian.' }
  },
  'ai.simpleMemory': {
    displayName: { en: 'Simple Memory', vi: 'Bộ nhớ Đơn giản' },
    description: { en: 'Store and retrieve cross-execution state.', vi: 'Lưu trữ và đọc trạng thái qua các lần thực thi.' }
  },
  // Media Generation Nodes
  'm2m.media.generateImage': {
    displayName: { en: 'Generate Image', vi: 'Tạo ảnh từ Prompt' },
    description: { en: 'Generate high-fidelity images using FLUX.2 Klein 4B, SDXL, or Cloud APIs.', vi: 'Tạo ảnh chân thực độ nét cao bằng mô hình FLUX.2 Klein 4B, SDXL hoặc Cloud.' }
  },
  'm2m.media.imageToVideo': {
    displayName: { en: 'Image To Video', vi: 'Tạo video từ ảnh' },
    description: { en: 'Animate and generate cinematic video from an input image using Wan2.2 TI2V-5B or CogVideoX.', vi: 'Tạo video chuyển động mượt mà từ một ảnh đầu vào bằng Wan2.2 TI2V-5B hoặc CogVideoX.' }
  },
  'm2m.media.editImage': {
    displayName: { en: 'Edit Image / Inpaint', vi: 'Chỉnh sửa ảnh / Inpaint' },
    description: { en: 'Edit, inpaint, replace or remove objects in images using prompt and mask.', vi: 'Chỉnh sửa, vẽ đè inpainting, thay thế hoặc xóa vật thể trong ảnh bằng prompt và cọ mask.' }
  },
  'm2m.media.saveMedia': {
    displayName: { en: 'Save Media', vi: 'Lưu trữ Media' },
    description: { en: 'Persist generated images and videos to local media directory.', vi: 'Lưu các file ảnh và video đã tạo vào thư mục lưu trữ cục bộ.' }
  },
  'm2m.media.storyboardSplitter': {
    displayName: { en: 'Storyboard Splitter', vi: 'Tách phân cảnh Storyboard' },
    description: { en: 'Break a creative story or video script into structured scene prompts.', vi: 'Phân tách kịch bản câu chuyện thành các phân cảnh prompt ảnh và video chi tiết.' }
  },
  'm2m.ai.mediaPromptBuilder': {
    displayName: { en: 'Media Prompt Builder', vi: 'Tối ưu Prompt Media' },
    description: { en: 'Optimize high-quality prompts and camera directions for FLUX and Wan2.2.', vi: 'Tối ưu hóa từ khóa mô tả và góc quay camera chuẩn xác cho FLUX và Wan2.2.' }
  },
  'm2m.media.mergeVideo': {
    displayName: { en: 'Merge Video', vi: 'Ghép nối Video' },
    description: { en: 'Concatenate multiple video clips into a single video asset.', vi: 'Ghép nối nhiều đoạn video ngắn thành một video tổng thể hoàn chỉnh.' }
  }
};

const propertyTranslations: Record<string, { en: string; vi: string }> = {
  provider: { en: 'Provider', vi: 'Nhà cung cấp' },
  model: { en: 'Model', vi: 'Mô hình' },
  prompt: { en: 'Prompt', vi: 'Câu nhắc (Prompt)' },
  negativePrompt: { en: 'Negative Prompt', vi: 'Từ khóa phủ định' },
  system: { en: 'System Prompt', vi: 'Nhắc lệnh Hệ thống' },
  temperature: { en: 'Temperature (Creativity)', vi: 'Độ sáng tạo (Temperature)' },
  maxTokens: { en: 'Max Tokens', vi: 'Giới hạn Tokens' },
  url: { en: 'URL', vi: 'Địa chỉ URL' },
  method: { en: 'Method', vi: 'Phương thức' },
  headers: { en: 'Headers', vi: 'Tiêu đề HTTP (Headers)' },
  body: { en: 'Body Payload', vi: 'Nội dung Payload' },
  width: { en: 'Width', vi: 'Chiều rộng (px)' },
  height: { en: 'Height', vi: 'Chiều cao (px)' },
  seed: { en: 'Random Seed', vi: 'Seed ngẫu nhiên' },
  steps: { en: 'Steps', vi: 'Số bước lấy mẫu (Steps)' },
  guidance: { en: 'Guidance Scale / CFG', vi: 'Mức độ bám sát Prompt (CFG)' },
  durationSeconds: { en: 'Duration (Seconds)', vi: 'Thời lượng video (Giây)' },
  fps: { en: 'FPS', vi: 'Tốc độ khung hình (FPS)' },
  motionStrength: { en: 'Motion Strength', vi: 'Cường độ chuyển động' },
  script: { en: 'Video Script', vi: 'Kịch bản video' },
  sceneCount: { en: 'Target Scene Count', vi: 'Số lượng phân cảnh' },
  style: { en: 'Visual Style', vi: 'Phong cách hình ảnh' },
  sceneDescription: { en: 'Scene Description', vi: 'Mô tả phân cảnh' },
  sourceImage: { en: 'Source Image', vi: 'Ảnh gốc' },
  maskImage: { en: 'Mask Image', vi: 'Ảnh Mask' },
  operation: { en: 'Operation', vi: 'Hành động' }
};

export function useI18n() {
  function t(path: string): string {
    const keys = path.split('.');
    let current: any = translations[currentLocale.value];
    for (const key of keys) {
      if (current && typeof current === 'object' && key in current) {
        current = current[key];
      } else {
        let fallback: any = translations.en;
        for (const fKey of keys) {
          if (fallback && typeof fallback === 'object' && fKey in fallback) {
            fallback = fallback[fKey];
          } else {
            return path;
          }
        }
        return typeof fallback === 'string' ? fallback : path;
      }
    }
    return typeof current === 'string' ? current : path;
  }

  function tCategory(categoryKey: string): string {
    const cat = (translations[currentLocale.value].editor.categories as any)?.[categoryKey];
    if (cat) return cat;
    const fallback = (translations.en.editor.categories as any)?.[categoryKey];
    if (fallback) return fallback;
    return categoryKey.toUpperCase();
  }

  function tNodeName(nodeType: string, defaultName: string): string {
    const mapped = nodeTranslations[nodeType]?.displayName?.[currentLocale.value];
    if (mapped) return mapped;
    const fallback = nodeTranslations[nodeType]?.displayName?.en;
    if (fallback) return fallback;
    return defaultName;
  }

  function tNodeDesc(nodeType: string, defaultDesc?: string): string {
    const mapped = nodeTranslations[nodeType]?.description?.[currentLocale.value];
    if (mapped) return mapped;
    const fallback = nodeTranslations[nodeType]?.description?.en;
    if (fallback) return fallback;
    return defaultDesc || '';
  }

  function tPropName(propName: string, defaultDisplayName: string): string {
    const mapped = propertyTranslations[propName]?.[currentLocale.value];
    if (mapped) return mapped;
    const fallback = propertyTranslations[propName]?.en;
    if (fallback) return fallback;
    return defaultDisplayName;
  }

  return {
    locale: currentLocale,
    currentLocale,
    setLocale,
    toggleLocale,
    t,
    tCategory,
    tNodeName,
    tNodeDesc,
    tPropName
  };
}

