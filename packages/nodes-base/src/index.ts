import { isIP } from 'node:net';
import type { M2MNode, NodeExecutionContext, NodeMetadata, NodeRegistry } from '@m2m/node-sdk';
import { M2MError, type NodeExecutionResult } from '@m2m/shared';

abstract class BaseNode implements M2MNode {
  abstract readonly type: string;
  readonly version = 1;
  abstract readonly metadata: NodeMetadata;
  abstract execute(context: NodeExecutionContext): Promise<NodeExecutionResult>;
}

class ManualTriggerNode extends BaseNode {
  readonly type = 'trigger.manual';
  readonly metadata: NodeMetadata = {
    type: this.type, version: 1, displayName: 'Manual Trigger', category: 'trigger', icon: 'play', inputs: 0, outputs: 1, properties: [],
  };
  async execute({ input }: NodeExecutionContext): Promise<NodeExecutionResult> { return { json: input ?? {} }; }
}

class WebhookTriggerNode extends BaseNode {
  readonly type = 'trigger.webhook';
  readonly metadata: NodeMetadata = {
    type: this.type, version: 1, displayName: 'Webhook Trigger', category: 'trigger', icon: 'webhook', inputs: 0, outputs: 1,
    properties: [
      { name: 'path', displayName: 'Path', type: 'string', required: true, default: 'incoming' },
      { name: 'method', displayName: 'Method', type: 'select', required: true, default: 'POST', options: [{label:'POST',value:'POST'},{label:'GET',value:'GET'}] },
    ],
  };
  async execute({ input }: NodeExecutionContext): Promise<NodeExecutionResult> { return { json: input ?? {} }; }
}

class ScheduleTriggerNode extends BaseNode {
  readonly type = 'trigger.schedule';
  readonly metadata: NodeMetadata = {
    type: this.type, version: 1, displayName: 'Schedule Trigger', category: 'trigger', icon: 'clock', inputs: 0, outputs: 1,
    properties: [
      { name: 'mode', displayName: 'Schedule', type: 'select', required: true, default: 'everyMinutes', options: [
        { label: 'Every N minutes', value: 'everyMinutes' }, { label: 'Hourly', value: 'hourly' },
        { label: 'Daily', value: 'daily' }, { label: 'Weekly', value: 'weekly' }, { label: 'Cron expression', value: 'cron' },
      ] },
      { name: 'minutes', displayName: 'Minutes', type: 'number', default: 5, description: 'Used by Every N minutes.' },
      { name: 'hour', displayName: 'Hour (0-23)', type: 'number', default: 9, description: 'Used by Daily and Weekly.' },
      { name: 'minute', displayName: 'Minute (0-59)', type: 'number', default: 0 },
      { name: 'weekday', displayName: 'Weekday', type: 'select', default: 1, options: [
        { label: 'Sunday', value: 0 }, { label: 'Monday', value: 1 }, { label: 'Tuesday', value: 2 },
        { label: 'Wednesday', value: 3 }, { label: 'Thursday', value: 4 }, { label: 'Friday', value: 5 }, { label: 'Saturday', value: 6 },
      ] },
      { name: 'cron', displayName: 'Cron expression', type: 'string', default: '0 9 * * *', description: 'Five-field cron expression.' },
      { name: 'timezone', displayName: 'Timezone', type: 'string', default: 'Asia/Bangkok' },
    ],
  };
  async execute({ input }: NodeExecutionContext): Promise<NodeExecutionResult> { return { json: input ?? {} }; }
}

class SetDataNode extends BaseNode {
  readonly type = 'core.setData';
  readonly metadata: NodeMetadata = {
    type: this.type, version: 1, displayName: 'Set Data', category: 'core', icon: 'braces', inputs: 1, outputs: 1,
    properties: [
      { name: 'values', displayName: 'Values', type: 'json', required: true, default: {} },
      { name: 'keepInput', displayName: 'Keep Input', type: 'boolean', default: true },
    ],
  };
  async execute({ input, node }: NodeExecutionContext): Promise<NodeExecutionResult> {
    const values = (node.parameters.values ?? {}) as Record<string, unknown>;
    const original = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
    return { json: node.parameters.keepInput === false ? values : { ...original, ...values } };
  }
}

