import type { AssistantRequest } from './types.js';

/**
 * Stable, cache-friendly kernel. Task-specific policies belong in the request
 * after the runtime catalog so unrelated workflows do not pay for them.
 */
export const WORKFLOW_AGENT_SYSTEM_INSTRUCTION = `You are the workflow engineering agent for m2m Automation Studio. Convert a user's intent into the smallest safe operation plan for a production visual Directed Acyclic Graph (DAG). The application supplies a response schema and a runtime node catalog.

PLANNING CONTRACT
1. Classify the goal, inspect the current graph, and decide whether to edit or build. Preserve all unrelated nodes and prefer targeted operations. Replace the workflow only when the request explicitly requires a rebuild or the canvas is effectively empty.
2. Treat the runtime catalog as the sole source of valid node types, properties, option values, inputs, outputs, handles, providers, and models. Never rely on remembered product capabilities and never invent an unavailable capability.
3. Select the minimum nodes that satisfy the goal. Wire a directed, acyclic topology whose downstream requirements are satisfied by upstream outputs. Use exact catalog property names and expression references to pass data.
4. Return only data matching the supplied JSON schema. Make each operation internally complete, use stable unique IDs for additions, and keep explanation, assumptions, and manualSteps concise.

NON-NEGOTIABLE SAFETY
- Never invent credential IDs, secrets, provider readiness, execution results, or successful setup. Credential binding is deterministic application work.
- Never modify, delete, rename, move, disable, or disconnect an unrelated node.
- A runnable workflow has exactly one trigger; every other node is reachable from it; every edge references existing nodes and valid handles; duplicate IDs, self-loops, cycles, and dangling branches are invalid.
- For a failure repair, use only the supplied execution evidence and change only the demonstrated cause. If evidence is insufficient, state an assumption instead of fabricating one.
- Put unsupported external setup, missing credentials, unavailable provider capabilities, and required human review in manualSteps. Do not claim ready-to-run or exact guarantees when a limitation remains.

APPLICATION-ENFORCED INVARIANTS
The application validates operation shape and graph readiness, binds credentials, aligns provider/model pairs, fills catalog defaults, retry and timeout policies, repairs standard branch handles, injects common data expressions, and computes canvas layout. Omit position, retry, timeout, credentials, and default provider/model values unless the user explicitly asks to change them. Focus model output on semantic topology and task-specific parameters.

FINAL CHECK
Before returning, verify that the plan fulfills the exact request with minimal mutations, catalog-valid identifiers, a connected acyclic graph, honest readiness, and no unrelated changes.`;

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

const MULTI_SHOT_CONTINUITY_INTENT =
  /(?:phim(?:\s+ngắn)?|bộ\s+phim|nhiều\s+(?:cảnh|phân\s+cảnh|khung\s+hình)|xuyên\s+cảnh|giữ\s+(?:nguyên\s+)?(?:khuôn\s+mặt|nhân\s+vật)|không\s+quên\s+(?:mặt|khuôn\s+mặt)|film|short\s+(?:film|movie)|movie|storyboard|multi[-\s]?(?:scene|shot)|cross[-\s]scene|same\s+(?:face|character)|character\s+consisten|identity\s+consisten|recurring\s+character)/i;

const MULTI_SCENE_VIDEO_INTENT =
  /(?:phim(?:\s+ngắn)?|bộ\s+phim|nhiều\s+(?:cảnh|phân\s+cảnh)|xuyên\s+cảnh|film|short\s+(?:film|movie)|movie|storyboard|multi[-\s]?(?:scene|shot)|cross[-\s]scene)/i;

const MULTI_ENTITY_MEDIA_INTENT =
  /(?:multi[-\s]?entity|multiple\s+(?:subjects|characters|objects)|composite\s+(?:image|scene)|tách\s+(?:nhân\s+vật|đối\s+tượng)|nhiều\s+(?:nhân\s+vật|đối\s+tượng).{0,40}(?:ảnh|hình)|hợp\s+nhất\s+(?:ảnh|khung\s+hình))/i;

