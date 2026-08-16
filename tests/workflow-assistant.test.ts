import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNodeRegistry } from '../packages/config/src/index.js';
import { applyWorkflowAgentPlan, processWorkflowAssistant } from '../apps/api/src/assistant-service.js';
import type { WorkflowDefinition } from '../packages/shared/src/index.js';

const registry = createNodeRegistry();
const nodeTypes = registry.list();

function workflowWithVideo(provider = 'huggingface'): WorkflowDefinition {
  return {
    nodes: [
      {
        id: 'trigger',
        type: 'trigger.manual',
        name: 'Manual Trigger',
        position: { x: 0, y: 0 },
        parameters: {}
      },
      {
        id: 'video',
        type: 'm2m.media.imageToVideo',
        name: 'Create Video',
        position: { x: 300, y: 0 },
        parameters: {
          provider,
          model: provider === 'huggingface' ? 'hf-ltx-video-i2v' : 'wan2.2-ti2v-5b',
          image: '{{ $json.media }}',
          prompt: '{{ $json.text }}'
        },
        credentials: provider === 'huggingface' ? { primary: 'hf-existing' } : undefined,
        retry: { enabled: true, maxAttempts: 3, delayMs: 500, backoff: 'exponential' },
        timeoutMs: 180_000
      }
    ],
    edges: [{ id: 'trigger-video', source: 'trigger', target: 'video' }],
    settings: { timeoutMs: 300_000, saveExecutionProgress: true }
  };
}

