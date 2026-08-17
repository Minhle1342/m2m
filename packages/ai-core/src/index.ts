import { M2MError } from '@m2m/shared';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import {
  dynamicTool, embed as aiEmbed, generateText as aiGenerateText, jsonSchema, stepCountIs,
  streamText as aiStreamText, type EmbeddingModel, type LanguageModel,
} from 'ai';

export interface GenerateTextInput {
  model: string;
  prompt: string;
  system?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  apiKey?: string;
  baseUrl?: string;
}

export interface GenerateTextResult {
  text: string;
  model: string;
  provider: string;
  usage?: { inputTokens?: number; outputTokens?: number };
}

export interface StructuredInput<T> extends GenerateTextInput {
  schema?: unknown;
  parse(value: unknown): T;
}

export interface AIStreamEvent {
  type: 'text-delta' | 'finish';
  text?: string;
  result?: GenerateTextResult;
}

export interface GenerateEmbeddingInput {
  model: string;
  value: string;
  apiKey?: string;
  baseUrl?: string;
}

export interface GenerateEmbeddingResult {
  embedding: number[];
  model: string;
  provider: string;
  tokens?: number;
}

export interface AgentTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute(input: unknown, signal?: AbortSignal): Promise<unknown>;
}

export interface GenerateAgentInput extends GenerateTextInput {
  tools: AgentTool[];
  maxSteps?: number;
}

export interface GenerateAgentResult extends GenerateTextResult {
  steps: number;
  toolCalls: Array<{ toolName: string; input: unknown }>;
  toolResults: Array<{ toolName: string; output: unknown }>;
}

export interface AIProviderAdapter {
  readonly id: string;
  generateText(input: GenerateTextInput): Promise<GenerateTextResult>;
  streamText(input: GenerateTextInput): AsyncIterable<AIStreamEvent>;
  generateStructured<T>(input: StructuredInput<T>): Promise<T>;
  generateAgent(input: GenerateAgentInput): Promise<GenerateAgentResult>;
  embed(input: GenerateEmbeddingInput): Promise<GenerateEmbeddingResult>;
  health(): Promise<boolean>;
}

function mapProviderError(error: unknown): never {
  const candidate = error as { message?: unknown; statusCode?: unknown; name?: unknown };
  const status = typeof candidate?.statusCode === 'number' ? candidate.statusCode : undefined;
  const message = typeof candidate?.message === 'string' ? candidate.message : 'AI provider is unavailable';
  const timedOut = candidate?.name === 'AbortError' || /timed?\s*out/i.test(message);
  const code =
    status === 401 || status === 403
      ? 'CREDENTIAL_ERROR'
      : status === 429
        ? 'RATE_LIMIT_ERROR'
        : timedOut
          ? 'TIMEOUT_ERROR'
          : 'AI_PROVIDER_ERROR';
  throw new M2MError(code, message, timedOut || status === 429 || (status !== undefined && status >= 500), {
    status,
  });
}

