# m2m — Max to Minus
## Kế hoạch xây dựng AI Workflow Automation Platform

> **Tên sản phẩm:** m2m — Max to Minus  
> **Loại sản phẩm:** Visual AI Workflow Automation Platform  
> **Mục tiêu:** Xây dựng nền tảng tự động hóa workflow dạng node-based tương tự nhóm sản phẩm như n8n, nhưng tập trung mạnh vào AI Agent, API/webhook, khả năng tự host và chi phí AI thấp.

---

## 1. Mục tiêu sản phẩm

m2m cho phép người dùng tạo workflow bằng cách kéo-thả các node trên canvas.

Một workflow có thể:

- Nhận dữ liệu từ Webhook.
- Chạy theo lịch.
- Gọi REST API.
- Biến đổi dữ liệu.
- Thực hiện điều kiện `IF / Switch`.
- Chạy tác vụ bất đồng bộ.
- Gọi mô hình AI.
- Tạo AI Agent có khả năng gọi tool.
- Chuyển dữ liệu giữa nhiều node.
- Retry khi node lỗi.
- Theo dõi execution theo thời gian thực.
- Xem input/output của từng node.
- Quản lý credential/API key tập trung.
- Chạy nhiều worker thông qua Redis queue.

Ví dụ:

```text
Webhook
   |
   v
Validate Input
   |
   v
AI Agent
   |
   +------> HTTP Tool ------> External API
   |
   v
Transform Result
   |
   v
Send Response
```

---

# 2. Nguyên tắc kiến trúc

## 2.1. Backend

Sử dụng:

- Node.js 20+.
- TypeScript.
- Express.js 5.
- TypeORM.
- SQLite cho MVP/development.
- Redis.
- Bull cho hàng đợi ở MVP.
- Thiết kế `QueueAdapter` để có thể nâng cấp sang BullMQ.
- LangChain JavaScript.
- Vercel AI SDK.
- WebSocket hoặc Server-Sent Events cho execution realtime.

## 2.2. Frontend

Sử dụng:

- Vue 3.
- TypeScript.
- Vite.
- Vue Router.
- Pinia.
- Vue Flow cho workflow canvas.
- Một UI component library tùy chọn.
- Monaco Editor cho JSON/code editor nếu cần.

## 2.3. AI

Ưu tiên provider theo thứ tự:

1. Ollama local.
2. Google Gemini API Free Tier.
3. Các model/provider tương thích OpenAI API do người dùng tự cung cấp key.
4. Provider trả phí chỉ là tùy chọn.

Không viết workflow engine phụ thuộc trực tiếp vào một AI provider.

Phải có lớp:

```text
AIProviderAdapter
```

để đổi model mà không sửa node AI.

---

# 3. Kiến trúc tổng thể

```text
                         ┌──────────────────────────┐
                         │       Vue 3 + Vite       │
                         │      Workflow Editor     │
                         └────────────┬─────────────┘
                                      │
                                 REST / SSE
                                      │
                         ┌────────────▼─────────────┐
                         │       Express API        │
                         │                          │
                         │ Auth                     │
                         │ Workflow API             │
                         │ Credential API           │
                         │ Execution API            │
                         │ Webhook API              │
                         │ AI API                   │
                         └───────┬─────────┬────────┘
                                 │         │
                     ┌───────────▼───┐ ┌──▼─────────────┐
                     │    TypeORM     │ │ Queue Service  │
                     │    SQLite      │ │ Bull + Redis   │
                     └───────────────┘ └──────┬─────────┘
                                               │
                                  ┌────────────▼──────────┐
                                  │    Worker Processes   │
                                  │                       │
                                  │ Workflow Executor     │
                                  │ Node Executor         │
                                  │ AI Agent Executor     │
                                  └───────────┬───────────┘
                                              │
                   ┌──────────────────────────┼─────────────────────────┐
                   │                          │                         │
                   ▼                          ▼                         ▼
             External APIs              AI Providers               Webhooks
                                        / Ollama
```

---

# 4. Monorepo đề xuất

```text
m2m/
├─ apps/
│  ├─ api/
│  │  ├─ src/
│  │  │  ├─ controllers/
│  │  │  ├─ routes/
│  │  │  ├─ middleware/
│  │  │  ├─ modules/
│  │  │  ├─ database/
│  │  │  └─ main.ts
│  │  └─ package.json
│  │
│  ├─ worker/
│  │  ├─ src/
│  │  │  ├─ executor/
│  │  │  ├─ processors/
│  │  │  └─ main.ts
│  │  └─ package.json
│  │
│  └─ web/
│     ├─ src/
│     │  ├─ components/
│     │  ├─ views/
│     │  ├─ stores/
│     │  ├─ router/
│     │  ├─ workflow/
│     │  └─ services/
│     └─ package.json
│
├─ packages/
│  ├─ workflow-core/
│  ├─ node-sdk/
│  ├─ nodes-base/
│  ├─ nodes-ai/
│  ├─ queue/
│  ├─ ai-core/
│  ├─ shared/
│  └─ config/
│
├─ docker/
├─ tests/
├─ docker-compose.yml
├─ pnpm-workspace.yaml
└─ package.json
```

Nên dùng `pnpm workspace`.

---

# 5. Các module backend

## 5.1. Auth Module

Chức năng:

- Đăng ký.
- Đăng nhập.
- Đăng xuất.
- Refresh token.
- Lấy thông tin người dùng hiện tại.
- Đổi mật khẩu.
- Role-based access.

Role MVP:

```text
OWNER
ADMIN
MEMBER
VIEWER
```

API:

```text
POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/refresh
POST /api/v1/auth/logout
GET  /api/v1/auth/me
```

---

## 5.2. Workspace Module

Một user có thể thuộc nhiều workspace.

Entity:

```text
Workspace
WorkspaceMember
```

Chức năng:

- Tạo workspace.
- Mời thành viên.
- Xóa thành viên.
- Phân quyền.
- Chuyển workspace.

---

# 6. Workflow Module

Entity chính:

```text
Workflow
WorkflowVersion
WorkflowTag
```

Workflow cần lưu:

```ts
interface WorkflowDefinition {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  settings: WorkflowSettings;
}
```

Node:

```ts
interface WorkflowNode {
  id: string;
  type: string;
  name: string;

  position: {
    x: number;
    y: number;
  };

  parameters: Record<string, unknown>;

  credentials?: Record<string, string>;

  disabled?: boolean;
}
```

Edge:

```ts
interface WorkflowEdge {
  id: string;
  source: string;
  target: string;

  sourceHandle?: string;
  targetHandle?: string;
}
```

---

# 7. Workflow Editor

Dùng:

```text
Vue 3
+
Vue Flow
+
Pinia
```

Editor phải hỗ trợ:

- Drag & drop node.
- Connect node.
- Delete node.
- Duplicate node.
- Zoom.
- Pan.
- Minimap.
- Undo.
- Redo.
- Multi-select.
- Copy/paste.
- Auto save.
- Manual save.
- Workflow validation.
- Node configuration panel.
- Execution overlay.
- Hiển thị node đang chạy.
- Hiển thị node thành công.
- Hiển thị node lỗi.

Bố cục:

```text
┌──────────────────────────────────────────────────────────┐
│ Logo | Workflow Name | Save | Run | Activate             │
├────────────┬─────────────────────────────┬───────────────┤
│ Node List  │                             │ Node Settings │
│            │       Workflow Canvas       │               │
│ Trigger    │                             │ Parameters    │
│ HTTP       │                             │ Credentials   │
│ AI         │                             │ Input/Output  │
│ Logic      │                             │               │
├────────────┴─────────────────────────────┴───────────────┤
│ Execution Log                                            │
└──────────────────────────────────────────────────────────┘
```

---

# 8. Node SDK

Không hard-code toàn bộ node trong workflow engine.

Tạo Node SDK.

```ts
export interface M2MNode {
  type: string;
  version: number;

  metadata: NodeMetadata;

  execute(
    context: NodeExecutionContext,
  ): Promise<NodeExecutionResult>;
}
```

Metadata:

```ts
interface NodeMetadata {
  displayName: string;
  description?: string;
  category: string;
  icon?: string;

  inputs: number;
  outputs: number;

  properties: NodeProperty[];
}
```

Workflow Engine chỉ cần biết:

```text
node.type
       |
       v
NodeRegistry
       |
       v
Node implementation
       |
       v
execute()
```

---

# 9. Node Registry

Tạo registry:

```ts
class NodeRegistry {
  register(node: M2MNode): void;
  get(type: string): M2MNode;
  list(): NodeMetadata[];
}
```

API:

```text
GET /api/v1/node-types
GET /api/v1/node-types/:type
```

Frontend tải danh sách node từ backend.

Không hard-code node palette trực tiếp trong Vue.

---

# 10. Các node MVP

## Trigger

- Manual Trigger.
- Webhook Trigger.
- Schedule Trigger.

## Core

- HTTP Request.
- Set Data.
- Transform.
- IF.
- Switch.
- Merge.
- Delay.
- Loop / For Each.
- Respond to Webhook.

## AI

- AI Prompt.
- Chat Model.
- AI Agent.
- AI Tool.
- Structured Output.
- Text Classification.
- Information Extraction.
- Embedding.
- Simple Memory.

## Data

- JSON Parser.
- Text Parser.
- Filter.
- Map Fields.

---

# 11. Expression Engine

Người dùng cần tham chiếu dữ liệu node trước.

Ví dụ:

```text
{{$json.email}}

{{$node["Webhook"].json.body.name}}

{{$env.API_URL}}

{{$workflow.id}}

{{$execution.id}}
```

Tạo module:

```text
packages/workflow-core/src/expression/
```

Expression engine phải:

- Read-only.
- Không cho truy cập trực tiếp `process`.
- Không cho arbitrary filesystem access.
- Không cho arbitrary shell command.
- Có timeout.
- Có validation.
- Có test riêng.

---

# 12. Workflow Execution Engine

Đây là thành phần quan trọng nhất.

Các bước:

```text
Load Workflow
     |
     v
Validate Graph
     |
     v
Resolve Trigger
     |
     v
Create Execution Record
     |
     v
Find Start Node
     |
     v
Execute Node
     |
     v
Save Node Output
     |
     v
Resolve Next Edge
     |
     v
Queue Next Node
     |
     v
Complete / Failed
```

Execution engine cần quản lý state:

```ts
interface ExecutionState {
  executionId: string;
  workflowId: string;

  status:
    | 'queued'
    | 'running'
    | 'waiting'
    | 'success'
    | 'failed'
    | 'cancelled';

  nodeResults: Record<string, NodeExecutionResult>;
}
```

---

# 13. Execution Strategy

MVP:

```text
1 workflow execution
        |
        v
1 Bull job
        |
        v
Worker thực thi workflow
```

Giai đoạn scaling:

```text
Workflow Execution
        |
        v
Execution Coordinator
        |
        +------ Node Job A
        |
        +------ Node Job B
        |
        +------ Node Job C
```

Không nên phân tán từng node thành job Redis ngay từ phiên bản đầu nếu chưa cần.

MVP nên đơn giản trước.

---

# 14. Queue Architecture

MVP dùng:

```text
Bull
+
Redis
```

Tạo abstraction:

```ts
interface QueueAdapter {
  add(queue: string, payload: unknown): Promise<string>;

  retry(jobId: string): Promise<void>;

  remove(jobId: string): Promise<void>;

  pause(queue: string): Promise<void>;

  resume(queue: string): Promise<void>;
}
```

Implementation ban đầu:

```text
BullQueueAdapter
```

Sau này:

```text
BullMQQueueAdapter
```

Queue đề xuất:

```text
workflow-execution
webhook-execution
scheduled-execution
ai-execution
maintenance
```

---

# 15. Worker

Worker không phụ thuộc Express.

Ví dụ:

```text
apps/worker
```

Nhiệm vụ:

- Nhận Bull job.
- Load workflow.
- Load credentials cần thiết.
- Chạy workflow.
- Ghi execution.
- Publish execution events.
- Retry nếu lỗi.
- Timeout workflow.
- Update status.

Có thể chạy:

```text
1 API process
1 Redis
N worker processes
```

Ví dụ:

```text
API
 |
Redis
 |
+---- Worker 1
+---- Worker 2
+---- Worker 3
```

---

# 16. Retry Policy

Node cần hỗ trợ:

```ts
retry: {
  enabled: true,
  maxAttempts: 3,
  delayMs: 2000,
  backoff: 'exponential'
}
```

Không retry mặc định cho tất cả lỗi.

Phân loại:

```text
Retryable
- Timeout
- HTTP 429
- HTTP 502
- HTTP 503
- Provider temporarily unavailable

Non-retryable
- Invalid credential
- Invalid input
- Validation error
- Permission denied
```

---

# 17. Timeout

Cần timeout ở ba tầng:

```text
Node Timeout
Workflow Timeout
HTTP Request Timeout
```

Ví dụ:

```text
Node:       60 seconds
Workflow:   configurable
HTTP:       configurable
```

Không để request hoặc workflow treo vô hạn.

---

# 18. Idempotency

Webhook có thể bị gửi nhiều lần.

Hỗ trợ:

```text
Idempotency-Key
```

Lưu:

```text
key
workflowId
executionId
createdAt
expiresAt
```

Nếu cùng key được gửi lại trong thời gian hiệu lực:

```text
Không tạo execution mới.
```

---

# 19. Webhook Engine

Route:

```text
POST /webhook/:workflowId/:path
GET  /webhook/:workflowId/:path
```

Khi workflow active:

```text
Request
   |
   v
Webhook Controller
   |
   v
Find Workflow Trigger
   |
   v
Create Execution
   |
   v
Push Bull Job
   |
   v
Worker
```

Cần phân biệt:

```text
/webhook-test/*
/webhook/*
```

Test mode dành cho editor.

Production webhook chỉ chạy workflow active.

---

# 20. Schedule Trigger

Hỗ trợ:

- Every N minutes.
- Hourly.
- Daily.
- Weekly.
- Cron expression.

Không dùng `setInterval` đơn giản cho hệ thống production.

Schedule cần persistent.

Scheduler tạo execution job vào Redis.

---

# 21. Execution Database

Entity:

```text
Execution
NodeExecution
```

Execution:

```text
id
workflowId
workflowVersionId
status
mode
startedAt
finishedAt
error
createdBy
```

NodeExecution:

```text
id
executionId
nodeId
status
input
output
error
startedAt
finishedAt
durationMs
attempt
```

---

# 22. Realtime Execution

Frontend cần thấy workflow đang chạy.

Dùng một trong:

```text
SSE
hoặc
WebSocket
```

MVP ưu tiên SSE vì luồng chính là server -> browser.

Event:

```text
execution.started
node.started
node.completed
node.failed
execution.completed
execution.failed
```

Payload:

```json
{
  "executionId": "exec_123",
  "nodeId": "http_1",
  "event": "node.completed",
  "timestamp": "..."
}
```

---

# 23. AI Architecture

Không để logic AI trực tiếp trong controller.

Tạo:

```text
packages/ai-core/
```

Cấu trúc:

```text
ai-core/
├─ providers/
├─ agents/
├─ tools/
├─ memory/
├─ prompts/
├─ output-parsers/
└─ model-router/
```

---

# 24. Phân chia LangChain và Vercel AI SDK

Không dùng hai framework để làm cùng một nhiệm vụ.

## LangChain

Dùng cho:

- Agent orchestration.
- Tool calling.
- Agent loop.
- Prompt templates.
- Memory.
- Retriever/RAG.
- Structured tool definitions.
- Multi-step AI workflow.

## Vercel AI SDK

Dùng cho:

- Provider abstraction.
- Streaming model output.
- Chat UI integration.
- Structured generation.
- Tool-call streaming.
- Model usage metadata.

Nguyên tắc:

```text
Workflow Engine
      |
      v
AI Node
      |
      v
AI Service
      |
      +---- LangChain Agent
      |
      +---- Vercel AI SDK Provider/Streaming
```

---

# 25. AI Provider Adapter

```ts
interface AIProviderAdapter {
  generateText(input: GenerateTextInput): Promise<GenerateTextResult>;

  streamText(
    input: GenerateTextInput,
  ): AsyncIterable<AIStreamEvent>;

  generateStructured<T>(
    input: StructuredInput<T>,
  ): Promise<T>;
}
```

Provider:

```text
OllamaProvider
GeminiProvider
OpenAICompatibleProvider
```

---

# 26. AI Provider Priority

## Tier 0 — Local

Ollama.

Ưu điểm:

- Chạy local.
- Không tốn phí API cho inference local.
- Dữ liệu không cần gửi sang provider cloud.
- Phù hợp development.

## Tier 1 — Free API

Google Gemini API Free Tier.