describe('workflow Gemini assistant', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('applies a minimal node update without dropping credentials or runtime controls', () => {
    const result = applyWorkflowAgentPlan({
      workflow: workflowWithVideo(),
      plan: {
        explanation: 'Improve the motion prompt',
        assumptions: [],
        manualSteps: [],
        operations: [{ op: 'updateNode', nodeId: 'video', patch: { parameters: { prompt: 'Slow cinematic orbit' } } }]
      },
      nodeTypes,
      availableCredentials: [{ id: 'hf-existing', name: 'HF', type: 'huggingface' }],
      providerStatuses: [{ provider: 'huggingface', available: true }]
    });

    const video = result.definition.nodes.find((node) => node.id === 'video')!;
    expect(video.parameters.prompt).toBe('Slow cinematic orbit');
    expect(video.parameters.image).toBe('{{ $json.media }}');
    expect(video.credentials).toEqual({ primary: 'hf-existing' });
    expect(video.retry).toEqual({ enabled: true, maxAttempts: 3, delayMs: 500, backoff: 'exponential' });
    expect(video.timeoutMs).toBe(180_000);
    expect(result.definition.edges).toEqual([{ id: 'trigger-video', source: 'trigger', target: 'video' }]);
    expect(result.readyToRun).toBe(true);
  });

  it('aligns the video model and auto-binds the only compatible credential when provider changes', () => {
    const result = applyWorkflowAgentPlan({
      workflow: workflowWithVideo('comfyui'),
      plan: {
        explanation: 'Use Hugging Face',
        assumptions: [],
        manualSteps: [],
        operations: [{ op: 'updateNode', nodeId: 'video', patch: { parameters: { provider: 'huggingface' } } }]
      },
      nodeTypes,
      availableCredentials: [{ id: 'hf-only', name: 'HF Cloud', type: 'huggingface' }],
      providerStatuses: [{ provider: 'huggingface', available: true }]
    });

    const video = result.definition.nodes.find((node) => node.id === 'video')!;
    expect(video.parameters.model).toBe('hf-ltx-video-i2v');
    expect(video.credentials).toEqual({ primary: 'hf-only' });
    expect(result.manualSteps).toEqual([]);
    expect(result.readyToRun).toBe(true);
  });

  it('removes dangling edges together with a deleted node', () => {
    const result = applyWorkflowAgentPlan({
      workflow: workflowWithVideo(),
      plan: {
        explanation: 'Remove video',
        assumptions: [],
        manualSteps: [],
        operations: [{ op: 'removeNode', nodeId: 'video' }]
      },
      nodeTypes
    });

    expect(result.definition.nodes.map((node) => node.id)).toEqual(['trigger']);
    expect(result.definition.edges).toEqual([]);
  });

  it('blocks an unsolicited full-workflow replacement', () => {
    const result = applyWorkflowAgentPlan({
      workflow: workflowWithVideo(),
      plan: {
        explanation: 'Replace everything',
        assumptions: [],
        manualSteps: [],
        operations: [{ op: 'replaceWorkflow', nodes: [], edges: [] }]
      },
      nodeTypes
    });

    expect(result.definition).toEqual(workflowWithVideo());
    expect(result.canApply).toBe(false);
    expect(result.warnings.join(' ')).toMatch(/chặn thao tác thay toàn bộ workflow/i);
  });

  it('does not count an empty update patch as a mutation', () => {
    const result = applyWorkflowAgentPlan({
      workflow: workflowWithVideo(),
      plan: {
        explanation: 'No-op update', assumptions: [], manualSteps: [],
        operations: [{ op: 'updateNode', nodeId: 'video', patch: { parameters: {} } }]
      },
      nodeTypes,
      availableCredentials: [{ id: 'hf-existing', name: 'HF', type: 'huggingface' }],
      providerStatuses: [{ provider: 'huggingface', available: true }]
    });

    expect(result.changes).toEqual([]);
    expect(result.canApply).toBe(false);
    expect(result.warnings.join(' ')).toMatch(/không tạo ra thay đổi/i);
  });

  it('uses Gemini structured interactions and validates the returned operation plan', async () => {
    const plan = {
      explanation: 'Update the prompt safely',
      assumptions: [],
      manualSteps: [],
      operations: [{ op: 'updateNode', nodeId: 'video', patch: { parameters: { prompt: 'Gentle camera pan' } } }]
    };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      status: 'completed',
      steps: [{ type: 'model_output', content: [{ type: 'text', text: JSON.stringify(plan) }] }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await processWorkflowAssistant({
      prompt: 'Improve video motion',
      workflow: workflowWithVideo(),
      nodeTypes,
      availableCredentials: [{ id: 'hf-existing', name: 'HF', type: 'huggingface' }],
      providerStatuses: [{ provider: 'huggingface', available: true }],
      apiKey: 'test-key',
      model: 'gemini-3.6-flash'
    });

    const [, request] = fetchMock.mock.calls[0];
    const body = JSON.parse(String(request?.body));
    expect(body.model).toBe('gemini-3.6-flash');
    expect(body.store).toBe(false);
    expect(body.response_format.mime_type).toBe('application/json');
    expect(body.response_format.schema.required).toContain('operations');
    expect(body.response_format.schema.properties.operations.items.anyOf).toHaveLength(7);
    expect(result.definition.nodes.find((node) => node.id === 'video')?.parameters.prompt).toBe('Gentle camera pan');
    expect(result.mutationsCount).toBe(1);
  });

  it('normalizes an equivalent Gemini operation variant before strict validation', async () => {
    const variantPlan = {
      summary: 'Update through a compatible variant',
      actions: [{
        operation: 'update_node',
        node: { id: 'video', parameters: { prompt: 'Normalized camera move' } }
      }],
      assumptions: null,
      manual_steps: []
    };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      status: 'completed',
      steps: [{ type: 'model_output', content: [{ type: 'text', text: JSON.stringify(variantPlan) }] }]
    }), { status: 200 })));

    const result = await processWorkflowAssistant({
      prompt: 'Update the video prompt',
      workflow: workflowWithVideo(),
      nodeTypes,
      availableCredentials: [{ id: 'hf-existing', name: 'HF', type: 'huggingface' }],
      providerStatuses: [{ provider: 'huggingface', available: true }],
      apiKey: 'test-key'
    });

    expect(result.definition.nodes.find((node) => node.id === 'video')?.parameters.prompt).toBe('Normalized camera move');
  });

  it('asks Gemini to repair one structurally invalid plan instead of failing immediately', async () => {
    const invalidPlan = {
      explanation: 'Missing update target', assumptions: [], manualSteps: [],
      operations: [{ op: 'updateNode' }]
    };
    const repairedPlan = {
      explanation: 'Repaired update', assumptions: [], manualSteps: [],
      operations: [{ op: 'updateNode', nodeId: 'video', patch: { parameters: { prompt: 'Repaired move' } } }]
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        status: 'completed', steps: [{ content: [{ type: 'text', text: JSON.stringify(invalidPlan) }] }]
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        status: 'completed', steps: [{ content: [{ type: 'text', text: JSON.stringify(repairedPlan) }] }]
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await processWorkflowAssistant({
      prompt: 'Repair the video node',
      workflow: workflowWithVideo(),
      nodeTypes,
      availableCredentials: [{ id: 'hf-existing', name: 'HF', type: 'huggingface' }],
      providerStatuses: [{ provider: 'huggingface', available: true }],
      apiKey: 'test-key'
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(JSON.parse(String(fetchMock.mock.calls[1][1]?.body)).input)).toContain('SCHEMA REPAIR REQUIRED');
    expect(result.definition.nodes.find((node) => node.id === 'video')?.parameters.prompt).toBe('Repaired move');
  });
});
