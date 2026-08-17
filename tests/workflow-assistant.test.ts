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

  it('generates multi-entity decomposition and final composition workflow', async () => {
    const multiEntityPlan = {
      explanation: 'Tách biệt nhân vật cô gái, ly rượu vang và bãi biển hoàng hôn thành 3 node tạo ảnh song song, sau đó hợp nhất trong 1 khung hình hoàn chỉnh.',
      assumptions: [],
      manualSteps: [],
      operations: [
        {
          op: 'replaceWorkflow',
          nodes: [
            {
              id: 'trigger',
              type: 'trigger.manual',
              name: 'Kích hoạt',
              position: { x: 80, y: 300 },
              parameters: {}
            },
            {
              id: 'char_node',
              type: 'm2m.media.generateImage',
              name: 'Tạo ảnh Nhân vật - Cô gái tóc vàng',
              position: { x: 420, y: 100 },
              parameters: {
                provider: 'pollinations',
                model: 'pollinations-flux',
                prompt: 'Chân dung cận cảnh cô gái tóc vàng tuyệt đẹp, nụ cười rạng rỡ hạnh phúc, ánh mắt lấp lánh, phong cách điện ảnh chân thực, 8k resolution'
              }
            },
            {
              id: 'object_node',
              type: 'm2m.media.generateImage',
              name: 'Tạo ảnh Đồ vật - Ly rượu vang đỏ',
              position: { x: 420, y: 340 },
              parameters: {
                provider: 'pollinations',
                model: 'pollinations-flux',
                prompt: 'Cận cảnh ly thủy tinh pha lê chứa rượu vang đỏ lấp lánh, ánh sáng phản chiếu sang trọng, chi tiết chất lỏng sắc nét, 8k resolution'
              }
            },
            {
              id: 'scenery_node',
              type: 'm2m.media.generateImage',
              name: 'Tạo ảnh Cảnh quan - Bãi biển hoàng hôn',
              position: { x: 420, y: 580 },
              parameters: {
                provider: 'pollinations',
                model: 'pollinations-flux',
                prompt: 'Toàn cảnh bờ biển tuyệt đẹp vào lúc hoàng hôn lãng mạn, sóng biển dịu êm vỗ bờ cát vàng, bầu trời rực rỡ sắc cam và hồng tím, cinematic lighting'
              }
            },
            {
              id: 'final_composite',
              type: 'm2m.media.generateImage',
              name: 'Hợp nhất Khung hình Tổng thể',
              position: { x: 820, y: 340 },
              parameters: {
                provider: 'pollinations',
                model: 'pollinations-flux',
                prompt: 'Tuyệt tác điện ảnh: Cô gái tóc vàng với nụ cười hạnh phúc rạng rỡ đang cầm ly rượu vang đỏ trên tay, đứng bên bờ biển hoàng hôn lãng mạn, ánh nắng chiều tà ấm áp chiếu rọi, bố cục hài hòa, 8k photorealistic masterpiece'
              }
            }
          ],
          edges: [
            { id: 'e1', source: 'trigger', target: 'char_node' },
            { id: 'e2', source: 'trigger', target: 'object_node' },
            { id: 'e3', source: 'trigger', target: 'scenery_node' },
            { id: 'e4', source: 'char_node', target: 'final_composite' },
            { id: 'e5', source: 'object_node', target: 'final_composite' },
            { id: 'e6', source: 'scenery_node', target: 'final_composite' }
          ]
        }
      ]
    };

    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      status: 'completed',
      steps: [{ type: 'model_output', content: [{ type: 'text', text: JSON.stringify(multiEntityPlan) }] }]
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await processWorkflowAssistant({
      prompt: 'Tạo quy trình tạo ảnh cô gái tóc vàng đang cười rạng rỡ cầm ly rượu vang đỏ bên bờ biển hoàng hôn lãng mạn',
      workflow: { nodes: [{ id: 'trigger', type: 'trigger.manual', name: 'Manual Trigger', position: { x: 0, y: 0 }, parameters: {} }], edges: [], settings: {} },
      nodeTypes,
      apiKey: 'test-key',
      model: 'gemini-3.6-flash'
    });

    expect(result.definition.nodes).toHaveLength(5);
    expect(result.definition.edges).toHaveLength(6);
    expect(result.canApply).toBe(true);
    expect(result.readyToRun).toBe(true);

    const charNode = result.definition.nodes.find((n) => n.id === 'char_node')!;
    const objNode = result.definition.nodes.find((n) => n.id === 'object_node')!;
    const sceneryNode = result.definition.nodes.find((n) => n.id === 'scenery_node')!;
    const finalNode = result.definition.nodes.find((n) => n.id === 'final_composite')!;

    expect(charNode.parameters.prompt).toContain('nụ cười rạng rỡ');
    expect(objNode.parameters.prompt).toContain('rượu vang đỏ');
    expect(sceneryNode.parameters.prompt).toContain('hoàng hôn');
    expect(finalNode.parameters.prompt).toContain('Tuyệt tác điện ảnh');

    // Verify auto-filled parameters
    expect(charNode.parameters.width).toBe(832);
    expect(charNode.parameters.height).toBe(1216);
    expect(sceneryNode.parameters.width).toBe(1280);
    expect(sceneryNode.parameters.height).toBe(720);
    expect(finalNode.parameters.width).toBe(1280);
    expect(finalNode.parameters.height).toBe(720);
    expect(charNode.parameters.negativePrompt).toBeDefined();
    expect(finalNode.parameters.negativePrompt).toContain('floating objects');
    expect(finalNode.parameters.negativePrompt).toContain('cut and paste look');
    expect(charNode.parameters.steps).toBe(25);
    expect(charNode.parameters.guidance).toBe(7.5);
  });

  it('automatically configures parameters and binds cloud credentials for newly added image nodes', () => {
    const result = applyWorkflowAgentPlan({
      workflow: { nodes: [{ id: 'trigger', type: 'trigger.manual', name: 'Trigger', position: { x: 0, y: 0 }, parameters: {} }], edges: [], settings: {} },
      plan: {
        explanation: 'Thêm node tạo ảnh chân dung nhân vật',
        assumptions: [],
        manualSteps: [],
        operations: [
          {
            op: 'addNode',
            node: {
              id: 'char1',
              type: 'm2m.media.generateImage',
              name: 'Tạo ảnh Nhân vật - Nam chiến binh',
              parameters: {
                provider: 'siliconflow',
                prompt: 'Chiến binh dũng cảm trong bộ giáp bạc'
              }
            }
          }
        ]
      },
      nodeTypes,
      availableCredentials: [{ id: 'sf-key-1', name: 'SiliconFlow Prod', type: 'siliconflow' }],
      providerStatuses: [{ provider: 'siliconflow', available: true }]
    });

    const node = result.definition.nodes.find((n) => n.id === 'char1')!;
    expect(node.parameters.provider).toBe('siliconflow');
    expect(node.parameters.model).toBe('siliconflow-flux-schnell');
    expect(node.credentials).toEqual({ primary: 'sf-key-1' });
    expect(node.parameters.width).toBe(832);
    expect(node.parameters.height).toBe(1216);
    expect(node.parameters.steps).toBe(25);
    expect(node.parameters.guidance).toBe(7.5);
    expect(node.parameters.negativePrompt).toContain('blurry');
    expect(result.manualSteps).toEqual([]);
    expect(result.readyToRun).toBe(true);
    expect(result.changes).toContain('[+] Thêm node mới: "Tạo ảnh Nhân vật - Nam chiến binh" (m2m.media.generateImage)');
  });

  it('clearly reports deleted, modified, and added nodes for user preview and confirmation', () => {
    const existingWorkflow = {
      nodes: [
        { id: 'trigger', type: 'trigger.manual', name: 'Thủ công', position: { x: 0, y: 0 }, parameters: {} },
        { id: 'old_image', type: 'm2m.media.generateImage', name: 'Ảnh cũ cần xóa', position: { x: 300, y: 0 }, parameters: { prompt: 'old' } }
      ],
      edges: [{ id: 'e1', source: 'trigger', target: 'old_image' }],
      settings: {}
    };

    const result = applyWorkflowAgentPlan({
      workflow: existingWorkflow,
      plan: {
        explanation: 'Xóa ảnh cũ và thêm 2 node mới',
        assumptions: [],
        manualSteps: [],
        operations: [
          { op: 'removeNode', nodeId: 'old_image' },
          {
            op: 'addNode',
            node: {
              id: 'new_char',
              type: 'm2m.media.generateImage',
              name: 'Tạo ảnh Nhân vật',
              parameters: { prompt: 'character' }
            }
          },
          {
            op: 'updateNode',
            nodeId: 'trigger',
            patch: { name: 'Kích hoạt thủ công' }
          },
          {
            op: 'addEdge',
            edge: { id: 'e2', source: 'trigger', target: 'new_char' }
          }
        ]
      },
      nodeTypes
    });

    expect(result.changes).toEqual([
      '[-] Xóa node: "Ảnh cũ cần xóa" (m2m.media.generateImage)',
      '[+] Thêm node mới: "Tạo ảnh Nhân vật" (m2m.media.generateImage)',
      '[~] Cập nhật node: "Thủ công" (Đổi tên thành "Kích hoạt thủ công")',
      '[→] Nối kết nối: "Kích hoạt thủ công" → "Tạo ảnh Nhân vật"'
    ]);
    expect(result.canApply).toBe(true);
  });

  it('automatically configures parameters and resilience for AI prompt, agent, and classification nodes', () => {
    const result = applyWorkflowAgentPlan({
      workflow: {
        nodes: [{ id: 'trigger', type: 'trigger.manual', name: 'Trigger', position: { x: 0, y: 0 }, parameters: {} }],
        edges: [],
        settings: {}
      },
      plan: {
        explanation: 'Thêm chuỗi AI Prompt -> Text Classification -> AI Agent',
        assumptions: [],
        manualSteps: [],
        operations: [
          {
            op: 'addNode',
            node: {
              id: 'ai_prompt',
              type: 'ai.prompt',
              name: 'Trợ lý AI phân tích',
              parameters: { prompt: 'Phân tích phản hồi khách hàng: {{ $json.text }}' }
            }
          },
          {
            op: 'addNode',
            node: {
              id: 'classifier',
              type: 'ai.textClassification',
              name: 'Phân loại cảm xúc',
              parameters: { text: '{{ $json.text }}' }
            }
          },
          {
            op: 'addNode',
            node: {
              id: 'agent',
              type: 'ai.agent',
              name: 'Agent tự động xử lý',
              parameters: { prompt: 'Xử lý yêu cầu tự động' }
            }
          }
        ]
      },
      nodeTypes,
      availableCredentials: [{ id: 'gemini-key', name: 'Gemini Primary', type: 'gemini' }],
      providerStatuses: [{ provider: 'gemini', available: true }]
    });

    const promptNode = result.definition.nodes.find((n) => n.id === 'ai_prompt')!;
    expect(promptNode.parameters.provider).toBe('gemini');
    expect(promptNode.parameters.model).toBe('gemini-2.5-flash');
    expect(promptNode.parameters.temperature).toBe(0.2);
    expect(promptNode.parameters.maxTokens).toBe(2048);
    expect(promptNode.timeoutMs).toBe(60_000);
    expect(promptNode.retry).toEqual({ enabled: true, maxAttempts: 3, delayMs: 1000, backoff: 'exponential' });
    expect(promptNode.credentials).toEqual({ primary: 'gemini-key' });

    const classifierNode = result.definition.nodes.find((n) => n.id === 'classifier')!;
    expect(classifierNode.parameters.labels).toEqual(['positive', 'neutral', 'negative']);
    expect(classifierNode.timeoutMs).toBe(60_000);

    const agentNode = result.definition.nodes.find((n) => n.id === 'agent')!;
    expect(agentNode.parameters.maxSteps).toBe(5);
    expect(agentNode.parameters.system).toContain('intelligent workflow automation agent');
    expect(agentNode.timeoutMs).toBe(90_000);
  });

  it('automatically configures media pipeline nodes with optimal defaults and expression piping', () => {
    const result = applyWorkflowAgentPlan({
      workflow: {
        nodes: [{ id: 'trigger', type: 'trigger.manual', name: 'Trigger', position: { x: 0, y: 0 }, parameters: {} }],
        edges: [],
        settings: {}
      },
      plan: {
        explanation: 'Thêm pipeline Storyboard -> Edit Image -> Merge Video',
        assumptions: [],
        manualSteps: [],
        operations: [
          {
            op: 'addNode',
            node: {
              id: 'storyboard',
              type: 'm2m.media.storyboardSplitter',
              name: 'Phân cảnh kịch bản',
              parameters: {}
            }
          },
          {
            op: 'addNode',
            node: {
              id: 'edit_img',
              type: 'm2m.media.editImage',
              name: 'Chỉnh sửa ảnh nghệ thuật',
              parameters: {}
            }
          },
          {
            op: 'addNode',
            node: {
              id: 'merge_vid',
              type: 'm2m.media.mergeVideo',
              name: 'Ghép video thành phẩm',
              parameters: {}
            }
          }
        ]
      },
      nodeTypes
    });

    const storyboard = result.definition.nodes.find((n) => n.id === 'storyboard')!;
    expect(storyboard.parameters.targetScenes).toBe(4);
    expect(storyboard.parameters.targetDuration).toBe(15);
    expect(storyboard.parameters.script).toBe('{{ $json.text }}');

    const editImg = result.definition.nodes.find((n) => n.id === 'edit_img')!;
    expect(editImg.parameters.strength).toBe(0.75);
    expect(editImg.parameters.image).toBe('{{ $json.media }}');
    expect(editImg.retry).toEqual({ enabled: true, maxAttempts: 3, delayMs: 1000, backoff: 'exponential' });

    const mergeVid = result.definition.nodes.find((n) => n.id === 'merge_vid')!;
    expect(mergeVid.parameters.mode).toBe('concat');
    expect(mergeVid.parameters.transition).toBe('fade');
  });

  it('automatically applies Sugiyama DAG layout and heals conditional edge handles', () => {
    const result = applyWorkflowAgentPlan({
      workflow: {
        nodes: [{ id: 'trigger', type: 'trigger.manual', name: 'Trigger', position: { x: 0, y: 0 }, parameters: {} }],
        edges: [],
        settings: {}
      },
      plan: {
        explanation: 'Tạo quy trình phân nhánh IF với 2 hành động xử lý kết quả',
        operations: [
          {
            op: 'replaceWorkflow',
            nodes: [
              { id: 'trig', type: 'trigger.manual', name: 'Trigger', position: { x: 0, y: 0 }, parameters: {} },
              { id: 'if_node', type: 'core.if', name: 'Check VIP', position: { x: 0, y: 0 }, parameters: { leftValue: 'vip', operator: 'equals', rightValue: 'true' } },
              { id: 'vip_action', type: 'core.httpRequest', name: 'VIP HTTP Action', position: { x: 0, y: 0 }, parameters: { url: 'https://api.vip.com' } },
              { id: 'normal_action', type: 'core.httpRequest', name: 'Normal HTTP Action', position: { x: 0, y: 0 }, parameters: { url: 'https://api.normal.com' } }
            ],
            edges: [
              { id: 'e1', source: 'trig', target: 'if_node' },
              { id: 'e2', source: 'if_node', target: 'vip_action' }, // Missing sourceHandle
              { id: 'e3', source: 'if_node', target: 'normal_action' } // Missing sourceHandle
            ]
          }
        ]
      },
      allowReplaceWorkflow: true,
      nodeTypes
    });

    // 1. Verify Sugiyama DAG Layering
    const trig = result.definition.nodes.find((n) => n.id === 'trig')!;
    const ifNode = result.definition.nodes.find((n) => n.id === 'if_node')!;
    const vipAction = result.definition.nodes.find((n) => n.id === 'vip_action')!;
    const normalAction = result.definition.nodes.find((n) => n.id === 'normal_action')!;

    expect(trig.position.x).toBe(80);
    expect(ifNode.position.x).toBe(440);
    expect(vipAction.position.x).toBe(800);
    expect(normalAction.position.x).toBe(800);
    expect(vipAction.position.y).not.toBe(normalAction.position.y);

    // 2. Verify Edge Handle Healing
    const e2 = result.definition.edges.find((e) => e.id === 'e2')!;
    const e3 = result.definition.edges.find((e) => e.id === 'e3')!;
    expect(e2.sourceHandle).toBe('true');
    expect(e3.sourceHandle).toBe('false');
  });

  it('automatically injects type-safe data expressions between upstream and downstream nodes', () => {
    const result = applyWorkflowAgentPlan({
      workflow: {
        nodes: [{ id: 'trigger', type: 'trigger.manual', name: 'Trigger', position: { x: 0, y: 0 }, parameters: {} }],
        edges: [],
        settings: {}
      },
      plan: {
        explanation: 'Kết nối AI Prompt sang Generate Image và ImageToVideo',
        operations: [
          {
            op: 'replaceWorkflow',
            nodes: [
              { id: 'trig', type: 'trigger.manual', name: 'Trigger', position: { x: 0, y: 0 }, parameters: {} },
              { id: 'writer', type: 'ai.prompt', name: 'AI Writer', position: { x: 0, y: 0 }, parameters: { prompt: 'Viết prompt tạo ảnh' } },
              { id: 'painter', type: 'm2m.media.generateImage', name: 'AI Painter', position: { x: 0, y: 0 }, parameters: {} },
              { id: 'animator', type: 'm2m.media.imageToVideo', name: 'AI Animator', position: { x: 0, y: 0 }, parameters: {} }
            ],
            edges: [
              { id: 'e1', source: 'trig', target: 'writer' },
              { id: 'e2', source: 'writer', target: 'painter' },
              { id: 'e3', source: 'painter', target: 'animator' }
            ]
          }
        ]
      },
      allowReplaceWorkflow: true,
      nodeTypes
    });

    const painter = result.definition.nodes.find((n) => n.id === 'painter')!;
    expect(painter.parameters.prompt).toBe('{{ $json.text }}');

    const animator = result.definition.nodes.find((n) => n.id === 'animator')!;
    expect(animator.parameters.image).toBe('{{ $json.media }}');
  });
});



