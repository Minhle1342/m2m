export interface TokenTier {
  label: string;
  labelEn: string;
  value: number;
  icon: string;
}

export interface GeminiModelSpec {
  id: string;
  name: string;
  tag: string;
  badgeColor: 'lime' | 'violet' | 'blue' | 'orange';
  description: string;
  descriptionVi: string;
  maxOutputTokens: number;
  defaultTokens: number;
  tokenTiers: TokenTier[];
}

const STANDARD_TIERS: TokenTier[] = [
  { label: '1k (Thấp)', labelEn: '1k (Low)', value: 1024, icon: '⚡' },
  { label: '4k (Chuẩn)', labelEn: '4k (Standard)', value: 4096, icon: '🎯' },
  { label: '8k (Cao)', labelEn: '8k (High)', value: 8192, icon: '💎' },
  { label: '16k (Rất cao)', labelEn: '16k (Very High)', value: 16384, icon: '🚀' },
  { label: '32k (Cực cao)', labelEn: '32k (Extreme)', value: 32768, icon: '🌌' },
  { label: '65k (Tối đa)', labelEn: '65k (Max)', value: 65536, icon: '👑' }
];

export const GEMINI_MODELS: GeminiModelSpec[] = [
  {
    id: 'gemini-3.6-flash',
    name: 'Gemini 3.6 Flash',
    tag: 'Khuyên dùng',
    badgeColor: 'lime',
    description: 'Latest stable Flash model, optimized for agentic planning and fewer unnecessary edits.',
    descriptionVi: 'Bản Flash ổn định mới nhất, tối ưu lập kế hoạch agent và giảm sửa đổi không cần thiết.',
    maxOutputTokens: 65536,
    defaultTokens: 8192,
    tokenTiers: STANDARD_TIERS
  },
  {
    id: 'gemini-3.5-flash',
    name: 'Gemini 3.5 Flash',
    tag: 'Agent chuyên sâu',
    badgeColor: 'violet',
    description: 'Stable model for sustained agentic and coding tasks.',
    descriptionVi: 'Mô hình ổn định cho tác vụ agent và coding dài, phức tạp.',
    maxOutputTokens: 65536,
    defaultTokens: 8192,
    tokenTiers: STANDARD_TIERS
  },
  {
    id: 'gemini-3.5-flash-lite',
    name: 'Gemini 3.5 Flash-Lite',
    tag: 'Nhanh & tiết kiệm',
    badgeColor: 'blue',
    description: 'Stable low-latency model for small and repetitive workflow edits.',
    descriptionVi: 'Bản ổn định độ trễ thấp cho chỉnh sửa workflow nhỏ và lặp lại.',
    maxOutputTokens: 65536,
    defaultTokens: 4096,
    tokenTiers: STANDARD_TIERS
  },
  {
    id: 'gemini-3.1-pro-preview',
    name: 'Gemini 3.1 Pro Preview',
    tag: 'Pro / Không free API',
    badgeColor: 'orange',
    description: 'Preview reasoning model for the hardest workflow architecture tasks; no Gemini API free tier.',
    descriptionVi: 'Mô hình preview suy luận cho kiến trúc workflow khó nhất; không có free tier trên Gemini API.',
    maxOutputTokens: 65536,
    defaultTokens: 8192,
    tokenTiers: STANDARD_TIERS
  }
];
