# m2m — Max to Minus

Visual AI workflow automation with a Vue Flow editor, Express 5 API, independent Bull worker, Redis queue/event bus, TypeORM migrations, durable SQLite history, persistent schedules, and AI agent nodes.

## Requirements

- Node.js 20 or newer (Node 24 is tested).
- pnpm 11 through Corepack.
- Docker Desktop (for local Redis).
- Optional: [Ollama](https://docs.ollama.com/) or a Gemini/OpenAI-compatible API key for AI Prompt nodes.

## Start from a fresh clone

```bash
corepack enable
pnpm install
docker compose up -d redis
pnpm db:migrate
pnpm dev
```

Open:

- Web editor: http://localhost:5173
- API: http://localhost:3000
- Dependency health: http://localhost:3000/health
- Developer panel: http://localhost:5173/settings/developer

`pnpm dev` starts the web, API, and worker together. SQLite is created at `./data/m2m.sqlite`; migrations also seed a local user, local workspace, and a runnable Manual Trigger → Set Data workflow. Saved workflows and execution history survive restarts.

Copy `.env.example` to `.env` only when overriding defaults. Use unique `MASTER_ENCRYPTION_KEY` and `AUTH_SECRET` values before production use. Development auth is enabled by default; `AUTH_MODE=production` enables password hashing, access/refresh tokens, workspace membership, and role checks. Never commit `.env`.

## First workflow run

1. Open **Workflows** and select the seeded workflow (or create one).
2. Drag nodes from the backend-driven palette and connect their handles.
3. Edit parameters in the right panel. Expressions include `{{$json.email}}`, `{{$node["Node name"].json.value}}`, `{{$workflow.id}}`, and `{{$execution.id}}`.
4. Click **Save**, **Validate**, then **Run**.
5. Follow the live node colors, then open the execution link to inspect each node's input, output, error, duration, and attempt.
6. Use **Retry execution** on the detail page to create a durable retry run.

The editor supports drag/drop, connect, delete, duplicate, pan/zoom, minimap, multi-select, copy/paste, undo/redo, manual save, and 800 ms debounced autosave.

## Local webhook

Create a workflow beginning with **Webhook Trigger**, set its path and method, and save it.

Test mode works without activation:

```bash
curl -X POST http://localhost:3000/webhook-test/WORKFLOW_ID/incoming \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: demo-1" \
  -d '{"name":"m2m"}'
```

For the production-style URL, activate the workflow first and call `/webhook/WORKFLOW_ID/incoming`. Reusing the same idempotency key within 24 hours returns the original execution rather than enqueueing a duplicate.

## AI Prompt

Ollama is the default local provider:

```bash
ollama pull llama3.2
ollama serve
```

Use provider `ollama`, model `llama3.2`, and `http://127.0.0.1:11434` (the default). Gemini and OpenAI-compatible providers can use an encrypted credential from the Credentials page or environment values shown in `.env.example`. Provider failures distinguish credential, rate-limit, temporary provider, and timeout errors.

For a low-memory development machine, the acceptance flow is also verified with:

```bash
ollama pull smollm2:135m-instruct-q4_0
```

Select that exact model id in the AI Prompt node.

## Schedules and AI workflows

Schedule Trigger supports every-N-minutes, hourly, daily, weekly, and five-field cron schedules with an IANA timezone. Activating a workflow creates an immutable snapshot and persistent Bull repeat job. The worker reconciles schedules after restart and deduplicates ticks before creating executions.

The AI palette includes Prompt, Chat Model, Agent, Tool, Structured Output, Text Classification, Information Extraction, Embedding, and persistent Simple Memory. Agent tools support bounded HTTP, calculator, date/time, internal-data lookup, and asynchronous workflow invocation. Credentials are resolved only inside the worker.

Core/data nodes include Transform, Switch, Merge, Delay, Loop / For Each, Text Parser, Filter, and Map Fields. Unselected branches are persisted as skipped so downstream merges can settle.

## Commands

```bash
pnpm dev             # API + worker + web
pnpm dev:api         # API only
pnpm dev:worker      # worker only
pnpm dev:web         # web only
pnpm db:migrate      # apply TypeORM migrations and safe dev seed
pnpm db:seed         # seed local data only
pnpm db:backup       # create a timestamped SQLite backup
pnpm typecheck
pnpm test
pnpm test:smoke       # requires the local API, worker, and Redis to be running
pnpm build
pnpm check           # typecheck + test + build
```

## Architecture

```text
Vue Flow editor ──REST/SSE──> Express API ──> SQLite
                              │
                              └──Bull job──> Redis ──> independent worker
                                                 │
                                                 └──pub/sub execution events

worker -> workflow-core -> NodeRegistry -> node-sdk implementation
                                   └──────> AIProviderAdapter -> Ollama/Gemini/OpenAI-compatible
```

The API never executes a production workflow. Each execution references an immutable workflow version; Redis holds transient jobs/events while SQLite holds durable history. Node implementations and AI providers are selected through registry/adapter contracts rather than hard-coded in the executor.

Operational endpoints include queue counts at `/api/v1/admin/queues`, audit history at `/api/v1/audit-logs`, and explicit retention cleanup at `/api/v1/admin/retention/run`. The worker also registers persistent schedule and daily retention jobs.

## Troubleshooting

- **Redis unavailable**: run `docker compose up -d redis`, then check `/health`.
- **Worker unavailable**: run `pnpm dev:worker`; the worker heartbeat appears within five seconds.
- **Database unavailable**: run `pnpm db:migrate`; confirm `data/m2m.sqlite` is writable.
- **AI provider unavailable**: start Ollama or configure a provider credential. AI is intentionally not part of global readiness.
- **Invalid workflow**: use **Validate**; node/field-level errors are returned instead of a generic 500.
- **Node failed**: open its execution detail to inspect the sanitized error and retry attempt.

## Security defaults

Credentials use AES-256-GCM encryption and API responses never include ciphertext or old secret values. Logs omit request bodies, authorization headers, and credentials. Expressions expose only explicit read-only roots. HTTP nodes enforce protocol, timeout, response-size and retry policy; production mode also blocks obvious private-network destinations. There is no shell-execution node.
