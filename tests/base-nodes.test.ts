import { describe, expect, it } from 'vitest';
import { NodeRegistry } from '../packages/node-sdk/src/index.js';
import { registerBaseNodes } from '../packages/nodes-base/src/index.js';

const registry = new NodeRegistry();
registerBaseNodes(registry);

async function run(type: string, input: unknown, parameters: Record<string, unknown>) {
  return registry.get(type).execute({
    executionId: 'execution', workflowId: 'workflow', input, nodeOutputs: {}, env: {}, credentials: {},
    node: { id: 'node', type, name: type, position: { x: 0, y: 0 }, parameters }, signal: new AbortController().signal,
  });
}

describe('base data and control nodes', () => {
  it('transforms, filters, and maps data declaratively', async () => {
    const transformed = await run('core.transform', { keep: true }, { template: { added: 2 }, mergeInput: true });
    expect(transformed.json).toEqual({ keep: true, added: 2 });
    const filtered = await run('data.filter', [{ score: 1 }, { score: 4 }], { field: 'score', operator: 'greaterThan', value: 2 });
    expect(filtered.json).toEqual([{ score: 4 }]);
    const mapped = await run('data.mapFields', [{ user: { name: 'Ada' }, ignored: true }], { mapping: { displayName: 'user.name' } });
    expect(mapped.json).toEqual([{ displayName: 'Ada' }]);
  });

  it('routes switch cases and parses text', async () => {
    const switched = await run('core.switch', { value: 2 }, { value: 'two', cases: [{ output: 'case2', operator: 'equals', value: 'two' }] });
    expect(switched.branch).toBe('case2');
    const parsed = await run('data.textParser', null, { value: 'alpha,beta', mode: 'split', pattern: ',' });
    expect(parsed.json).toEqual(['alpha', 'beta']);
  });

  it('bounds collections and merges object inputs', async () => {
    const loop = await run('core.forEach', { rows: [1, 2, 3] }, { path: 'rows', limit: 2 });
    expect(loop.json).toEqual([1, 2]);
    expect(loop.metadata).toMatchObject({ itemCount: 2, truncated: true });
    const merged = await run('core.merge', [{ a: 1 }, { b: 2 }], { mode: 'combine' });
    expect(merged.json).toEqual({ a: 1, b: 2 });
  });

  it('supports abort-aware delay validation', async () => {
    await expect(run('core.delay', {}, { durationMs: -1 })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(run('core.delay', { ok: true }, { durationMs: 1 })).resolves.toMatchObject({ json: { ok: true } });
  });
});
