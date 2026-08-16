import { createServer } from 'node:http';

const apiUrl = process.env.SMOKE_API_URL ?? 'http://localhost:3000';
interface Health { dependencies: { database: boolean; redis: boolean; worker: boolean } }
interface WorkflowResponse { id: string }
interface CredentialResponse { id: string }
interface HookResponse { executionId: string; duplicate?: boolean }
interface ExecutionNode { nodeId: string; status: string; output?: { json?: { text?: string } } }
interface ExecutionResponse {
  id: string;
  status: string;
  error?: unknown;
  nodes: ExecutionNode[];
  workflowVersionId: string;
  retryOfId?: string;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...init.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${path}: ${JSON.stringify(data)}`);
  return data as T;
}

async function waitForExecution(id: string): Promise<ExecutionResponse> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const detail = await request<ExecutionResponse>(`/api/v1/executions/${id}`);
    if (['success', 'failed', 'cancelled'].includes(detail.status)) return detail;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Execution ${id} did not finish`);
}

const mockAI = createServer((request, response) => {
  let body = '';
  request.on('data', (chunk) => { body += String(chunk); });
  request.on('end', () => {
    const input = JSON.parse(body) as { model?: string };
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({
      id: 'smoke-ai-response', object: 'chat.completion', created: 1, model: input.model,
      choices: [{ index: 0, message: { role: 'assistant', content: 'hello from compatible AI' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 },
    }));
  });
});
await new Promise<void>((resolve) => mockAI.listen(0, '127.0.0.1', resolve));

try {
  const address = mockAI.address();
  if (!address || typeof address === 'string') throw new Error('Mock AI provider has no port');
  const health = await request<Health>('/health');
  assert(health.dependencies.database, 'Database is offline');
  assert(health.dependencies.redis, 'Redis is offline');
  assert(health.dependencies.worker, 'Worker is offline');

  const hookPath = `smoke-${Date.now()}`;
  const definition = {
    nodes: [
      { id: 'webhook', type: 'trigger.webhook', name: 'Webhook', position: { x: 100, y: 100 }, parameters: { path: hookPath, method: 'POST' } },
      { id: 'set', type: 'core.setData', name: 'Set Data', position: { x: 350, y: 100 }, parameters: { values: { accepted: true }, keepInput: true } },
      { id: 'respond', type: 'core.respondWebhook', name: 'Respond', position: { x: 600, y: 100 }, parameters: {} },
    ],
    edges: [{ id: 'e1', source: 'webhook', target: 'set' }, { id: 'e2', source: 'set', target: 'respond' }],
    settings: { timeoutMs: 30_000, saveExecutionProgress: true },
  };
  const workflow = await request<WorkflowResponse>('/api/v1/workflows', {
    method: 'POST', body: JSON.stringify({ name: `Smoke ${new Date().toISOString()}`, definition }),
  });
  await request(`/api/v1/workflows/${workflow.id}/activate`, { method: 'POST' });
  const idempotencyKey = `smoke-${crypto.randomUUID()}`;
  const first = await request<HookResponse>(`/webhook/${workflow.id}/${hookPath}`, {
    method: 'POST', headers: { 'idempotency-key': idempotencyKey }, body: JSON.stringify({ name: 'm2m' }),
  });
  const duplicate = await request<HookResponse>(`/webhook/${workflow.id}/${hookPath}`, {
    method: 'POST', headers: { 'idempotency-key': idempotencyKey }, body: JSON.stringify({ name: 'duplicate' }),
  });
  assert(first.executionId === duplicate.executionId, 'Idempotency key created a duplicate execution');
  assert(duplicate.duplicate === true, 'Duplicate webhook was not identified');
  const execution = await waitForExecution(first.executionId);
  assert(execution.status === 'success', `Webhook execution failed: ${JSON.stringify(execution.error)}`);
  assert(execution.nodes.length === 3, 'Expected three node execution records');
  assert(execution.nodes.every((node) => node.status === 'success'), 'A webhook node did not succeed');
  assert(execution.workflowVersionId, 'Execution has no workflow version');
  const retry = await request<ExecutionResponse>(`/api/v1/executions/${execution.id}/retry`, { method: 'POST' });
  const retried = await waitForExecution(retry.id);
  assert(retried.status === 'success', 'Retry execution failed');
  assert(retried.retryOfId === execution.id, 'Retry lineage is missing');

  const credential = await request<CredentialResponse>('/api/v1/credentials', {
    method: 'POST',
    body: JSON.stringify({ name: `Smoke AI ${Date.now()}`, type: 'openaiCompatible', data: { apiKey: 'smoke-secret', baseUrl: `http://127.0.0.1:${address.port}/v1` } }),
  });
  const aiDefinition = {
    nodes: [
      { id: 'manual', type: 'trigger.manual', name: 'Manual', position: { x: 100, y: 100 }, parameters: {} },
      { id: 'ai', type: 'ai.prompt', name: 'AI Prompt', position: { x: 400, y: 100 }, credentials: { primary: credential.id }, parameters: { provider: 'openai-compatible', model: 'smoke-model', prompt: 'Say hello', temperature: 0, maxTokens: 32 } },
    ],
    edges: [{ id: 'ai-edge', source: 'manual', target: 'ai' }],
    settings: { timeoutMs: 30_000, saveExecutionProgress: true },
  };
  const aiWorkflow = await request<WorkflowResponse>('/api/v1/workflows', {
    method: 'POST', body: JSON.stringify({ name: `AI Smoke ${new Date().toISOString()}`, definition: aiDefinition }),
  });
  const aiRun = await request<ExecutionResponse>(`/api/v1/workflows/${aiWorkflow.id}/run`, { method: 'POST', body: '{}' });
  const aiExecution = await waitForExecution(aiRun.id);
  const aiNode = aiExecution.nodes.find((node) => node.nodeId === 'ai');
  assert(aiExecution.status === 'success', `AI execution failed: ${JSON.stringify(aiExecution.error)}`);
  assert(aiNode?.output?.json?.text === 'hello from compatible AI', 'AI Prompt output is incorrect');

  console.log(JSON.stringify({
    health: 'ok', workflowId: workflow.id, executionId: execution.id, nodeCount: execution.nodes.length,
    idempotency: 'ok', retryId: retried.id, retryStatus: retried.status,
    aiExecutionId: aiExecution.id, aiProvider: 'openai-compatible', aiText: aiNode.output.json.text,
  }, null, 2));
} finally {
  await new Promise<void>((resolve, reject) => mockAI.close((error) => error ? reject(error) : resolve()));
}
