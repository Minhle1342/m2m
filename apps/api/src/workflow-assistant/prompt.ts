import type { AssistantRequest } from './types.js';

export const WORKFLOW_AGENT_SYSTEM_INSTRUCTION = `You are the workflow engineering agent for m2m Automation Studio.
You modify an executable visual workflow by returning a small, structured change plan.

Operating rules:
1. Use only node types, parameters, option values, handles, providers, and models from the runtime catalog supplied by the application.
2. Prefer minimal update operations. Never replace the whole workflow unless the canvas is empty or the user explicitly asks to rebuild it.
3. Never delete, rename, move, disconnect, disable, or reconfigure an unrelated node.
4. Never invent credential IDs or secrets. Credential selection is handled deterministically by the application. Preserve an existing binding when its provider is unchanged.
5. Preserve retry, timeout, disabled state, credentials, positions, settings, and unknown valid parameters unless the user explicitly asks to change them.
6. Keep provider and model compatible. Prefer an available cloud provider over an unavailable local provider unless the user explicitly requests local execution.
7. Expressions must match upstream output contracts. Media nodes output $json.media; text-generating nodes output $json.text. Use {{ $json.media }} for image/video handoff and {{ $json.text }} for text handoff.
8. Every non-trigger node must be reachable from exactly one trigger. Do not create dangling edges or invalid handles.
9. When fixing a failure, use the supplied execution error as evidence and change only the demonstrated cause.
10. Put anything that cannot be completed automatically (credential choice, account permission, billing, API URL, business-specific value) in manualSteps. Do not pretend the workflow is ready.
11. For a selected node request, modify that node and the minimum required adjacent edges unless the user clearly asks for a wider change.
12. Return JSON matching the response schema. Do not include markdown or commentary outside JSON.`;

function sanitizeWorkflow(req: AssistantRequest) {
  return {
    ...req.workflow,
    nodes: req.workflow.nodes.map((node) => ({
      ...node,
      credentials: node.credentials
        ? Object.fromEntries(Object.keys(node.credentials).map((alias) => [alias, '<bound>']))
        : undefined
    }))
  };
}

function sanitizeNode(node: AssistantRequest['workflow']['nodes'][number] | undefined) {
  if (!node) return undefined;
  return {
    ...node,
    credentials: node.credentials
      ? Object.fromEntries(Object.keys(node.credentials).map((alias) => [alias, '<bound>']))
      : undefined
  };
}

function compactCatalog(req: AssistantRequest) {
  return (req.nodeTypes ?? []).map((nodeType) => ({
    type: nodeType.type,
    name: nodeType.displayName,
    category: nodeType.category,
    inputs: nodeType.inputs,
    outputs: nodeType.outputs,
    outputNames: nodeType.outputNames,
    properties: (nodeType.properties ?? []).map((property) => ({
      name: property.name,
      type: property.type,
      required: Boolean(property.required),
      default: property.default,
      options: property.options?.map((option) => option.value),
      description: property.description
    }))
  }));
}

export function buildWorkflowAgentPrompt(req: AssistantRequest): string {
  const selectedNode = req.selectedNodeId
    ? req.workflow.nodes.find((node) => node.id === req.selectedNodeId)
    : undefined;
  const credentialInventory = (req.availableCredentials ?? []).map((credential) => ({
    name: credential.name,
    type: credential.type
  }));

  return [
    '=== USER REQUEST ===',
    req.prompt,
    '',
    '=== EDITING SCOPE ===',
    JSON.stringify({ selectedNodeId: req.selectedNodeId, selectedNode: sanitizeNode(selectedNode) }, null, 2),
    '',
    '=== CURRENT WORKFLOW ===',
    JSON.stringify(sanitizeWorkflow(req), null, 2),
    '',
    '=== RUNTIME NODE CATALOG (SOURCE OF TRUTH) ===',
    JSON.stringify(compactCatalog(req), null, 2),
    '',
    '=== AVAILABLE CREDENTIAL TYPES (NO SECRETS) ===',
    JSON.stringify(credentialInventory, null, 2),
    '',
    '=== PROVIDER STATUS ===',
    JSON.stringify(req.providerStatuses ?? [], null, 2),
    '',
    '=== MOST RECENT EXECUTION ===',
    JSON.stringify(req.recentExecution ?? null, null, 2),
    '',
    'Return the smallest safe operation list that fulfills the request.'
  ].join('\n');
}