class IfNode extends BaseNode {
  readonly type = 'core.if';
  readonly metadata: NodeMetadata = {
    type: this.type, version: 1, displayName: 'IF', category: 'core', icon: 'git-branch', inputs: 1, outputs: 2, outputNames: ['true', 'false'],
    properties: [
      { name: 'left', displayName: 'Left value', type: 'string', required: true },
      { name: 'operator', displayName: 'Operator', type: 'select', default: 'equals', options: [
        {label:'Equals',value:'equals'},{label:'Not equals',value:'notEquals'},{label:'Contains',value:'contains'},
        {label:'Greater than',value:'greaterThan'},{label:'Exists',value:'exists'},
      ] },
      { name: 'right', displayName: 'Right value', type: 'string' },
    ],
  };
  async execute({ input, node }: NodeExecutionContext): Promise<NodeExecutionResult> {
    const left = node.parameters.left;
    const right = node.parameters.right;
    const operator = String(node.parameters.operator ?? 'equals');
    const passed = operator === 'equals' ? left === right
      : operator === 'notEquals' ? left !== right
      : operator === 'contains' ? String(left).includes(String(right))
      : operator === 'greaterThan' ? Number(left) > Number(right)
      : operator === 'exists' ? left !== undefined && left !== null && left !== ''
      : false;
    return { json: input, branch: passed ? 'true' : 'false', metadata: { passed } };
  }
}

function objectAtPath(value: unknown, path: string): unknown {
  if (!path) return value;
  return path.split('.').filter(Boolean).reduce<unknown>((current, key) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[key];
  }, value);
}

function compare(left: unknown, operator: string, right: unknown): boolean {
  if (operator === 'equals') return left === right || String(left) === String(right);
  if (operator === 'notEquals') return left !== right && String(left) !== String(right);
  if (operator === 'contains') return String(left ?? '').includes(String(right ?? ''));
  if (operator === 'startsWith') return String(left ?? '').startsWith(String(right ?? ''));
  if (operator === 'greaterThan') return Number(left) > Number(right);
  if (operator === 'lessThan') return Number(left) < Number(right);
  if (operator === 'exists') return left !== undefined && left !== null && left !== '';
  return false;
}

class TransformNode extends BaseNode {
  readonly type = 'core.transform';
  readonly metadata: NodeMetadata = {
    type: this.type, version: 1, displayName: 'Transform', category: 'core', icon: 'wand', inputs: 1, outputs: 1,
    description: 'Build an object from expression-resolved values without executing arbitrary code.',
    properties: [
      { name: 'template', displayName: 'Output template', type: 'json', required: true, default: {} },
      { name: 'mergeInput', displayName: 'Merge input', type: 'boolean', default: false },
    ],
  };
  async execute({ input, node }: NodeExecutionContext): Promise<NodeExecutionResult> {
    const template = node.parameters.template;
    if (!template || typeof template !== 'object' || Array.isArray(template)) throw new M2MError('VALIDATION_ERROR', 'Transform template must be an object');
    const source = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
    return { json: node.parameters.mergeInput ? { ...source, ...template as Record<string, unknown> } : template };
  }
}

class SwitchNode extends BaseNode {
  readonly type = 'core.switch';
  readonly metadata: NodeMetadata = {
    type: this.type, version: 1, displayName: 'Switch', category: 'core', icon: 'split', inputs: 1, outputs: 5,
    outputNames: ['case1', 'case2', 'case3', 'case4', 'default'],
    properties: [
      { name: 'value', displayName: 'Value', type: 'string', required: true },
      { name: 'cases', displayName: 'Cases', type: 'json', default: [
        { output: 'case1', operator: 'equals', value: 'one' }, { output: 'case2', operator: 'equals', value: 'two' },
      ], description: 'Up to four rules: output, operator, and value.' },
    ],
  };
  async execute({ input, node }: NodeExecutionContext): Promise<NodeExecutionResult> {
    const cases = Array.isArray(node.parameters.cases) ? node.parameters.cases : [];
    const matched = cases.slice(0, 4).find((item) => {
      if (!item || typeof item !== 'object') return false;
      const rule = item as Record<string, unknown>;
      return compare(node.parameters.value, String(rule.operator ?? 'equals'), rule.value);
    }) as Record<string, unknown> | undefined;
    const requested = String(matched?.output ?? 'default');
    const branch = ['case1', 'case2', 'case3', 'case4'].includes(requested) ? requested : 'default';
    return { json: input, branch, metadata: { matched: branch !== 'default' } };
  }
}

