import type { NodeRegistry } from '@m2m/node-sdk';
import type { WorkflowDefinition } from '@m2m/shared';
import { validateExpression } from './expression/index.js';

export type ValidationCategory =
  | 'trigger'
  | 'node_config'
  | 'topology'
  | 'edge'
  | 'expression';

export interface ValidationIssue {
  code: string;
  category: ValidationCategory;
  nodeId?: string;
  nodeName?: string;
  field?: string;
  fieldDisplayName?: string;
  message: string;
  messageVi: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  summary: string;
  summaryVi: string;
}

export function validateWorkflow(
  definition: WorkflowDefinition,
  registry: NodeRegistry,
): ValidationResult {
  const errors: ValidationIssue[] = [];
  const ids = new Set<string>();
  const edgeIds = new Set<string>();
  const nodeMap = new Map(definition.nodes.map((n) => [n.id, n]));

  if (!definition.nodes || definition.nodes.length === 0) {
    errors.push({
      code: 'EMPTY_WORKFLOW',
      category: 'topology',
      message: 'Workflow canvas is empty. Please add at least one trigger node.',
      messageVi: 'Sơ đồ quy trình đang trống. Vui lòng thêm ít nhất một khối Kích hoạt (Trigger).'
    });
    return {
      valid: false,
      errors,
      summary: 'Workflow canvas is empty.',
      summaryVi: 'Sơ đồ quy trình đang trống.'
    };
  }

  // 1. Validate Nodes & Properties
  for (const node of definition.nodes) {
    if (ids.has(node.id)) {
      errors.push({
        code: 'DUPLICATE_NODE_ID',
        category: 'topology',
        nodeId: node.id,
        nodeName: node.name,
        message: `Duplicate node ID: '${node.id}'`,
        messageVi: `Trùng lặp mã định danh của khối: '${node.id}'`
      });
    }
    ids.add(node.id);

    if (!registry.has(node.type)) {
      errors.push({
        code: 'UNKNOWN_NODE_TYPE',
        category: 'node_config',
        nodeId: node.id,
        nodeName: node.name,
        field: 'type',
        message: `Unknown node type '${node.type}' on node '${node.name}'`,
        messageVi: `Khối '${node.name}' có loại node không xác định trong hệ thống: '${node.type}'`
      });
      continue;
    }

    const metadata = registry.get(node.type).metadata;
    for (const property of metadata.properties.filter((item) => item.required)) {
      const value = node.parameters?.[property.name];
      if (value === undefined || value === null || value === '') {
        errors.push({
          code: 'REQUIRED_PROPERTY_MISSING',
          category: 'node_config',
          nodeId: node.id,
          nodeName: node.name,
          field: property.name,
          fieldDisplayName: property.displayName,
          message: `[${node.name}]: '${property.displayName}' is required`,
          messageVi: `[${node.name}]: Tham số '${property.displayName}' là bắt buộc, không được để trống`
        });
      }
    }

    const cloudMediaProviders = new Set(['huggingface', 'black-forest-labs']);
    const provider = typeof node.parameters?.provider === 'string' ? node.parameters.provider : '';
    if (node.type.startsWith('m2m.media.') && cloudMediaProviders.has(provider) && !Object.keys(node.credentials ?? {}).length) {
      errors.push({
        code: 'CREDENTIAL_REQUIRED',
        category: 'node_config',
        nodeId: node.id,
        nodeName: node.name,
        field: 'credentials',
        fieldDisplayName: 'Credential',
        message: `[${node.name}]: Select a ${provider} credential before running this node`,
        messageVi: `[${node.name}]: Hãy chọn thông tin xác thực ${provider} trước khi chạy node này`
      });
    }

    // Scan expressions
    const scan = (value: unknown): void => {
      if (typeof value === 'string') {
        for (const match of value.matchAll(/\{\{([\s\S]*?)\}\}/g)) {
          try {
            validateExpression(match[1]);
          } catch (error) {
            const errMsg = error instanceof Error ? error.message : 'Invalid syntax';
            errors.push({
              code: 'INVALID_EXPRESSION',
              category: 'expression',
              nodeId: node.id,
              nodeName: node.name,
              message: `[${node.name}]: Invalid expression '{{ ${match[1]} }}' (${errMsg})`,
              messageVi: `[${node.name}]: Biểu thức '{{ ${match[1]} }}' bị lỗi cú pháp (${errMsg})`
            });
          }
        }
      } else if (Array.isArray(value)) value.forEach(scan);
      else if (value && typeof value === 'object') Object.values(value).forEach(scan);
    };
    if (node.parameters) scan(node.parameters);
  }

  // 2. Validate Edges
  for (const edge of definition.edges) {
    if (edgeIds.has(edge.id)) {
      errors.push({
        code: 'DUPLICATE_EDGE_ID',
        category: 'edge',
        message: `Duplicate edge ID: '${edge.id}'`,
        messageVi: `Trùng lặp mã dây nối: '${edge.id}'`
      });
    }
    edgeIds.add(edge.id);

    if (!ids.has(edge.source) || !ids.has(edge.target)) {
      errors.push({
        code: 'INVALID_EDGE_TARGET',
        category: 'edge',
        message: `Edge connects to a missing node (${edge.source} -> ${edge.target})`,
        messageVi: `Dây nối liên kết đến khối không tồn tại trên Canvas (${edge.source} -> ${edge.target})`
      });
      continue;
    }

    const source = nodeMap.get(edge.source);
    if (source && registry.has(source.type)) {
      const metadata = registry.get(source.type).metadata;
      if (metadata.outputs === 0) {
        errors.push({
          code: 'INVALID_OUTPUT_EDGE',
          category: 'edge',
          nodeId: source.id,
          nodeName: source.name,
          message: `[${source.name}]: This node cannot have outgoing edges`,
          messageVi: `[${source.name}]: Khối này không hỗ trợ tạo dây nối đầu ra`
        });
      }
      if (edge.sourceHandle && metadata.outputNames && !metadata.outputNames.includes(edge.sourceHandle)) {
        errors.push({
          code: 'UNKNOWN_OUTPUT_HANDLE',
          category: 'edge',
          nodeId: source.id,
          nodeName: source.name,
          message: `[${source.name}]: Unknown output handle '${edge.sourceHandle}'`,
          messageVi: `[${source.name}]: Cổng đầu ra '${edge.sourceHandle}' không hợp lệ`
        });
      }
    }
  }

  // 3. Validate Triggers
  const triggers = definition.nodes.filter(
    (node) => registry.has(node.type) && registry.get(node.type).metadata.category === 'trigger',
  );

  if (triggers.length === 0) {
    errors.push({
      code: 'MISSING_TRIGGER',
      category: 'trigger',
      message: 'Workflow must contain a trigger node (e.g. Manual, Webhook, or Schedule)',
      messageVi: 'Quy trình cần có ít nhất 1 khối Kích hoạt (như Kích hoạt thủ công, Webhook hoặc Lập lịch)'
    });
  } else if (triggers.length > 1) {
    errors.push({
      code: 'MULTIPLE_TRIGGERS',
      category: 'trigger',
      message: `Workflow currently supports exactly one trigger node (found ${triggers.length}: ${triggers.map((t) => t.name).join(', ')})`,
      messageVi: `Quy trình hiện tại chỉ hỗ trợ duy nhất 1 khối Kích hoạt (tìm thấy ${triggers.length} khối: ${triggers.map((t) => t.name).join(', ')})`
    });
  }

  // 4. Validate Cycles (Circular Dependencies)
  const outgoing = new Map<string, string[]>();
  for (const edge of definition.edges) {
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target]);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const hasCycle = (nodeId: string): boolean => {
    if (visiting.has(nodeId)) return true;
    if (visited.has(nodeId)) return false;
    visiting.add(nodeId);
    if ((outgoing.get(nodeId) ?? []).some(hasCycle)) return true;
    visiting.delete(nodeId);
    visited.add(nodeId);
    return false;
  };

  const cycleNode = definition.nodes.find((node) => hasCycle(node.id));
  if (cycleNode) {
    errors.push({
      code: 'CYCLE_DETECTED',
      category: 'topology',
      nodeId: cycleNode.id,
      nodeName: cycleNode.name,
      message: `Workflow contains invalid dependency cycles around node '${cycleNode.name}'`,
      messageVi: `Sơ đồ bị lỗi vòng lặp kín (Loop Cycle) không hợp lệ quanh khối '${cycleNode.name}'`
    });
  }

  // 5. Validate Reachability from Single Trigger
  if (triggers.length === 1) {
    const trigger = triggers[0];
    if (definition.edges.some((edge) => edge.target === trigger.id)) {
      errors.push({
        code: 'TRIGGER_INCOMING_EDGE',
        category: 'trigger',
        nodeId: trigger.id,
        nodeName: trigger.name,
        message: `Trigger node '${trigger.name}' cannot have incoming edges`,
        messageVi: `Khối Kích hoạt '${trigger.name}' không được có dây nối đi vào (chỉ có đầu ra)`
      });
    }

    const reachable = new Set<string>();
    const visit = (nodeId: string): void => {
      if (reachable.has(nodeId)) return;
      reachable.add(nodeId);
      definition.edges.filter((edge) => edge.source === nodeId).forEach((edge) => visit(edge.target));
    };
    visit(trigger.id);

    for (const node of definition.nodes) {
      if (!reachable.has(node.id)) {
        errors.push({
          code: 'UNREACHABLE_NODE',
          category: 'topology',
          nodeId: node.id,
          nodeName: node.name,
          message: `Node '${node.name}' is isolated and not connected from the trigger`,
          messageVi: `Khối '${node.name}' bị cô lập, chưa được nối dây từ khối Kích hoạt`
        });
      }
    }
  }

  const summary = errors.length > 0
    ? errors[0].message
    : 'Workflow is valid and ready to execute.';
  const summaryVi = errors.length > 0
    ? errors[0].messageVi
    : 'Quy trình hợp lệ, sẵn sàng thực thi.';

  return {
    valid: errors.length === 0,
    errors,
    summary,
    summaryVi
  };
}