Lưu ý:

- Free Tier và rate limit có thể thay đổi.
- Không hard-code quota vào source code.
- Hiển thị quota/provider error rõ ràng.

## Tier 2 — BYOK

Cho người dùng tự nhập API key.

Ví dụ:

```text
OpenAI-compatible provider
Custom Base URL
Custom Model ID
```

---

# 27. Model Router

Cho phép chọn:

```text
provider
model
temperature
maxTokens
timeout
```

Ví dụ:

```ts
{
  provider: "gemini",
  model: "configured-model-id",
  temperature: 0.2
}
```

Không hard-code tên model vào workflow engine.

Danh sách model nên được lấy từ provider hoặc cấu hình.

---

# 28. AI Agent Node

AI Agent Node gồm:

```text
Model
System Prompt
User Prompt
Tools
Memory
Max Steps
Output Schema
```

Ví dụ:

```text
Webhook
   |
   v
AI Agent
   |
   +---- HTTP Request Tool
   |
   +---- Database Tool
   |
   v
Structured Output
```

---

# 29. Tool Calling

Tool interface:

```ts
interface AgentTool {
  name: string;
  description: string;
  inputSchema: unknown;

  execute(input: unknown): Promise<unknown>;
}
```

Tool ban đầu:

- HTTP Request Tool.
- Workflow Tool.
- Date/Time Tool.
- Calculator Tool.
- Internal Data Lookup Tool.

Credential phải được resolve ở server.

Không gửi secret xuống frontend.

---

# 30. Human-in-the-loop

Phase sau MVP.

Node:

```text
Wait For Approval
```

Luồng:

```text
AI Agent
   |
   v
Approval Node
   |
   +---- Approve ----> Continue
   |
   +---- Reject -----> Reject Branch
```

Execution chuyển sang:

```text
WAITING
```

Worker không giữ process sống trong thời gian chờ.

State lưu DB.

Khi người dùng approve:

```text
Resume execution.
```

---

# 31. Credential Management

Entity:

```text
Credential
CredentialType
```

Không lưu API key plaintext.

Cần:

```text
MASTER_ENCRYPTION_KEY
```

Credential data được mã hóa trước khi lưu DB.

Đề xuất:

```text
AES-256-GCM
```

Frontend chỉ nhận:

```json
{
  "id": "cred_123",
  "name": "Gemini Account",
  "type": "geminiApi",
  "configured": true
}
```

Không trả API key đã giải mã.

---

# 32. Credential Types

MVP:

```text
Generic API Key
Bearer Token
Basic Auth
Gemini API
OpenAI-compatible API
```

Sau này:

```text
OAuth2
Google
GitHub
Slack
Discord
Microsoft
```

---

# 33. Database Schema

Các bảng chính:

```text
users
workspaces
workspace_members

workflows
workflow_versions
workflow_tags

credentials
credential_types

executions
node_executions

webhook_endpoints
schedules

audit_logs
```

Quan hệ:

```text
User
 |
 +---- WorkspaceMember ---- Workspace
                              |
                              +---- Workflow
                              |
                              +---- Credential
                              |
                              +---- Execution
```

---

# 34. SQLite và Production Database

MVP:

```text
SQLite
```

Ưu điểm:

- Setup đơn giản.
- Không cần database server.
- Phù hợp local development.
- Phù hợp demo.

Nhưng abstraction phải cho phép chuyển sang:

```text
PostgreSQL
```

Không dùng SQLite-specific SQL trực tiếp trong service nếu TypeORM có thể xử lý.

Production migration phải dùng TypeORM migration.

Không bật schema auto-sync trên production.

---

# 35. API Design

Prefix:

```text
/api/v1
```

Workflow:

```text
GET    /api/v1/workflows
POST   /api/v1/workflows
GET    /api/v1/workflows/:id
PATCH  /api/v1/workflows/:id
DELETE /api/v1/workflows/:id

POST   /api/v1/workflows/:id/run
POST   /api/v1/workflows/:id/activate
POST   /api/v1/workflows/:id/deactivate

GET    /api/v1/workflows/:id/versions
POST   /api/v1/workflows/:id/versions/:versionId/restore
```

Execution:

```text
GET    /api/v1/executions
GET    /api/v1/executions/:id
POST   /api/v1/executions/:id/retry
POST   /api/v1/executions/:id/cancel
DELETE /api/v1/executions/:id
```

Credentials:

```text
GET    /api/v1/credentials
POST   /api/v1/credentials
PATCH  /api/v1/credentials/:id
DELETE /api/v1/credentials/:id
POST   /api/v1/credentials/:id/test
```

---

# 36. Workflow Versioning

Mỗi lần workflow được activate nên tạo snapshot.

```text
Workflow
    |
    +---- Version 1
    +---- Version 2
    +---- Version 3
```

Execution luôn tham chiếu:

```text
workflowVersionId
```

Nhờ vậy workflow sửa sau này không làm sai lịch sử execution cũ.

---

# 37. Auto Save

Frontend:

```text
User changes workflow
      |
      v
Debounce
      |
      v
PATCH workflow
```

Ví dụ debounce:

```text
500–1000 ms
```

Có trạng thái:

```text
Saved
Saving...
Unsaved
Save failed
```

---

# 38. Validation Engine

Trước khi activate:

Kiểm tra:

- Có trigger hay không.
- Có node bị thiếu credential không.
- Có edge trỏ đến node không tồn tại không.
- Có node type không tồn tại không.
- Có parameter bắt buộc bị thiếu không.
- Có expression lỗi không.
- Có workflow cycle không được hỗ trợ không.

Response:

```json
{
  "valid": false,
  "errors": [
    {
      "nodeId": "http_1",
      "field": "url",
      "message": "URL is required"
    }
  ]
}
```

---

# 39. Error Handling

Chuẩn hóa error:

```ts
class M2MError extends Error {
  code: string;
  retryable: boolean;
  details?: unknown;
}
```

Nhóm error:

```text
VALIDATION_ERROR
AUTH_ERROR
CREDENTIAL_ERROR
HTTP_ERROR
AI_PROVIDER_ERROR
RATE_LIMIT_ERROR
TIMEOUT_ERROR
NODE_EXECUTION_ERROR
WORKFLOW_EXECUTION_ERROR
```

---

# 40. Logging

Log phải có:

```text
requestId
executionId
workflowId
nodeId
jobId
userId
workspaceId
```

Không log:

- Password.
- API key.
- Authorization header.
- Credential plaintext.

---

# 41. Audit Log

Ghi lại:

```text
workflow.created
workflow.updated
workflow.deleted
workflow.activated
credential.created
credential.updated
credential.deleted
member.invited
member.removed
```

---

# 42. Security

Backend cần:

- Helmet.
- CORS whitelist.
- Rate limit.
- Request size limit.
- Input validation.
- Central error handler.
- Credential encryption.
- Authorization middleware.
- Workspace isolation.
- Secure cookies hoặc token handling phù hợp.
- CSRF protection nếu dùng cookie-based authentication.
- Webhook secret/token tùy chọn.
- Không expose stack trace trên production.
- Không cho user workflow truy cập trực tiếp environment variable của server.
- Không cho arbitrary shell execution trong MVP.
- Hạn chế SSRF ở HTTP Request node.
- Chặn truy cập metadata/internal network theo policy production.

---

# 43. Workflow Isolation

Mỗi execution phải biết:

```text
workspaceId
workflowId
executionId
```

Mọi truy vấn:

```text
WHERE workspaceId = currentWorkspaceId
```

Không chỉ query bằng `id`.

---

# 44. HTTP Request Node Security

Cần:

- Timeout.
- Max response size.
- Redirect limit.
- DNS/IP validation.
- Credential masking.
- Header sanitization.
- URL validation.

Production nên có policy chống SSRF.

---

# 45. AI Safety / Cost Guard

Mỗi workflow AI hỗ trợ:

```text
maxTokens
maxAgentSteps
timeout
maxCallsPerExecution
```

Workspace có thể cấu hình:

```text
dailyExecutionLimit
dailyAICallLimit
```

Mục tiêu:

- Tránh agent loop vô hạn.
- Tránh workflow runaway.
- Kiểm soát quota API.

---

# 46. Frontend Pages

## Public

```text
/login
/register
```

## App

```text
/workflows
/workflows/:id
/executions
/executions/:id
/credentials
/templates
/settings
/settings/members
```

---

# 47. Dashboard

Hiển thị:

- Total workflows.
- Active workflows.
- Executions today.
- Successful executions.
- Failed executions.
- Average duration.
- AI calls.
- Recent executions.

---

# 48. Workflow List

Card/Table:

```text
Workflow Name
Status
Last Updated
Last Execution
Success Rate
Owner
```

Action:

```text
Open
Run
Activate
Deactivate
Duplicate
Delete
```

---

# 49. Execution Detail

Hiển thị:

```text
Workflow
Status
Started
Finished
Duration
Trigger
```

Canvas:

- Node success.
- Node failed.
- Node skipped.
- Node waiting.

Panel node:

```text
Input
Output
Error
Metadata
Duration
Attempt
```

---

# 50. Credentials UI

Trang credentials:

```text
Credential Name
Type
Created
Updated
Used By
```

Form không bao giờ hiển thị secret cũ.

Thay vào đó:

```text
API Key: ***************
```

Muốn đổi key:

```text
Replace credential
```

---

# 51. Templates

Phase sau MVP.

Template:

```text
Webhook -> AI -> Response
Schedule -> HTTP -> AI Summary
Webhook -> Transform -> HTTP
AI Agent -> HTTP Tool -> JSON Output
```

Entity:

```text
WorkflowTemplate
```

---

# 52. Import / Export

Export:

```text
workflow.json
```

Không export credential secret.

Ví dụ:

```json
{
  "name": "AI Webhook",
  "nodes": [],
  "edges": [],
  "requiredCredentials": [
    {
      "type": "geminiApi",
      "name": "Gemini Account"
    }
  ]
}
```

---

# 53. Testing Strategy

## Unit Test

Test:

- Expression engine.
- Graph validation.
- Node registry.
- Retry policy.
- Credential encryption.
- AI provider adapter.
- Workflow executor.

## Integration Test

Test:

```text
API + SQLite
API + Redis
Worker + Redis
Webhook + Worker
Schedule + Worker
```

## End-to-End

Flow:

```text
Create workflow
      |
Add Webhook
      |
Add Set node
      |
Activate
      |
Call webhook
      |
Execution success
      |
Inspect output
```

---

# 54. Docker Development

`docker-compose.yml` tối thiểu:

```text
api
worker
redis
```

SQLite sử dụng volume.

Ví dụ kiến trúc:

```text
docker-compose
├─ api
├─ worker
└─ redis
```

Frontend có thể chạy bằng Vite dev server ngoài Docker lúc development.

---

# 55. Environment Variables

```text
NODE_ENV=

PORT=

DATABASE_TYPE=sqlite
DATABASE_PATH=

REDIS_URL=

JWT_SECRET=
JWT_REFRESH_SECRET=

MASTER_ENCRYPTION_KEY=

APP_URL=
WEBHOOK_URL=

OLLAMA_BASE_URL=
GEMINI_API_KEY=
```

Không commit `.env`.

Commit:

```text
.env.example
```

---

# 56. Observability

Metric cần theo dõi:

```text
workflow_execution_total
workflow_execution_success_total
workflow_execution_failed_total

workflow_execution_duration

node_execution_duration

queue_waiting_jobs
queue_active_jobs
queue_failed_jobs

ai_request_total
ai_request_duration
ai_token_input
ai_token_output
```

---

# 57. Health Check

```text
GET /health
GET /health/ready
GET /health/live
```

Ready check:

- Database.
- Redis.
- Queue.

Không cần kiểm tra AI provider trong global readiness.

---

# 58. Roadmap triển khai

## Phase 0 — Foundation

Mục tiêu:

- Tạo monorepo.
- TypeScript config.
- ESLint.
- Prettier.
- Test framework.
- Docker.
- Redis.
- SQLite.
- TypeORM.
- Express.
- Vue + Vite.

Hoàn thành khi:

```text
API chạy.
Web chạy.
Worker chạy.
Redis kết nối.
SQLite migration chạy.
```

---

## Phase 1 — Auth + Workspace

Xây:

- User.
- Login.
- Register.
- Workspace.
- Membership.
- Authorization middleware.

Hoàn thành khi:

```text
User có thể đăng nhập.
User chỉ truy cập workflow thuộc workspace của mình.
```

---

## Phase 2 — Workflow CRUD

Xây:

- Workflow Entity.
- WorkflowVersion.
- CRUD API.
- Workflow validation cơ bản.

Hoàn thành khi:

```text
Có thể tạo, sửa, xóa và clone workflow.
```

---

## Phase 3 — Visual Workflow Editor

Xây:

- Vue Flow canvas.
- Node palette.
- Node configuration panel.
- Edge connect.
- Save.
- Auto save.
- Undo/redo.

Hoàn thành khi:

```text
Workflow được tạo hoàn toàn bằng UI.
Reload trang không mất graph.
```

---

## Phase 4 — Workflow Engine

Xây:

- NodeRegistry.
- Node SDK.
- Graph validator.
- ExecutionState.
- Executor.
- Manual Trigger.
- Set.
- IF.
- HTTP Request.

Hoàn thành khi:

```text
Manual Trigger -> Set -> HTTP
```

chạy thành công.

---

## Phase 5 — Redis + Bull Worker

Xây:

- QueueAdapter.
- BullQueueAdapter.
- Worker.
- Retry.
- Timeout.
- Execution status.

Hoàn thành khi:

```text
API không trực tiếp chạy workflow production.
API chỉ push job.
Worker xử lý workflow.
```

---

## Phase 6 — Webhook + Schedule

Xây:

- Webhook Trigger.
- Webhook test mode.
- Webhook production mode.
- Schedule Trigger.
- Activate/deactivate workflow.

Hoàn thành khi:

```text
External request có thể trigger workflow active.
Schedule có thể tạo execution.
```

---

## Phase 7 — Execution UI + Realtime

Xây:

- Execution list.
- Execution detail.
- Node input/output.
- SSE/WebSocket.
- Realtime node state.

Hoàn thành khi:

```text
Editor hiển thị node đang chạy mà không refresh.
```

---

## Phase 8 — AI Core

Xây:

- AIProviderAdapter.
- Ollama provider.
- Gemini provider.
- OpenAI-compatible provider.
- AI Prompt node.
- Structured Output node.

Hoàn thành khi:

```text
Webhook -> AI Prompt -> Respond Webhook
```

chạy được với ít nhất:

```text
Ollama
hoặc
Gemini
```

---

## Phase 9 — AI Agent

Xây:

- LangChain agent.
- Tool registry.
- HTTP Tool.
- Workflow Tool.
- Max steps.
- Agent execution logs.
- Streaming.

Hoàn thành khi:

```text
AI Agent có thể tự gọi HTTP Tool và trả structured result.
```

---

## Phase 10 — Credential System

Nếu chưa hoàn thiện từ Phase 1:

- Credential CRUD.
- Encryption.
- Credential test.
- Credential mapping cho node.
- Secret masking.

Hoàn thành khi:

```text
Không có API key plaintext trong database hoặc frontend response.
```

---

## Phase 11 — Hardening

Xây:

- Rate limit.
- SSRF protection.
- Audit log.
- Execution retention.
- Queue monitoring.
- Health check.
- Production migrations.
- Backup strategy.

---

# 59. Priority

## P0 — Bắt buộc MVP

```text
Auth
Workspace
Workflow CRUD
Vue Flow Editor
Manual Trigger
Webhook Trigger
HTTP Request
Set
IF
Workflow Executor
Execution History
Redis
Bull
Worker
Credential Encryption
AI Prompt
Gemini/Ollama
```

## P1 — Sau MVP

```text
Schedule
Switch
Loop
Merge
AI Agent
Tools
Streaming
Workflow Versions
Templates
Import/Export
Audit Log
```

## P2 — Advanced

```text
Human-in-the-loop
Sub-workflow
Multi-worker autoscaling
Marketplace
Plugin SDK
OAuth2
RAG
Vector Store
Team collaboration realtime
Execution replay
Advanced analytics
```

---

# 60. Definition of Done cho MVP

MVP được xem là hoàn thành khi người dùng có thể thực hiện toàn bộ flow sau:

```text
1. Register
2. Login
3. Create workspace
4. Create workflow
5. Add Webhook Trigger
6. Add Set node
7. Add AI Prompt node
8. Add HTTP/Response node
9. Configure credential
10. Activate workflow
11. Send HTTP request đến webhook
12. API tạo execution
13. Execution được đưa vào Bull/Redis
14. Worker nhận job
15. Worker chạy từng node
16. AI provider trả kết quả
17. Execution được lưu vào database
18. Frontend nhận realtime status
19. User xem input/output từng node
20. User retry execution lỗi
```