class MergeNode extends BaseNode {
  readonly type = 'core.merge';
  readonly metadata: NodeMetadata = {
    type: this.type, version: 1, displayName: 'Merge', category: 'core', icon: 'merge', inputs: 2, outputs: 1,
    properties: [{ name: 'mode', displayName: 'Mode', type: 'select', default: 'append', options: [
      { label: 'Append', value: 'append' }, { label: 'Combine objects', value: 'combine' }, { label: 'First available', value: 'first' },
    ] }],
  };
  async execute({ input, node }: NodeExecutionContext): Promise<NodeExecutionResult> {
    const values = Array.isArray(input) ? input : [input];
    const mode = String(node.parameters.mode ?? 'append');
    if (mode === 'first') return { json: values[0] };
    if (mode === 'combine') {
      const combined = values.reduce<Record<string, unknown>>((result, value) => value && typeof value === 'object' && !Array.isArray(value)
        ? { ...result, ...value as Record<string, unknown> } : result, {});
      return { json: combined };
    }
    return { json: values.flatMap((value) => Array.isArray(value) ? value : [value]) };
  }
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
  });
}

class DelayNode extends BaseNode {
  readonly type = 'core.delay';
  readonly metadata: NodeMetadata = {
    type: this.type, version: 1, displayName: 'Delay', category: 'core', icon: 'clock', inputs: 1, outputs: 1,
    properties: [{ name: 'durationMs', displayName: 'Duration (ms)', type: 'number', required: true, default: 1000, description: 'Maximum 24 hours.' }],
  };
  async execute({ input, node, signal }: NodeExecutionContext): Promise<NodeExecutionResult> {
    const durationMs = Number(node.parameters.durationMs);
    if (!Number.isFinite(durationMs) || durationMs < 0 || durationMs > 86_400_000) throw new M2MError('VALIDATION_ERROR', 'Delay must be between 0 and 86400000 ms');
    await wait(durationMs, signal);
    return { json: input, metadata: { durationMs } };
  }
}

class ForEachNode extends BaseNode {
  readonly type = 'core.forEach';
  readonly metadata: NodeMetadata = {
    type: this.type, version: 1, displayName: 'Loop / For Each', category: 'core', icon: 'repeat', inputs: 1, outputs: 1,
    description: 'Select and bound a collection for downstream collection-aware nodes.',
    properties: [
      { name: 'path', displayName: 'Array path', type: 'string', default: '', description: 'Dot path within the input; blank uses the input itself.' },
      { name: 'limit', displayName: 'Maximum items', type: 'number', default: 1000 },
    ],
  };
  async execute({ input, node }: NodeExecutionContext): Promise<NodeExecutionResult> {
    const value = objectAtPath(input, String(node.parameters.path ?? ''));
    if (!Array.isArray(value)) throw new M2MError('VALIDATION_ERROR', 'Loop / For Each input must be an array');
    const limit = Math.max(0, Math.min(10_000, Number(node.parameters.limit ?? 1000)));
    const items = value.slice(0, limit);
    return { json: items, metadata: { itemCount: items.length, truncated: value.length > items.length } };
  }
}

