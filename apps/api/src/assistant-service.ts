import { M2MError } from '@m2m/shared';
import { applyWorkflowAgentPlan } from './workflow-assistant/apply-plan.js';
import { buildWorkflowAgentPrompt, WORKFLOW_AGENT_SYSTEM_INSTRUCTION } from './workflow-assistant/prompt.js';
import {
  normalizeWorkflowAgentPlan,
  workflowAgentPlanSchema,
  workflowAgentResponseJsonSchema,
  type AssistantRequest,
  type AssistantResponse
} from './workflow-assistant/types.js';

export type {
  AssistantCredentialSummary,
  AssistantExecutionContext,
  AssistantNodeType,
  AssistantProviderStatus,
  AssistantRequest,
  AssistantResponse
} from './workflow-assistant/types.js';
export { applyWorkflowAgentPlan } from './workflow-assistant/apply-plan.js';
export { WORKFLOW_AGENT_SYSTEM_INSTRUCTION as SYSTEM_INSTRUCTION } from './workflow-assistant/prompt.js';

function geminiError(status: number, body: string): M2MError {
  let message = body;
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    message = parsed.error?.message || body;
  } catch {
    // Preserve the plain-text provider response.
  }
  if (status === 401 || status === 403) {
    return new M2MError('CREDENTIAL_ERROR', `Gemini authentication failed: ${message}`, false);
  }
  if (status === 429) {
    return new M2MError('RATE_LIMIT_ERROR', `Gemini rate limit or quota exceeded: ${message}`, true, { status });
  }
  return new M2MError('AI_PROVIDER_ERROR', `Gemini API returned HTTP ${status}: ${message}`, status >= 500, { status });
}

interface GeminiInteractionResponse {
  status?: string;
  error?: { message?: string };
  output_text?: string;
  steps?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
  outputs?: Array<{ type?: string; text?: string }>;
}

async function requestGeminiPlan(input: {
  apiKey: string;
  modelId: string;
  maxTokens: number;
  prompt: string;
}): Promise<unknown> {
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/interactions?key=${encodeURIComponent(input.apiKey)}`;
  let response: Response;
  try {
    response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: input.modelId,
        input: input.prompt,
        system_instruction: WORKFLOW_AGENT_SYSTEM_INSTRUCTION,
        response_format: {
          type: 'text',
          mime_type: 'application/json',
          schema: workflowAgentResponseJsonSchema
        },
        generation_config: { max_output_tokens: input.maxTokens },
        store: false
      }),
      signal: AbortSignal.timeout(90_000)
    });
  } catch (error) {
    const timedOut = error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name);
    throw new M2MError(
      timedOut ? 'AI_TIMEOUT' : 'AI_PROVIDER_ERROR',
      timedOut ? 'Gemini workflow planning timed out after 90 seconds.' : `Unable to call Gemini: ${error instanceof Error ? error.message : String(error)}`,
      true
    );
  }

  if (!response.ok) throw geminiError(response.status, await response.text());
  const resultData = await response.json() as GeminiInteractionResponse;
  const candidateText = (
    resultData.output_text
    || resultData.steps
      ?.flatMap((step) => step.content ?? [])
      .filter((content) => content.type === 'text')
      .map((content) => content.text || '')
      .join('')
    || resultData.outputs?.filter((output) => output.type === 'text').map((output) => output.text || '').join('')
    || ''
  ).trim();
  if (!candidateText) {
    throw new M2MError(
      'AI_PROVIDER_ERROR',
      `Gemini returned no workflow plan${resultData.status ? ` (status: ${resultData.status})` : ''}${resultData.error?.message ? `: ${resultData.error.message}` : ''}.`,
      false,
      resultData
    );
  }

  try {
    return JSON.parse(candidateText.replace(/^```json\s*/i, '').replace(/\s*```$/i, ''));
  } catch (error) {
    throw new M2MError(
      'AI_STRUCTURED_OUTPUT_ERROR',
      `Gemini returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
      false
    );
  }
}

export async function processWorkflowAssistant(req: AssistantRequest): Promise<AssistantResponse> {
  const apiKey = req.apiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new M2MError(
      'CREDENTIAL_ERROR',
      'Gemini API key is required. Add a Gemini credential or configure GEMINI_API_KEY on the API server.',
      false
    );
  }
  if (!req.nodeTypes?.length) {
    throw new M2MError('AI_CONTEXT_ERROR', 'The workflow assistant requires the runtime node catalog.', false);
  }

  const modelId = req.model || 'gemini-3.6-flash';
  const maxTokens = Math.max(1024, Math.min(65536, Number(req.maxTokens) || 8192));
  const originalPrompt = buildWorkflowAgentPrompt(req);
  let rawPlan = await requestGeminiPlan({ apiKey, modelId, maxTokens, prompt: originalPrompt });
  let parsedPlan = workflowAgentPlanSchema.safeParse(normalizeWorkflowAgentPlan(rawPlan));
  if (!parsedPlan.success) {
    const firstIssues = parsedPlan.error.issues
      .slice(0, 8)
      .map((issue) => `${issue.path.join('.') || 'plan'}: ${issue.message}`);
    const previousPlan = JSON.stringify(rawPlan).slice(0, 12_000);
    rawPlan = await requestGeminiPlan({
      apiKey,
      modelId,
      maxTokens,
      prompt: `${originalPrompt}\n\n=== SCHEMA REPAIR REQUIRED ===\nThe previous JSON plan was rejected for these reasons:\n- ${firstIssues.join('\n- ')}\n\nPrevious JSON:\n${previousPlan}\n\nReturn a corrected plan. Keep the same user intent and make no additional changes.`
    });
    parsedPlan = workflowAgentPlanSchema.safeParse(normalizeWorkflowAgentPlan(rawPlan));
    if (!parsedPlan.success) {
      const finalIssues = parsedPlan.error.issues
        .slice(0, 5)
        .map((issue) => `${issue.path.join('.') || 'plan'}: ${issue.message}`);
      throw new M2MError(
        'AI_STRUCTURED_OUTPUT_ERROR',
        `Gemini could not produce a valid workflow operation plan after one repair attempt: ${finalIssues.join('; ')}`,
        false,
        parsedPlan.error.flatten()
      );
    }
  }

  const applied = applyWorkflowAgentPlan({
    workflow: req.workflow,
    plan: parsedPlan.data,
    nodeTypes: req.nodeTypes,
    availableCredentials: req.availableCredentials,
    providerStatuses: req.providerStatuses,
    allowReplaceWorkflow: req.workflow.nodes.length === 0
      || (req.workflow.nodes.length === 1 && req.workflow.nodes[0].type === 'trigger.manual')
      || /(?:create|build|generate|rebuild|replace|recreate|from scratch|tạo mới|tạo|làm lại|tạo lại|xây dựng lại|xây dựng|thay toàn bộ|xóa toàn bộ).{0,24}(?:workflow|quy trình)|(?:workflow|quy trình).{0,24}(?:from scratch|từ đầu|toàn bộ)/i.test(req.prompt)
  });

  return {
    explanation: parsedPlan.data.explanation,
    definition: applied.definition,
    mutationsCount: applied.changes.length,
    changes: applied.changes,
    warnings: applied.warnings,
    manualSteps: applied.manualSteps,
    canApply: applied.canApply,
    readyToRun: applied.readyToRun
  };
}