---

# 61. Acceptance Test chính

Workflow:

```text
Webhook
   |
   v
Set Data
   |
   v
AI Prompt
   |
   v
IF
  / \
 /   \
v     v
HTTP  Respond
```

Test case:

### Case 1 — Success

```text
Webhook 200
Execution SUCCESS
Tất cả node có output.
```

### Case 2 — AI Provider Error

```text
AI node FAILED
Execution FAILED
Error được lưu.
Secret không xuất hiện trong log.
```

### Case 3 — HTTP 503

```text
HTTP node retry theo policy.
```

### Case 4 — Worker Restart

```text
Job không bị mất.
Execution có thể tiếp tục/retry đúng policy.
```

### Case 5 — Duplicate Webhook

```text
Idempotency key giống nhau
=> không tạo execution trùng.
```

---

# 62. Quy tắc dành cho coding agent

Agent triển khai phải tuân thủ:

1. Không viết toàn bộ hệ thống trong một package.
2. Không để Express controller chứa workflow execution logic.
3. Không để worker phụ thuộc Express.
4. Không hard-code node type trong executor.
5. Không hard-code AI provider trong AI node.
6. Không gửi credential secret xuống frontend.
7. Không lưu secret plaintext.
8. Không dùng `synchronize: true` trên production.
9. Không chạy workflow production trực tiếp trong API process.
10. Không dùng Redis làm nguồn dữ liệu lịch sử execution.
11. Redis dùng cho queue/event tạm thời; database dùng cho durable state.
12. Mọi execution phải có `workflowVersionId`.
13. Mọi tài nguyên phải được scope theo workspace.
14. Mỗi node phải có timeout/error handling.
15. Mỗi integration mới phải đi qua Node SDK.
16. Mỗi AI provider mới phải đi qua AI Provider Adapter.
17. Viết migration cho thay đổi database.
18. Viết test cùng module quan trọng.
19. Không log API key/token/password.
20. Không triển khai shell execution node trong MVP.

---

# 63. Các quyết định kiến trúc cần giữ ổn định

```text
Express = HTTP/API layer

TypeORM = persistence abstraction

SQLite = MVP database

Redis = queue broker

Bull = MVP queue implementation

QueueAdapter = migration path sang BullMQ

Worker = execution process

workflow-core = graph/execution rules

node-sdk = plugin contract

Vue + Vite = editor UI

Vue Flow = node canvas

LangChain = agent orchestration

Vercel AI SDK = model/provider/streaming abstraction

Ollama + Gemini = provider ưu tiên
```

---

# 64. Đề xuất nâng cấp sau MVP

Khi số execution tăng:

```text
SQLite
   |
   v
PostgreSQL
```

Khi queue cần tính năng/scaling hiện đại hơn:

```text
Bull
 |
 v
BullMQ
```

Khi execution lớn:

```text
Single workflow job
        |
        v
Distributed node jobs
```

Khi có nhiều instance API:

```text
Load Balancer
      |
+-----+------+
|            |
API 1        API 2
|            |
+-----Redis--+
      |
   Workers
```

---

# 65. n8n là nguồn tham khảo bắt buộc về thiết kế và chức năng

## 65.1. Mục đích tham khảo

Trong quá trình xây dựng **m2m — Max to Minus**, coding agent phải coi **n8n** là một trong các sản phẩm tham khảo chính về:

- Cách tổ chức visual workflow editor.
- UX kéo-thả node và nối edge.
- Cách cấu hình node bằng side panel.
- Cách phân loại trigger/action/core/AI nodes.
- Node input/output.
- Workflow activation.
- Manual execution và production execution.
- Execution history.
- Debug workflow.
- Webhook test URL và production URL.
- Credential management.
- Expression/data mapping.
- Retry, timeout và execution error.
- Queue mode và worker scaling.
- AI Agent, model, memory và tool calling.
- Cơ chế xây dựng/custom node.
- Cách tổ chức tài liệu cho integration/node.

Mục tiêu là:

```text
Study n8n concepts and UX
        |
        v
Extract useful patterns
        |
        v
Adapt patterns to m2m architecture
        |
        v
Implement independently
```

**Không được hiểu yêu cầu này là sao chép nguyên giao diện hoặc source code của n8n.**

m2m phải có:

- Branding riêng.
- Design system riêng.
- Component implementation riêng.
- Database schema riêng.
- Workflow engine riêng.
- Node SDK riêng.
- API contract riêng.

Agent được phép học cách n8n giải quyết bài toán, sau đó thiết kế giải pháp phù hợp với kiến trúc m2m.

---

## 65.2. Quy tắc bắt buộc trước khi triển khai tính năng workflow

Trước khi implement một chức năng thuộc workflow automation, agent phải:

```text
1. Xác định chức năng cần xây.
2. Tìm chức năng tương tự trong n8n Docs.
3. Đọc tài liệu chính thức của n8n.
4. Ghi lại behavior/UX/pattern có ích.
5. So sánh với kiến trúc m2m.
6. Chọn phần phù hợp.
7. Thiết kế implementation riêng cho m2m.
8. Viết test.
```

Ví dụ:

```text
Task:
Implement Webhook Trigger

Agent phải đọc:
n8n Webhook documentation
        |
        v
Phân tích:
- test webhook
- production webhook
- HTTP methods
- response behavior
- activation behavior
        |
        v
Thiết kế phiên bản m2m
```

Tương tự:

```text
Task:
Implement Execution History

Agent phải đọc:
n8n execution documentation

Task:
Implement AI Agent node

Agent phải đọc:
n8n AI Agent + AI integration documentation

Task:
Implement distributed workers

Agent phải đọc:
n8n Queue Mode + Scaling documentation
```

---

## 65.3. Điểm UX/UI nên nghiên cứu từ n8n

Agent cần đặc biệt nghiên cứu các pattern sau.

### Workflow Canvas

Quan sát:

- Node card.
- Input/output handles.
- Connection edges.
- Selected state.
- Running state.
- Success/error state.
- Zoom.
- Pan.
- Minimap.
- Node search.
- Add-node interaction.

Không cần pixel-perfect theo n8n.

Mục tiêu:

```text
Familiar workflow UX
+
m2m visual identity
```

### Node Configuration

Nghiên cứu cách:

- Chọn operation.
- Hiển thị dynamic fields.
- Required field.
- Credential selector.
- Expression mode.
- Fixed value mode.
- Input preview.
- Output preview.
- Error display.

### Workflow Execution

Nghiên cứu cách n8n phân biệt:

```text
Manual execution
Production execution
Webhook execution
Scheduled execution
```

m2m cũng nên phân biệt execution mode rõ ràng.

### Debugging

Nghiên cứu:

- Execution history.
- Input/output từng node.
- Failed node.
- Error message.
- Retry/debug flow.
- Dữ liệu của execution trước.

### Credentials

Nghiên cứu UX:

```text
Credential Type
Credential Name
Authentication fields
Connection test
Used-by workflows
```

Nhưng secret handling phải tuân theo security architecture riêng của m2m.

### AI Nodes

Nghiên cứu cách n8n tách:

```text
AI Agent
Chat Model
Memory
Tool
Output Parser
Embedding
Vector Store
```

Đây là pattern rất phù hợp với kiến trúc `nodes-ai` của m2m.

---

## 65.4. n8n Docs — điểm bắt đầu bắt buộc

Agent phải bắt đầu từ trang tài liệu chính thức:

```text
https://docs.n8n.io/
```

Khi task liên quan đến n8n, **ưu tiên tìm kiếm trong domain `docs.n8n.io` trước**.

Ví dụ câu tìm kiếm:

```text
site:docs.n8n.io n8n webhook
site:docs.n8n.io n8n execution
site:docs.n8n.io n8n credentials
site:docs.n8n.io n8n queue mode
site:docs.n8n.io n8n AI Agent
site:docs.n8n.io n8n create node
```

Không dựa chủ yếu vào blog bên thứ ba nếu tài liệu chính thức đã có câu trả lời.

---

## 65.5. Tài liệu workflow bắt buộc đọc

### Understand Workflows

```text
https://docs.n8n.io/build/understand-workflows/
```

Đọc để nghiên cứu:

- Workflow model.
- Workflow components.
- Cách xây workflow.
- Workflow behavior.

### Work With Nodes