function assertSafeUrl(raw: string): URL {
  let url: URL;
  try { url = new URL(raw); } catch { throw new M2MError('VALIDATION_ERROR', 'HTTP Request URL is invalid'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new M2MError('VALIDATION_ERROR', 'Only HTTP(S) URLs are allowed');
  if (process.env.NODE_ENV === 'production') {
    const host = url.hostname.toLowerCase();
    const privateHost = host === 'localhost' || host.endsWith('.local') || host === '0.0.0.0' || host === '::1'
      || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)
      || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || (isIP(host) === 6 && /^(?:fc|fd|fe80)/i.test(host));
    if (privateHost) throw new M2MError('HTTP_SSRF_BLOCKED', 'Private network destinations are blocked');
  }
  return url;
}

class HttpRequestNode extends BaseNode {
  readonly type = 'core.httpRequest';
  readonly metadata: NodeMetadata = {
    type: this.type, version: 1, displayName: 'HTTP Request', category: 'core', icon: 'globe', inputs: 1, outputs: 1,
    properties: [
      { name: 'url', displayName: 'URL', type: 'string', required: true },
      { name: 'method', displayName: 'Method', type: 'select', default: 'GET', options: ['GET','POST','PUT','PATCH','DELETE'].map(value => ({label:value,value})) },
      { name: 'headers', displayName: 'Headers', type: 'json', default: {} },
      { name: 'body', displayName: 'Body', type: 'json' },
      { name: 'timeoutMs', displayName: 'HTTP timeout (ms)', type: 'number', default: 30000 },
    ],
  };
  async execute({ input, node, signal, credentials }: NodeExecutionContext): Promise<NodeExecutionResult> {
    const url = assertSafeUrl(String(node.parameters.url));
    const method = String(node.parameters.method ?? 'GET').toUpperCase();
    const headers = new Headers((node.parameters.headers ?? {}) as Record<string, string>);
    const credential = Object.values(credentials)[0];
    if (credential?.type === 'bearerToken' && credential.data.token) headers.set('authorization', `Bearer ${credential.data.token}`);
    if (credential?.type === 'apiKey' && credential.data.key) headers.set(credential.data.headerName ?? 'x-api-key', credential.data.key);
    let body: string | undefined;
    if (!['GET', 'HEAD'].includes(method) && node.parameters.body !== undefined) {
      headers.set('content-type', headers.get('content-type') ?? 'application/json');
      body = headers.get('content-type')?.includes('application/json') ? JSON.stringify(node.parameters.body) : String(node.parameters.body);
    }
    const timeout = AbortSignal.timeout(Number(node.parameters.timeoutMs ?? 30_000));
    const combined = AbortSignal.any([signal, timeout]);
    let response: Response;
    try { response = await fetch(url, { method, headers, body, signal: combined, redirect: 'follow' }); }
    catch (error) { throw new M2MError('HTTP_ERROR', error instanceof Error ? error.message : 'HTTP request failed', true); }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > 2 * 1024 * 1024) throw new M2MError('HTTP_RESPONSE_TOO_LARGE', 'HTTP response exceeds 2 MB');
    const text = new TextDecoder().decode(bytes);
    const contentType = response.headers.get('content-type') ?? '';
    const data = contentType.includes('json') ? JSON.parse(text || 'null') : text;
    if (!response.ok) throw new M2MError('HTTP_ERROR', `HTTP ${response.status}`, [429, 502, 503, 504].includes(response.status), { status: response.status, body: data });
    return { json: { status: response.status, headers: Object.fromEntries(response.headers), data, input } };
  }
}

class RespondWebhookNode extends BaseNode {
  readonly type = 'core.respondWebhook';
  readonly metadata: NodeMetadata = {
    type: this.type, version: 1, displayName: 'Respond to Webhook', category: 'core', icon: 'reply', inputs: 1, outputs: 0,
    properties: [{ name: 'body', displayName: 'Response Body', type: 'json' }],
  };
  async execute({ input, node }: NodeExecutionContext): Promise<NodeExecutionResult> { return { json: node.parameters.body ?? input }; }
}

class JsonParserNode extends BaseNode {
  readonly type = 'data.jsonParser';
  readonly metadata: NodeMetadata = { type:this.type, version:1, displayName:'JSON Parser', category:'data', icon:'braces', inputs:1, outputs:1, properties:[{name:'value',displayName:'JSON text',type:'string',required:true}] };
  async execute({ node }: NodeExecutionContext): Promise<NodeExecutionResult> {
    try { return { json: JSON.parse(String(node.parameters.value)) }; }
    catch { throw new M2MError('VALIDATION_ERROR', 'Value is not valid JSON'); }
  }
}