export function repairJsonString(input: string): string {
  let text = input.trim();

  // 1. Strip markdown code fences
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)(?:```|$)/i);
  if (fenceMatch && fenceMatch[1]) {
    text = fenceMatch[1].trim();
  }

  // 2. Extract boundary from first '{' or '['
  const firstBrace = text.indexOf('{');
  const firstBracket = text.indexOf('[');
  let startIdx = 0;
  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    startIdx = firstBrace;
  } else if (firstBracket !== -1) {
    startIdx = firstBracket;
  }
  text = text.slice(startIdx).trim();

  // 3. Remove trailing commas before } or ]
  text = text.replace(/,\s*([}\]])/g, '$1');

  // 4. Convert single quoted keys/values: 'key': 'value' -> "key": "value"
  text = text.replace(/([{,]\s*)'([^']+)'\s*:/g, '$1"$2":');
  text = text.replace(/:\s*'([^']*)'/g, ':"$1"');

  // 5. Balance unclosed quotes and brackets
  let inString = false;
  let isEscaped = false;
  const stack: ('{' | '[')[] = [];

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (isEscaped) {
      isEscaped = false;
      continue;
    }
    if (char === '\\') {
      isEscaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === '{' || char === '[') {
        stack.push(char);
      } else if (char === '}') {
        if (stack.length && stack[stack.length - 1] === '{') stack.pop();
      } else if (char === ']') {
        if (stack.length && stack[stack.length - 1] === '[') stack.pop();
      }
    }
  }

  // If ended while still inside a string (unterminated string due to token cutoff)
  if (inString) {
    text += '"';
  }

  // Remove trailing comma that might have been exposed
  text = text.replace(/,\s*$/, '');

  // Close remaining open brackets and braces in reverse order
  while (stack.length > 0) {
    const open = stack.pop();
    if (open === '{') text += '}';
    else if (open === '[') text += ']';
  }

  return text;
}

export function extractCleanJson(rawText: string): unknown {
  const trimmed = rawText.trim();

  // 1. Direct JSON parse
  try {
    return JSON.parse(trimmed);
  } catch {}

  // 2. Strip Markdown code blocks
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch && codeBlockMatch[1]) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch {}
  }

  // 3. Repaired text
  try {
    const repaired = repairJsonString(trimmed);
    return JSON.parse(repaired);
  } catch {}

  // 4. Extract JSON object boundary: first '{' to last '}'
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    } catch {
      try {
        return JSON.parse(repairJsonString(trimmed.slice(firstBrace)));
      } catch {}
    }
  }

  // 5. Extract JSON array boundary: first '[' to last ']'
  const firstBracket = trimmed.indexOf('[');
  const lastBracket = trimmed.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    try {
      return JSON.parse(trimmed.slice(firstBracket, lastBracket + 1));
    } catch {
      try {
        return JSON.parse(repairJsonString(trimmed.slice(firstBracket)));
      } catch {}
    }
  }

  // 6. Regex heuristic fallback for key-value pairs (e.g. classification or simple object)
  const labelMatch = trimmed.match(/"?label"?\s*[:=]\s*["']?([A-Za-z0-9_\- ]+)["']?/i);
  if (labelMatch && labelMatch[1]) {
    const confMatch = trimmed.match(/"?confidence"?\s*[:=]\s*([0-9.]+)/i);
    const reasonMatch = trimmed.match(/"?reason"?\s*[:=]\s*["']([^"'\n]+)["']?/i);
    return {
      label: labelMatch[1].trim(),
      confidence: confMatch ? parseFloat(confMatch[1]) : 1.0,
      reason: reasonMatch ? reasonMatch[1].trim() : `Classified as ${labelMatch[1].trim()}`,
    };
  }

  // 7. Final attempt
  return JSON.parse(trimmed);
}

abstract class BaseProvider implements AIProviderAdapter {
  abstract readonly id: string;
  abstract health(): Promise<boolean>;
  protected abstract createModel(input: GenerateTextInput): LanguageModel;
  protected abstract createEmbeddingModel(input: GenerateEmbeddingInput): EmbeddingModel;

  async generateText(input: GenerateTextInput): Promise<GenerateTextResult> {
    try {
      const result = await aiGenerateText({
        model: this.createModel(input),
        prompt: input.prompt,
        system: input.system,
        temperature: input.temperature,
        maxOutputTokens: input.maxTokens,
        timeout: input.timeoutMs ?? 120_000,
        maxRetries: 0,
      });
      return {
        text: result.text,
        model: input.model,
        provider: this.id,
        usage: {
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
        },
      };
    } catch (error) {
      mapProviderError(error);
    }
  }

  async *streamText(input: GenerateTextInput): AsyncIterable<AIStreamEvent> {
    try {
      const stream = aiStreamText({
        model: this.createModel(input),
        prompt: input.prompt,
        system: input.system,
        temperature: input.temperature,
        maxOutputTokens: input.maxTokens,
        timeout: input.timeoutMs ?? 120_000,
        maxRetries: 0,
      });
      for await (const text of stream.textStream) yield { type: 'text-delta', text };
      const usage = await stream.usage;
      yield {
        type: 'finish',
        result: {
          text: await stream.text,
          model: input.model,
          provider: this.id,
          usage: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens },
        },
      };
    } catch (error) {
      mapProviderError(error);
    }
  }

  async generateStructured<T>(input: StructuredInput<T>): Promise<T> {
    const result = await this.generateText({
      ...input,
      system: `${input.system ?? ''}\nReturn only valid raw JSON without markdown code fences or backticks.`,
    });
    try {
      return input.parse(extractCleanJson(result.text));
    } catch (error) {
      throw new M2MError(
        'AI_STRUCTURED_OUTPUT_ERROR',
        error instanceof Error ? error.message : 'AI returned invalid JSON',
      );
    }
  }

  async generateAgent(input: GenerateAgentInput): Promise<GenerateAgentResult> {
    try {
      const tools = Object.fromEntries(input.tools.map((agentTool) => [agentTool.name, dynamicTool({
        description: agentTool.description,
        inputSchema: jsonSchema(agentTool.inputSchema as never),
        execute: async (toolInput, options) => agentTool.execute(toolInput, options.abortSignal),
      })]));
      const result = await aiGenerateText({
        model: this.createModel(input), prompt: input.prompt, system: input.system,
        temperature: input.temperature, maxOutputTokens: input.maxTokens,
        timeout: input.timeoutMs ?? 120_000, maxRetries: 0, tools,
        stopWhen: stepCountIs(Math.max(1, Math.min(20, input.maxSteps ?? 5))),
      });
      return {
        text: result.text, model: input.model, provider: this.id, steps: result.steps.length,
        usage: { inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens },
        toolCalls: result.dynamicToolCalls.map((call) => ({ toolName: call.toolName, input: call.input })),
        toolResults: result.dynamicToolResults.map((toolResult) => ({ toolName: toolResult.toolName, output: toolResult.output })),
      };
    } catch (error) {
      mapProviderError(error);
    }
  }

  async embed(input: GenerateEmbeddingInput): Promise<GenerateEmbeddingResult> {
    try {
      const result = await aiEmbed({ model: this.createEmbeddingModel(input), value: input.value, maxRetries: 0 });
      return { embedding: result.embedding, model: input.model, provider: this.id, tokens: result.usage.tokens };
    } catch (error) {
      mapProviderError(error);
    }
  }
}

export class OllamaProvider extends BaseProvider {
  readonly id = 'ollama';
  constructor(private readonly defaultBaseUrl = process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434') {
    super();
  }

  protected createModel(input: GenerateTextInput): LanguageModel {
    const baseUrl = (input.baseUrl ?? this.defaultBaseUrl).replace(/\/$/, '');
    return createOpenAICompatible({ name: 'ollama', baseURL: `${baseUrl}/v1`, apiKey: 'ollama' })(input.model);
  }

  protected createEmbeddingModel(input: GenerateEmbeddingInput): EmbeddingModel {
    const baseUrl = (input.baseUrl ?? this.defaultBaseUrl).replace(/\/$/, '');
    return createOpenAICompatible({ name: 'ollama', baseURL: `${baseUrl}/v1`, apiKey: 'ollama' }).embeddingModel(input.model);
  }

  async health(): Promise<boolean> {
    try {
      return (await fetch(`${this.defaultBaseUrl.replace(/\/$/, '')}/api/tags`, { signal: AbortSignal.timeout(1500) })).ok;
    } catch {
      return false;
    }
  }
}

export class GeminiProvider extends BaseProvider {
  readonly id = 'gemini';

  protected createModel(input: GenerateTextInput): LanguageModel {
    const apiKey = input.apiKey ?? process.env.GEMINI_API_KEY;
    if (!apiKey) throw new M2MError('CREDENTIAL_ERROR', 'Gemini API key is not configured');
    let model = input.model || 'gemini-2.5-flash';
    if (model === 'gemini-2.0-flash' || model === 'gemini-1.5-flash' || model === 'gemini-1.5-pro' || model === 'gemini-2.0-flash-exp') {
      model = 'gemini-2.5-flash';
    }
    return createGoogleGenerativeAI({ apiKey })(model);
  }

  protected createEmbeddingModel(input: GenerateEmbeddingInput): EmbeddingModel {
    const apiKey = input.apiKey ?? process.env.GEMINI_API_KEY;
    if (!apiKey) throw new M2MError('CREDENTIAL_ERROR', 'Gemini API key is not configured');
    let model = input.model || 'text-embedding-004';
    return createGoogleGenerativeAI({ apiKey }).embeddingModel(model);
  }

  async health(): Promise<boolean> {
    return Boolean(process.env.GEMINI_API_KEY);
  }
}

export class OpenAICompatibleProvider extends BaseProvider {
  readonly id = 'openai-compatible';

  protected createModel(input: GenerateTextInput): LanguageModel {
    const apiKey = input.apiKey ?? process.env.OPENAI_COMPATIBLE_API_KEY;
    const baseUrl = input.baseUrl ?? process.env.OPENAI_COMPATIBLE_BASE_URL;
    if (!apiKey || !baseUrl) {
      throw new M2MError('CREDENTIAL_ERROR', 'OpenAI-compatible endpoint is not configured');
    }
    return createOpenAICompatible({
      name: 'openai-compatible',
      baseURL: baseUrl.replace(/\/$/, ''),
      apiKey,
      includeUsage: true,
    })(input.model);
  }

  protected createEmbeddingModel(input: GenerateEmbeddingInput): EmbeddingModel {
    const apiKey = input.apiKey ?? process.env.OPENAI_COMPATIBLE_API_KEY;
    const baseUrl = input.baseUrl ?? process.env.OPENAI_COMPATIBLE_BASE_URL;
    if (!apiKey || !baseUrl) throw new M2MError('CREDENTIAL_ERROR', 'OpenAI-compatible endpoint is not configured');
    return createOpenAICompatible({ name: 'openai-compatible', baseURL: baseUrl.replace(/\/$/, ''), apiKey }).embeddingModel(input.model);
  }

  async health(): Promise<boolean> {
    return Boolean(process.env.OPENAI_COMPATIBLE_BASE_URL && process.env.OPENAI_COMPATIBLE_API_KEY);
  }
}

export class ModelRouter {
  private readonly providers = new Map<string, AIProviderAdapter>();

  register(provider: AIProviderAdapter): void {
    this.providers.set(provider.id, provider);
  }

  get(id: string): AIProviderAdapter {
    const provider = this.providers.get(id);
    if (!provider) throw new M2MError('AI_PROVIDER_ERROR', `Unknown AI provider: ${id}`);
    return provider;
  }

  list(): AIProviderAdapter[] {
    return [...this.providers.values()];
  }
}

export function createDefaultModelRouter(): ModelRouter {
  const router = new ModelRouter();
  router.register(new OllamaProvider());
  router.register(new GeminiProvider());
  router.register(new OpenAICompatibleProvider());
  return router;
}

export * from './media/index.js';