```text
https://docs.n8n.io/build/understand-workflows/workflow-components/work-with-nodes/
```

Đọc trước khi xây:

- Node palette.
- Node lifecycle.
- Node interaction.
- Custom/built-in node behavior.

### Node Library

```text
https://docs.n8n.io/integrations/
```

Dùng làm nguồn ý tưởng để xác định:

- Những loại node phổ biến.
- Cách phân nhóm integration.
- Những node core cần có ở m2m.
- Các integration nên ưu tiên trong roadmap.

### Node Types

```text
https://docs.n8n.io/integrations/builtin/node-types/
```

Dùng để nghiên cứu taxonomy của node.

---

## 65.6. Tài liệu execution bắt buộc đọc

### Understand Executions

```text
https://docs.n8n.io/build/understand-workflows/understand-executions/
```

Agent cần nghiên cứu:

- Execution lifecycle.
- Manual/production execution.
- Status.
- Execution data.

### Types of Executions

```text
https://docs.n8n.io/build/understand-workflows/understand-executions/types-of-executions/
```

Dùng để thiết kế:

```text
execution.mode
```

cho m2m.

### View Executions

```text
https://docs.n8n.io/build/understand-workflows/understand-executions/view-all-executions/
```

Dùng làm UX reference cho:

```text
/executions
```

### Debug Executions

```text
https://docs.n8n.io/build/understand-workflows/understand-executions/debug-executions/
```

Đọc trước khi thiết kế:

- Debug UI.
- Execution inspector.
- Retry workflow.
- Node error inspection.

### Execution Order

```text
https://docs.n8n.io/build/flow-logic/understand-execution-order/
```

Đọc trước khi hoàn thiện graph traversal/execution strategy.

**Không mặc định copy execution semantics của n8n.**

Agent phải xác định semantics rõ ràng cho m2m và viết test tương ứng.

---

## 65.7. Tài liệu Webhook và HTTP Request

### Webhook Node

```text
https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/
```

### Webhook Workflow Development

```text
https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/workflow-development/
```

Đọc để nghiên cứu:

```text
Test URL
Production URL
Workflow activation
Webhook request
Webhook response
```

m2m nên giữ pattern:

```text
/webhook-test/*
/webhook/*
```

như đã mô tả trong kế hoạch, nhưng implementation phải là của m2m.

### HTTP Request Node

```text
https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.httprequest/
```

Đọc trước khi xây HTTP Request node.

Nghiên cứu:

- Method.
- URL.
- Query.
- Headers.
- Authentication.
- Body.
- Response.
- Pagination.
- Error handling.

Không bắt buộc MVP hỗ trợ toàn bộ ngay lập tức.

---

## 65.8. Tài liệu Credentials

### Create and Edit Credentials

```text
https://docs.n8n.io/build/understand-workflows/create-and-edit-credentials/
```

### Credential Documentation

```text
https://docs.n8n.io/integrations/builtin/credentials/
```

Agent cần nghiên cứu:

- Credential UX.
- Credential selection.
- Authentication type.
- Credential test.
- Mapping credential -> node.

m2m vẫn phải dùng cơ chế mã hóa secret riêng đã định nghĩa trong kế hoạch.

Không copy credential storage implementation nếu chưa đánh giá security và license.

---

## 65.9. Tài liệu AI bắt buộc đọc

### Integrate AI

```text
https://docs.n8n.io/build/integrate-ai/
```

Đây là nguồn tham khảo chính khi thiết kế AI Workflow UX.

Nghiên cứu cách n8n kết hợp:

```text
Model
Agent
Tool
Memory
Retriever
Output
```

### AI Agent Node

```text
https://docs.n8n.io/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.agent/
```

Đọc trước khi implement:

```text
m2m AI Agent Node
```

### What Agents Do

```text
https://docs.n8n.io/build/integrate-ai/understand-ai-components/what-agents-do/
```

### Agents vs Chains

```text
https://docs.n8n.io/build/integrate-ai/understand-ai-components/agents-vs-chains/
```

### AI Examples

```text
https://docs.n8n.io/build/integrate-ai/ai-examples/
```

Dùng các ví dụ để tìm use case, nhưng thiết kế workflow template riêng cho m2m.

---

## 65.10. Tài liệu xây custom node

### Create Nodes Overview

```text
https://docs.n8n.io/connect/create-nodes/overview/
```

### Build Your Node

```text
https://docs.n8n.io/connect/create-nodes/build-your-node/
```

Agent phải đọc hai phần này trước khi thiết kế hoàn chỉnh:

```text
packages/node-sdk
NodeMetadata
NodeRegistry
NodeProperty
Credential binding
Node execute contract
```

Mục tiêu không phải làm Node SDK giống n8n từng class.

Mục tiêu là học:

- Metadata-driven UI.
- Node discovery.
- Node configuration schema.
- Credential mapping.
- Separation giữa node definition và execution.

---

## 65.11. Tài liệu scaling và queue

### Scaling

```text
https://docs.n8n.io/deploy/host-n8n/configure-n8n/scaling/
```

### Queue Mode

```text
https://docs.n8n.io/deploy/host-n8n/configure-n8n/scaling/enable-queue-mode/
```

Đây là tài liệu **bắt buộc đọc trước Phase 5 — Redis + Bull Worker**.

Agent cần nghiên cứu concept:

```text
Main/API instance
Redis
Worker instance
Execution job
Concurrency
Scaling workers
```

Sau đó áp dụng vào kiến trúc:

```text
Express API
    |
    v
QueueAdapter
    |
    v
Bull + Redis
    |
    v
m2m Workers
```

### Control Concurrency

```text
https://docs.n8n.io/deploy/host-n8n/configure-n8n/scaling/control-concurrency/
```

Đọc trước khi thêm worker concurrency.

### Manage Execution Data

```text
https://docs.n8n.io/deploy/host-n8n/configure-n8n/scaling/manage-execution-data/
```

Đọc khi xây:

- Execution retention.
- Data pruning.
- Scaling storage.
- Large execution handling.

### Workflow Timeout

```text
https://docs.n8n.io/deploy/host-n8n/configure-n8n/basic-configuration/configuration-examples/configure-workflow-timeouts/
```

Dùng làm reference khi thiết kế timeout policy.

---

## 65.12. Tài liệu self-host/deployment

```text
https://docs.n8n.io/deploy/host-n8n/
```

Dùng làm nguồn ý tưởng cho:

- Docker deployment.
- Environment variables.
- Reverse proxy.
- Scaling.
- Worker deployment.
- Production operation.

m2m không cần sao chép cấu hình deployment của n8n.

---

## 65.13. Lưu ý license

Trước khi agent xem hoặc tham khảo trực tiếp source code n8n, phải đọc:

```text
https://docs.n8n.io/privacy-and-security/sustainable-use-license/
```

Nguyên tắc của dự án m2m:

```text
Docs / Product behavior
        |
        v
Allowed as design inspiration
        |
        v
Independent implementation
```

Không yêu cầu agent:

- Copy source file n8n.
- Copy component n8n.
- Copy branding.
- Copy icon/assets.
- Copy nguyên UI.
- Copy nguyên text/documentation.
- Xóa hoặc bỏ qua license notice của code bên thứ ba.

Nếu agent muốn tái sử dụng bất kỳ đoạn source code hoặc package nào từ n8n:

```text
STOP
  |
  v
Check license
  |
  v
Check compatibility with m2m
  |
  v
Only then decide
```

---

## 65.14. Checklist bắt buộc cho coding agent khi lấy ý tưởng từ n8n

Trước mỗi module lớn:

- [ ] Đã tìm module tương ứng trên `https://docs.n8n.io/`.
- [ ] Đã đọc tài liệu official liên quan.
- [ ] Đã ghi lại behavior cần học.
- [ ] Đã phân biệt phần nào là UX pattern, phần nào là implementation detail.
- [ ] Đã kiểm tra xem m2m có yêu cầu khác n8n không.
- [ ] Đã thiết kế API/data model riêng cho m2m.
- [ ] Không copy source/UI/assets nguyên bản.
- [ ] Đã kiểm tra security implications.
- [ ] Đã viết acceptance criteria.
- [ ] Đã viết test cho behavior đã chọn.

---

## 65.15. Prompt chỉ dẫn cố định cho Agent

Khi giao task mới liên quan workflow automation, prepend hoặc áp dụng instruction sau:

```text
n8n is a reference product for m2m — Max to Minus.

Before implementing this feature:

1. Search the official n8n documentation at:
   https://docs.n8n.io/

2. Find documentation related specifically to the feature being implemented.

3. Study n8n's:
   - user-facing behavior,
   - workflow UX,
   - node configuration model,
   - execution semantics,
   - error handling,
   - security considerations,
   - scaling considerations,
   when relevant.

4. Summarize the useful patterns before coding.

5. Compare those patterns against the existing m2m architecture and requirements.

6. Implement an independent m2m solution.
   Do not blindly copy n8n source code, UI, branding, assets, or internal architecture.

7. Keep the established m2m boundaries:
   Express API -> QueueAdapter -> Worker -> Workflow Core -> Node SDK.
   AI features must go through AIProviderAdapter / AI core.

8. Prefer official n8n documentation over third-party blog posts.

9. If direct n8n source-code reuse is considered, stop and review the applicable
   license before copying or adapting code.

10. Add tests and document any behavior intentionally different from n8n.
```

---

# 66. Official references

Các tài liệu nên cho coding agent đọc trước khi triển khai.

## n8n architecture / reference inspiration

- Repository:
  https://github.com/n8n-io/n8n

- n8n queue mode:
  https://docs.n8n.io/deploy/host-n8n/configure-n8n/scaling/enable-queue-mode/

## Express

- Documentation:
  https://expressjs.com/

- Routing:
  https://expressjs.com/en/5x/guide/routing/

- Security:
  https://expressjs.com/en/advanced/best-practice-security/

## TypeORM

- Documentation:
  https://typeorm.io/

- SQLite:
  https://typeorm.io/docs/drivers/sqlite/

- Transactions:
  https://typeorm.io/docs/transactions/

- Migrations:
  https://typeorm.io/docs/migrations/why/

## Bull

- Repository:
  https://github.com/OptimalBits/bull

## BullMQ

- Documentation:
  https://docs.bullmq.io/

## Vue Flow

- Repository:
  https://github.com/bcakmakoglu/vue-flow

## LangChain JavaScript

- Agent documentation:
  https://docs.langchain.com/oss/javascript/langchain/agents

- LangGraph:
  https://docs.langchain.com/oss/javascript/langgraph/overview

## Vercel AI SDK

- Documentation:
  https://ai-sdk.dev/docs/introduction

- Tool calling:
  https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling

## Gemini

- Pricing / Free Tier:
  https://ai.google.dev/gemini-api/docs/pricing

- Rate limits:
  https://ai.google.dev/gemini-api/docs/rate-limits

## Ollama

- API:
  https://docs.ollama.com/api/introduction

---

# 67. Ghi chú kỹ thuật đã kiểm tra

Tại thời điểm lập kế hoạch:

- Express 5 yêu cầu Node.js 18+.
- TypeORM 1.0 yêu cầu Node.js 20+.
- Vì vậy m2m nên chuẩn hóa **Node.js 20+**.
- n8n mô tả queue mode là kiến trúc phù hợp cho scaling execution với main instance + worker và Redis.
- TypeORM hỗ trợ SQLite.
- LangChain JavaScript hỗ trợ agent + tool loop.
- Vercel AI SDK hỗ trợ Node.js/Vue và tool calling.
- Gemini API hiện có Free Tier cho một số model, nhưng quota/model có thể thay đổi.
- Ollama có local HTTP API và phù hợp cho chế độ AI local.
- Bull vẫn có thể dùng cho Redis queue; tuy nhiên nên giữ `QueueAdapter` để không khóa kiến trúc vào một queue library.

---

# 68. Kết quả kiến trúc mong muốn

Sau khi hoàn thành MVP, m2m phải có kiến trúc:

```text
                    m2m — Max to Minus

                      Vue Workflow UI
                             |
                             v
                      Express REST API
                             |
              +--------------+--------------+
              |                             |
              v                             v
          TypeORM DB                    Redis Queue
              |                             |
              |                             v
              |                         Bull Worker
              |                             |
              |                   +---------+---------+
              |                   |                   |
              |                   v                   v
              |              Node Executor       AI Executor
              |                   |                   |
              |                   v                   v
              |              External APIs      AI Providers
              |                                  |
              |                              +---+---+
              |                              |       |
              |                           Ollama   Gemini
              |
              +---------- Execution History
```

Mục tiêu cuối cùng là giữ ba lớp độc lập:

```text
Editor
Execution Engine
Integration/AI Nodes
```

Nhờ đó có thể mở rộng hàng trăm node mà không phải viết lại workflow engine.

---

# 69. Localhost-first và Single-user-first là ưu tiên bắt buộc

## 69.1. Nguyên tắc phát triển

Trong giai đoạn đầu, coding agent phải ưu tiên tuyệt đối mục tiêu:

```text
m2m phải chạy được đầy đủ luồng trên localhost/development
cho 1 người sử dụng trước.
```

Không được tối ưu sớm cho:

- Multi-tenant phức tạp.
- Nhiều workspace.
- Hàng trăm worker.
- Kubernetes.
- High availability.
- Distributed locking phức tạp.
- Horizontal scaling.
- Enterprise SSO.
- Team collaboration realtime.
- Marketplace.
- Multi-region deployment.

Các tính năng trên chỉ được triển khai sau khi luồng local cơ bản chạy ổn định.

---

## 69.2. Mục tiêu localhost tối thiểu

Agent phải đảm bảo developer có thể clone project và chạy m2m trên máy local với luồng:

```text
Developer Machine
      |
      +---- Vue 3 + Vite
      |
      +---- Express API
      |
      +---- Worker
      |
      +---- Redis
      |
      +---- SQLite
      |
      +---- Ollama hoặc AI API
```

Yêu cầu chạy được trên:

```text
http://localhost:<frontend-port>
```

và backend:

```text
http://localhost:<api-port>
```

Không yêu cầu cloud service để chạy luồng development cơ bản.

---

## 69.3. Luồng bắt buộc phải chạy được trên localhost

Trước khi triển khai scaling hoặc multi-user, agent phải chứng minh luồng sau hoạt động end-to-end:

```text
1. Khởi động Redis local.
2. Khởi động Express API.
3. Khởi động Worker.
4. Khởi động Vue + Vite frontend.
5. Mở m2m trên localhost.
6. Tạo workflow.
7. Thêm Manual Trigger hoặc Webhook Trigger.
8. Thêm Set Data node.
9. Thêm HTTP Request hoặc AI Prompt node.
10. Save workflow.
11. Run workflow.
12. API tạo execution.
13. Execution được đẩy vào Bull queue.
14. Worker nhận execution.
15. Worker chạy các node.
16. Output được lưu vào SQLite.
17. Frontend nhận trạng thái execution.
18. Người dùng xem input/output của từng node.
19. Workflow báo SUCCESS hoặc FAILED rõ ràng.
20. Có thể chạy lại workflow.
```

Nếu luồng trên chưa hoạt động ổn định thì không được ưu tiên xây các tính năng enterprise khác.

---

## 69.4. Development Architecture ưu tiên

Giai đoạn đầu dùng kiến trúc:

```text
┌────────────────────────────┐
│      Browser / Vue UI      │
│   localhost:5173           │
└──────────────┬─────────────┘
               │
               v
┌────────────────────────────┐
│       Express API          │
│   localhost:3000           │
└──────────┬─────────┬───────┘
           │         │
           │         v
           │     Redis Local
           │         │
           │         v
           │      Bull Queue
           │         │
           │         v
           │       Worker
           │
           v
       SQLite File
```

AI:

```text
Worker
  |
  +---- Ollama localhost
  |
  +---- Gemini API
  |
  +---- OpenAI-compatible API
```

Ưu tiên:

```text
Ollama local
```

để developer có thể thử AI workflow mà không bắt buộc dùng dịch vụ trả phí.

---

## 69.5. Single-user-first

Phiên bản development đầu tiên có thể giả định:

```text
1 local developer
1 user
1 workspace mặc định
```

Không cần bắt đầu bằng permission model phức tạp.

Có thể triển khai:

```text
Default User
      |
      v
Default Workspace
      |
      v
Workflows
```

Sau khi workflow engine ổn định mới hoàn thiện:

```text
User
 |
 +---- Workspace A
 |
 +---- Workspace B
 |
 +---- Workspace C
```

---

## 69.6. Auth trong giai đoạn development

Auth không được cản trở việc phát triển workflow engine.

Cho phép development mode:

```text
AUTH_MODE=development
```

Trong mode này:

```text
Local request
    |
    v
Dev Auth Middleware
    |
    v
Default Local User
```

Ví dụ:

```text
userId = local-user
workspaceId = local-workspace
```

Không bỏ kiến trúc authentication.

Chỉ tạo một development adapter để giảm friction khi chạy local.

Production vẫn phải dùng auth thật.

---

## 69.7. Database cho local development

Bắt buộc ưu tiên:

```text
SQLite
```

Ví dụ:

```text
./data/m2m.sqlite
```

Developer không cần cài PostgreSQL để chạy MVP.

Entity và repository vẫn phải viết theo cách có thể migration sang PostgreSQL sau này.

Không viết logic business phụ thuộc chặt vào SQLite.

---

## 69.8. Redis local

Queue development có thể chạy bằng Docker:

```bash
docker compose up redis
```

Hoặc chạy toàn bộ dependency:

```bash
docker compose up
```

Không được yêu cầu developer cài Redis thủ công nếu Docker đã có thể xử lý.

---

## 69.9. Development commands

Agent phải tạo các command đơn giản.

Ví dụ:

```bash
pnpm install
```

Sau đó:

```bash
docker compose up -d redis
```

Database migration:

```bash
pnpm db:migrate
```

Development:

```bash
pnpm dev
```

`pnpm dev` nên có khả năng chạy:

```text
web
api
worker
```

song song.

Ví dụ implementation có thể dùng:

```text
pnpm workspace
concurrently
turbo
```

nhưng chọn giải pháp đơn giản nhất phù hợp project.

---

## 69.10. Một lệnh để chạy development

Mục tiêu mong muốn:

```bash
pnpm dev
```

sau khi Redis đã sẵn sàng.

Hoặc:

```bash
docker compose up -d redis
pnpm dev
```

Developer không nên phải mở quá nhiều terminal chỉ để test workflow cơ bản.

---

## 69.11. Seed development

Agent nên tạo development seed:

```text
Default User
Default Workspace
Sample Credentials metadata
Sample Workflow
```

Ví dụ workflow:

```text
Manual Trigger
      |
      v
Set Data
      |
      v
AI Prompt
```

Hoặc:

```text
Webhook
   |
   v
Set Data
   |
   v
Respond Webhook
```

Mục tiêu:

```text
Clone
  |
Install
  |
Run
  |
Open localhost
  |
Immediately test workflow
```

---

## 69.12. Local Webhook

Trong development, webhook phải hoạt động trên:

```text
http://localhost:<api-port>/webhook-test/*
```

và:

```text
http://localhost:<api-port>/webhook/*
```

Không bắt buộc tunnel internet cho local test.

Nếu cần nhận webhook từ dịch vụ bên ngoài thì mới xem xét:

```text
Cloudflare Tunnel
ngrok
```

nhưng đây không phải dependency bắt buộc của MVP.

---

## 69.13. AI localhost flow

Agent phải ưu tiên ít nhất một flow AI chạy local:

```text
Manual Trigger
      |
      v
Set Prompt
      |
      v
Ollama Chat Model
      |
      v
Output
```

Nếu máy developer không chạy Ollama được thì có thể dùng:

```text
Gemini API
```

nhưng AI architecture phải hoạt động với cả local provider và remote provider.

---

## 69.14. Development error experience

Khi local development bị lỗi, frontend phải cho developer biết:

```text
Redis unavailable
Worker unavailable
Database unavailable
AI provider unavailable
Invalid workflow
Node failed
```

Không chỉ trả:

```text
Internal Server Error
```

Ví dụ:

```text
Worker is not connected.
Start the worker with: pnpm dev:worker
```

Development UX phải hỗ trợ debug nhanh.

---

## 69.15. Health panel trong development

Có thể có:

```text
/settings/developer
```

hoặc development status panel.

Hiển thị:

```text
API          ONLINE
Database     ONLINE
Redis        ONLINE
Worker       ONLINE
AI Provider  ONLINE / NOT CONFIGURED
```

Backend:

```text
GET /health
GET /health/dependencies
```

Mục tiêu là giúp developer biết dependency nào chưa chạy.

---

## 69.16. Không tối ưu sớm

Coding agent không được làm các việc sau trước khi localhost MVP chạy ổn:

```text
Kubernetes deployment
Distributed workflow scheduler
Multi-region Redis
Redis Cluster
PostgreSQL replication
Enterprise SSO
Advanced RBAC
Advanced billing
Marketplace
Plugin signing
Worker autoscaling
Multiple API replicas
Service mesh
```

Nguyên tắc:

```text
Make it work locally
        |
        v
Make it correct
        |
        v
Make it observable
        |
        v
Make it secure
        |
        v
Then scale it
```

---

## 69.17. Thứ tự ưu tiên mới của roadmap

Roadmap phải hiểu theo thứ tự:

### Priority 1

```text
Localhost
Single User
SQLite
Redis Local
1 Worker
Workflow Editor
Workflow Engine
Manual Execution
Webhook
Execution History
AI Local/API
```

### Priority 2

```text
Authentication hoàn chỉnh
Workspace
Multi-user
Permissions
Credentials nâng cao
Workflow Versioning
Schedule
AI Agent
```

### Priority 3

```text
PostgreSQL
Multiple Workers
Queue Scaling
Production Deployment
Observability nâng cao
Enterprise Security
```

### Priority 4

```text
High Availability
Autoscaling
Multi-region
Marketplace
Enterprise SSO
Collaboration realtime
```

---

## 69.18. Gate bắt buộc trước khi sang multi-user/scaling

Agent không được coi Phase localhost hoàn thành cho đến khi chạy pass checklist:

- [ ] `pnpm install` thành công.
- [ ] Redis local chạy.
- [ ] SQLite migration chạy.
- [ ] API chạy.
- [ ] Worker chạy.
- [ ] Vue frontend chạy.
- [ ] Truy cập được website bằng localhost.
- [ ] Có thể tạo workflow.
- [ ] Có thể save workflow.
- [ ] Manual Trigger chạy.
- [ ] Webhook Trigger chạy local.
- [ ] Bull queue nhận job.
- [ ] Worker nhận job.
- [ ] Node được execute.
- [ ] Execution được lưu SQLite.
- [ ] Frontend xem được execution.
- [ ] Input/output từng node hiển thị đúng.
- [ ] Node error hiển thị đúng.
- [ ] Có thể retry execution.
- [ ] AI Prompt chạy với ít nhất một provider.
- [ ] Restart app không làm mất workflow đã lưu.
- [ ] README hướng dẫn local setup từ đầu đến cuối.

Chỉ sau khi checklist này pass mới ưu tiên:

```text
Multi-user
Multi-workspace
Distributed workers
Production scaling
```

---

## 69.19. Definition of Done riêng cho Local MVP

Local MVP được xem là hoàn thành khi một developer mới có thể:

```text
git clone
   |
   v
pnpm install
   |
   v
docker compose up -d redis
   |
   v
pnpm db:migrate
   |
   v
pnpm dev
   |
   v
Open localhost
   |
   v
Create workflow
   |
   v
Run workflow
   |
   v
See execution result
```

mà không phải:

- Sửa source code.
- Cài database server riêng.
- Deploy cloud.
- Thiết lập Kubernetes.
- Tạo nhiều account.
- Cấu hình hệ thống distributed.

---

## 69.20. Chỉ dẫn cố định cho coding agent

Agent phải coi instruction sau là ưu tiên cao:

```text
LOCALHOST-FIRST / SINGLE-USER-FIRST REQUIREMENT

The first goal of m2m — Max to Minus is NOT enterprise scaling.

The first goal is to make the complete workflow automation loop work reliably
on localhost/development for one user.

Before implementing multi-user, multi-workspace, distributed workers,
Kubernetes, high availability, marketplace, enterprise authentication,
or advanced scaling:

1. Make the Vue frontend run locally.
2. Make the Express API run locally.
3. Make SQLite work locally.
4. Make Redis/Bull work locally.
5. Make one worker process work locally.
6. Make workflow create/save/load work.
7. Make manual execution work.
8. Make local webhook execution work.
9. Make execution history work.
10. Make node input/output inspection work.
11. Make at least one AI provider work.
12. Make the complete flow debuggable from localhost.
13. Document the exact local setup in README.
14. Add automated tests for this flow.

Prefer the simplest implementation that satisfies the current local MVP.

Do not introduce distributed-system complexity until the localhost acceptance
checklist passes.

Architecture should remain extensible, but implementation should stay simple.
```