class TextParserNode extends BaseNode {
  readonly type = 'data.textParser';
  readonly metadata: NodeMetadata = {
    type: this.type, version: 1, displayName: 'Text Parser', category: 'data', icon: 'text', inputs: 1, outputs: 1,
    properties: [
      { name: 'value', displayName: 'Text', type: 'string', required: true },
      { name: 'mode', displayName: 'Mode', type: 'select', default: 'split', options: [
        { label: 'Split', value: 'split' }, { label: 'Regular expression', value: 'regex' }, { label: 'Trim', value: 'trim' },
      ] },
      { name: 'pattern', displayName: 'Separator / pattern', type: 'string', default: ',' },
    ],
  };
  async execute({ node }: NodeExecutionContext): Promise<NodeExecutionResult> {
    const value = String(node.parameters.value ?? '');
    const pattern = String(node.parameters.pattern ?? ',');
    const mode = String(node.parameters.mode ?? 'split');
    if (mode === 'trim') return { json: value.trim() };
    if (mode === 'split') return { json: value.split(pattern) };
    try {
      const match = new RegExp(pattern).exec(value);
      return { json: match ? { match: match[0], groups: match.slice(1), index: match.index } : null };
    } catch { throw new M2MError('VALIDATION_ERROR', 'Text Parser regular expression is invalid'); }
  }
}

class FilterNode extends BaseNode {
  readonly type = 'data.filter';
  readonly metadata: NodeMetadata = {
    type: this.type, version: 1, displayName: 'Filter', category: 'data', icon: 'filter', inputs: 1, outputs: 1,
    properties: [
      { name: 'field', displayName: 'Field path', type: 'string', default: '' },
      { name: 'operator', displayName: 'Operator', type: 'select', default: 'equals', options: [
        { label: 'Equals', value: 'equals' }, { label: 'Not equals', value: 'notEquals' }, { label: 'Contains', value: 'contains' },
        { label: 'Greater than', value: 'greaterThan' }, { label: 'Less than', value: 'lessThan' }, { label: 'Exists', value: 'exists' },
      ] },
      { name: 'value', displayName: 'Compare value', type: 'string' },
    ],
  };
  async execute({ input, node }: NodeExecutionContext): Promise<NodeExecutionResult> {
    if (!Array.isArray(input)) throw new M2MError('VALIDATION_ERROR', 'Filter input must be an array');
    const field = String(node.parameters.field ?? '');
    const items = input.filter((item) => compare(objectAtPath(item, field), String(node.parameters.operator ?? 'equals'), node.parameters.value));
    return { json: items, metadata: { inputCount: input.length, outputCount: items.length } };
  }
}

class MapFieldsNode extends BaseNode {
  readonly type = 'data.mapFields';
  readonly metadata: NodeMetadata = {
    type: this.type, version: 1, displayName: 'Map Fields', category: 'data', icon: 'map', inputs: 1, outputs: 1,
    properties: [
      { name: 'mapping', displayName: 'Field mapping', type: 'json', required: true, default: {}, description: 'Object whose keys are output fields and values are input dot paths.' },
      { name: 'keepUnmapped', displayName: 'Keep unmapped fields', type: 'boolean', default: false },
    ],
  };
  async execute({ input, node }: NodeExecutionContext): Promise<NodeExecutionResult> {
    const mapping = node.parameters.mapping;
    if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) throw new M2MError('VALIDATION_ERROR', 'Field mapping must be an object');
    const mapOne = (item: unknown): Record<string, unknown> => {
      const original = item && typeof item === 'object' && !Array.isArray(item) ? item as Record<string, unknown> : {};
      const mapped = Object.fromEntries(Object.entries(mapping as Record<string, unknown>).map(([output, path]) => [output, objectAtPath(item, String(path))]));
      return node.parameters.keepUnmapped ? { ...original, ...mapped } : mapped;
    };
    return { json: Array.isArray(input) ? input.map(mapOne) : mapOne(input) };
  }
}

export function registerBaseNodes(registry: NodeRegistry): void {
  [
    new ManualTriggerNode(), new WebhookTriggerNode(), new ScheduleTriggerNode(), new SetDataNode(), new TransformNode(),
    new IfNode(), new SwitchNode(), new MergeNode(), new DelayNode(), new ForEachNode(), new HttpRequestNode(),
    new RespondWebhookNode(), new JsonParserNode(), new TextParserNode(), new FilterNode(), new MapFieldsNode(),
  ]
    .forEach((node) => registry.register(node));
}