const AGENT_TOOL_INTENT =
  /(?:react\s+agent|tool[-\s]?calling|autonomous\s+agent|ai\s+agent|tác\s+tử\s+ai|agent.{0,30}(?:tool|công\s+cụ)|gọi\s+công\s+cụ)/i;

const ROUTING_INTENT =
  /(?:classif|classifier|routing|route\s+by|branch|switch|if\/else|phân\s+loại|phân\s+nhánh|định\s+tuyến|rẽ\s+nhánh)/i;

const DATA_PIPELINE_INTENT =
  /(?:\betl\b|extract.{0,30}(?:map|transform|load)|webhook.{0,30}(?:json|map|filter|http)|trích\s+xuất|ánh\s+xạ|chuyển\s+đổi\s+dữ\s+liệu|lọc\s+dữ\s+liệu)/i;

const CONVERSATION_INTENT =
  /(?:conversation|chatbot|chat\s+memory|session\s+memory|persistent\s+memory|hội\s+thoại|trò\s+chuyện|ghi\s+nhớ\s+phiên)/i;

const CHARACTER_REFERENCE_PROPERTY_NAMES = new Set([
  'referenceImages',
  'characterReference',
  'characterReferences',
  'characterImages',
  'identityReference',
  'identityReferences'
]);

export function requiresCharacterContinuity(req: Pick<AssistantRequest, 'prompt' | 'workflow'>): boolean {
  const currentVideoNodes = req.workflow.nodes.filter((node) => node.type === 'm2m.media.imageToVideo');
  const hasStoryboard = req.workflow.nodes.some((node) => node.type === 'm2m.media.storyboardSplitter');
  return MULTI_SHOT_CONTINUITY_INTENT.test(req.prompt) || hasStoryboard || currentVideoNodes.length > 1;
}

export function requiresMultiSceneVideo(req: Pick<AssistantRequest, 'prompt' | 'workflow'>): boolean {
  return MULTI_SCENE_VIDEO_INTENT.test(req.prompt)
    || req.workflow.nodes.some((node) => node.type === 'm2m.media.storyboardSplitter')
    || req.workflow.nodes.filter((node) => node.type === 'm2m.media.imageToVideo').length > 1;
}

export function listCharacterReferenceNodeTypes(nodeTypes: AssistantRequest['nodeTypes']): string[] {
  return (nodeTypes ?? [])
    .filter((nodeType) => (nodeType.properties ?? []).some((property) => CHARACTER_REFERENCE_PROPERTY_NAMES.has(property.name)))
    .map((nodeType) => nodeType.type);
}

function buildCharacterContinuityDirective(req: AssistantRequest): string | undefined {
  if (!requiresCharacterContinuity(req)) return undefined;

  const referenceAwareNodes = listCharacterReferenceNodeTypes(req.nodeTypes);
  const capability = referenceAwareNodes.length > 0
    ? `AVAILABLE via: ${referenceAwareNodes.join(', ')}`
    : 'UNAVAILABLE in the current runtime catalog';

  return [
    'POLICY: CHARACTER CONTINUITY (REQUIRED)',
    `Dedicated character-reference input: ${capability}.`,
    'Create exactly one canonical Character Anchor before scene branches. Its IDENTITY LOCK fixes face, skin, eyes, nose, lips, hair, distinctive marks, body proportions, and canonical wardrobe; repeat that lock in every character-bearing image prompt.',
    'Every recurring-character scene must descend from the same anchor or approved previous frame. Reject independent text-to-image character roots, seed-only identity claims, and unmasked full-frame edits presented as identity-safe.',
    referenceAwareNodes.length > 0
      ? 'Bind the canonical asset through a supported reference property on every character-bearing scene branch.'
      : 'Reuse the canonical image as every Image-to-Video input; add manualSteps for reference-aware generation and cross-shot face review; never claim exact identity is guaranteed.',
    "Use explicit per-scene branches; 'core.forEach' bounds a collection but does not fan out downstream executions. Keep model family, aspect ratio, FPS, and style stable; preserve shot order before merge.",
    'Explain the anchor and inheritance path plus any remaining capability gap.'
  ].join('\n');
}

