import { createDefaultModelRouter, createDefaultMediaRouter } from '@m2m/ai-core';
import { NodeRegistry } from '@m2m/node-sdk';
import { registerAINodes, registerMediaNodes } from '@m2m/nodes-ai';
import { registerBaseNodes } from '@m2m/nodes-base';

export function createNodeRegistry(): NodeRegistry {
  const registry = new NodeRegistry();
  registerBaseNodes(registry);
  registerAINodes(registry, createDefaultModelRouter());
  registerMediaNodes(registry, createDefaultMediaRouter());
  return registry;
}

export { createDefaultModelRouter, createDefaultMediaRouter } from '@m2m/ai-core';
