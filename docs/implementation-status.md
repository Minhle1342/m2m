# Implementation status

This file records evidence against `m2m_max_to_minus_build_plan.md`. It intentionally distinguishes implementation, automated verification, runtime verification, and unverified UI behavior.

## Local MVP gate (section 69.18)

| Requirement | Status | Evidence |
| --- | --- | --- |
| `pnpm install` | Pass | pnpm 11 lockfile install succeeds with an explicit dependency build allowlist. |
| Redis local | Pass | `docker compose up -d redis`; `/health` reports Redis online. |
| SQLite migration | Pass | `pnpm db:migrate`; `data/m2m.sqlite` created by TypeORM migration. |
| API | Pass | Express responds on `localhost:3000`; liveness/readiness/dependency health implemented. |
| Worker | Pass | Independent process consumes Bull jobs and publishes a Redis heartbeat. |
| Vue frontend | Pass (HTTP/build) | Vite responds on `localhost:5173`; production build succeeds. Visual browser QA is still unverified because no browser backend was available in the execution environment. |
| Create/save workflow | Pass (API/source) | CRUD and PATCH persistence exercised; Vue editor implements manual save and 800 ms autosave. Interactive browser QA remains unverified. |
| Manual Trigger | Pass | Runtime Manual → Set execution completed through Bull/worker with two durable node records. |
| Local Webhook Trigger | Pass | Active webhook smoke test completed with three durable node records. Test and production-style routes exist. |
| Bull queue / worker receives job | Pass | API-created job id equals durable execution id; independent worker completed the job. |
| Node execution | Pass | Success and failure paths exercised; retryable HTTP failure recorded attempts 1 and 2 independently. |
| Execution stored in SQLite | Pass | Execution and node results survived API/worker restart. |
| Frontend execution list/detail | Implemented/build pass | List/detail routes render status and node input/output/error/duration/attempt. Visual browser QA remains unverified. |
| Correct node input/output | Pass (API/source) | Runtime execution detail and SSE snapshot contain node inputs/outputs; inspector renders those payloads. |
| Correct node error | Pass (API/source) | Runtime HTTP failure produced `HTTP_ERROR`, failed execution, and two failed attempt records; detail inspector renders errors. |
| Retry execution | Pass | Smoke test creates a new `mode=retry` execution with `retryOfId` and succeeds. |
| AI Prompt with a provider | Pass | Real Ollama execution completed with `smollm2:135m-instruct-q4_0`; Vercel AI SDK OpenAI-compatible integration is also covered end-to-end with encrypted credentials. |
| Restart preserves workflows | Pass | Existing workflow, execution, and node results were queried successfully after API/worker restart. |
| README local setup | Pass | Root README covers install, Redis, migration, dev, webhook, AI, commands, architecture, and troubleshooting. |

Repeatable checks:

```bash
pnpm lint
pnpm check
pnpm test:smoke
```

`test:smoke` requires Redis, API, and worker to be running. It covers health, active webhook, idempotency, Bull/worker execution, durable node results, retry lineage, credential encryption/resolution, and an AI Prompt through an OpenAI-compatible provider.

## Architecture delivered

- pnpm monorepo with separate API, worker, web, workflow core, node SDK, base nodes, AI nodes, queue, AI core, database, shared, and config packages.
- NodeRegistry and backend-driven node metadata endpoint.
- Read-only expression paths with forbidden executable/global identifiers.
- DAG validation, per-node and workflow timeouts, retry classification/backoff, branch handles, cancellation checks, and lifecycle hooks.
- QueueAdapter plus Bull implementation; Redis pub/sub SSE bridge.
- TypeORM migration, immutable workflow snapshots, durable executions/node executions, idempotency keys, encrypted credentials, and local seed.
- Ollama, Gemini, and OpenAI-compatible adapters built on Vercel AI SDK generation/streaming.
- Vue Flow editor with dynamic palette, configuration panel, autosave, history controls, clipboard actions, minimap, validation, run overlay, and execution inspection.
- Helmet, CORS allowlist, rate limit, request size limit, structured errors, secret-safe logs, AES-256-GCM credentials, HTTP timeout/size/protocol rules, and production private-host blocking.
- Persistent Schedule Trigger with activation snapshots, Bull repeat jobs, SQLite schedule state, restart reconciliation, and tick deduplication.
- Full core/data MVP palette, branch-skip propagation, merge convergence, persistent node memory, and waiting/skipped execution persistence.
- AI Chat Model, Agent/Tool loop, Structured Output, Text Classification, Information Extraction, Embedding, and Simple Memory nodes.
- Production auth mode with scrypt password hashing, signed access tokens, rotating refresh sessions, workspace RBAC, and login/register UI.
- Version restore, workflow import/export/templates, audit logs, retention, queue monitoring, and timestamped SQLite backup support.

## Current implementation batch

The scheduler, expanded node palette, production auth/RBAC, AI agent family, hardening, and operations features above were implemented after the last runtime verification. At the user's direction, no unit, integration, smoke, browser, migration, health, provider, or manual runtime checks are being run for this batch. Only the repository build command is used as the final static compilation and bundle confirmation.

## Remaining roadmap scope

The localhost/P0/P1 implementation is substantially complete. Scope intentionally left for later P2/P3 work includes:

- Human-in-the-loop approval/resume, synchronous sub-workflow coordination, RAG/vector storage, OAuth2 integrations, marketplace/plugin distribution, multi-worker autoscaling, and collaborative realtime editing.
- Provider-native agent delta streaming in the editor; execution SSE currently reports lifecycle events and final agent/tool logs.
- PostgreSQL deployment profiles, DNS-rebinding-resistant outbound policy, metrics/tracing exporters, and automated off-host backup rotation.
- Tags and advanced execution analytics/replay.
- Verification coverage for this new implementation batch remains deliberately unexecuted under the current no-testing constraint.