function hasNodeType(req: AssistantRequest, predicate: (type: string) => boolean): boolean {
  return req.workflow.nodes.some((node) => predicate(node.type));
}

/** Build only the policies relevant to this request and existing workflow. */
export function buildWorkflowAgentIntentPolicies(req: AssistantRequest): string[] {
  const policies: string[] = [];
  const text = req.prompt;

  if (requiresMultiSceneVideo(req)) {
    policies.push([
      'POLICY: MULTI-SCENE VIDEO',
      'Use explicit ordered scene branches: script/storyboard -> scene frame -> one Image-to-Video node per scene -> ordered Merge Video -> Save Media. Image prompts define appearance/composition; video prompts define motion, camera, timing, and preservation constraints.'
    ].join('\n'));
  }

  const continuity = buildCharacterContinuityDirective(req);
  if (continuity) policies.push(continuity);

  if (MULTI_ENTITY_MEDIA_INTENT.test(text)) {
    policies.push([
      'POLICY: MULTI-ENTITY COMPOSITION',
      'Decompose distinct characters, objects, and scenery into parallel generation branches, then compose them once. The final prompt must lock spatial scale, entity boundaries, physical contact, one light/shadow direction, and coherent camera optics.'
    ].join('\n'));
  }

  if (AGENT_TOOL_INTENT.test(text) || hasNodeType(req, (type) => type === 'ai.agent' || type === 'ai.tool')) {
    policies.push([
      'POLICY: TOOL-CALLING AGENT',
      'Connect catalog-supported tools and a chat model to the agent, constrain tool scope and step limits, then route the result to an explicit formatter or sink. Never invent a tool or its contract.'
    ].join('\n'));
  }

  if (ROUTING_INTENT.test(text) || hasNodeType(req, (type) => type === 'core.if' || type === 'core.switch')) {
    policies.push([
      'POLICY: CLASSIFICATION AND ROUTING',
      "Route classifier output through catalog-valid IF/Switch handles. IF uses true/false; Switch uses case1..case4/default. Merge branches before a shared terminal sink when required."
    ].join('\n'));
  }

  if (DATA_PIPELINE_INTENT.test(text)) {
    policies.push([
      'POLICY: DATA PIPELINE',
      'Use a trigger, parse/extract, map, filter/route, then an explicit destination. Preserve field names through expressions and handle external calls through catalog-supported HTTP nodes.'
    ].join('\n'));
  }

  if (CONVERSATION_INTENT.test(text) || hasNodeType(req, (type) => type === 'ai.simpleMemory')) {
    policies.push([
      'POLICY: STATEFUL CONVERSATION',
      'Read memory before the prompt/agent, append the new turn after generation, and end at an explicit response node. Use the same session-key expression for read and append.'
    ].join('\n'));
  }

  return policies;
}

export function buildWorkflowAgentPrompt(req: AssistantRequest): string {
  const credentialInventory = (req.availableCredentials ?? []).map((credential) => ({
    name: credential.name,
    type: credential.type
  }));
  const intentPolicies = buildWorkflowAgentIntentPolicies(req);

  return [
    '=== RUNTIME NODE CATALOG (SOURCE OF TRUTH) ===',
    JSON.stringify(compactCatalog(req)),
    '',
    ...(intentPolicies.length > 0 ? ['=== ACTIVE INTENT POLICIES ===', intentPolicies.join('\n\n'), ''] : []),
    '=== AVAILABLE CREDENTIAL TYPES (NO SECRETS) ===',
    JSON.stringify(credentialInventory),
    '',
    '=== PROVIDER STATUS ===',
    JSON.stringify(req.providerStatuses ?? []),
    '',
    '=== CURRENT WORKFLOW ===',
    JSON.stringify(sanitizeWorkflow(req)),
    '',
    '=== EDITING SCOPE ===',
    JSON.stringify({ selectedNodeId: req.selectedNodeId ?? null }),
    '',
    '=== MOST RECENT EXECUTION ===',
    JSON.stringify(req.recentExecution ?? null),
    '',
    '=== USER REQUEST ===',
    req.prompt,
    '',
    'Return the smallest safe operation list that fulfills the request.'
  ].join('\n');
}
