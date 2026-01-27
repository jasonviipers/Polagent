## Current State
- Only Gemini is wired (via `@ai-sdk/google`) and injected once into `AgentOrchestrator` in [apps/server/src/index.ts](file:///c:/Users/4hkee/OneDrive/Bureau/Jason%20Platform/polagent/apps/server/src/index.ts).
- `TradingAgent` consumes a single `LanguageModel` instance for all tasks in [trading-agent.ts](file:///c:/Users/4hkee/OneDrive/Bureau/Jason%20Platform/polagent/packages/agents/src/agents/trading-agent.ts).

## Goal
Implement a flexible, multi-provider, multi-model system where agents can:
- Automatically select the best model per task (trading decision vs search vs analysis)
- Fall back when a model/provider fails
- Track cost/latency/error metrics and improve routing over time
- Allow manual overrides

## Architecture Overview
### 1) Unified Abstraction Layer
- Create a new package (recommended): `packages/models` exporting:
  - `ModelId`, `ProviderId`
  - `ModelProfile` (capabilities + cost + latency + suitability)
  - `ModelRegistry` (builds AI SDK `LanguageModel` instances from provider configs)
  - `ModelRouter` (selects model given a `TaskSpec`)
  - `ModelTelemetrySink` (writes metrics)
- Use the Vercel AI SDK `LanguageModel` as the runtime “unified interface” to avoid re-inventing provider adapters.

### 2) Model Capability Profiling
- Define `ModelProfile`:
  - Context window, tool-calling reliability, structured output quality, reasoning strength
  - Typical latency band (p50/p95), estimated availability/reliability score
  - Cost model (per-token or per-request) + per-provider constraints
  - Task suitability weights: `{ tradingDecision, marketAnalysis, searchOps, summarization, extraction }`
- Maintain profiles in code + allow overrides via config.

### 3) Intelligent Routing Logic
- Define `TaskSpec` passed by callers (agent/system):
  - `taskType`: `tradingDecision | marketAnalysis | search | summarization | extraction`
  - `priority`: `latency | quality | cost`
  - `budget`: `{ maxDollars?, maxInputTokens?, maxLatencyMs? }`
  - `required`: `{ tools?: boolean, jsonOutput?: boolean, longContext?: boolean }`
- Implement `ModelRouter.selectModel(taskSpec)`:
  - Compute a score = suitabilityWeight × reliability × (1/latency) × (1/cost) with hard filters for requirements.
  - Return ordered candidates: primary + fallbacks.

### 4) Feedback Mechanism
- Add `ModelMetricsStore` interface:
  - `recordCall({ modelId, taskType, latencyMs, inputTokens, outputTokens, costUsd, outcome })`
  - `getRollingStats(modelId, taskType)`
- Start with an in-memory implementation; optionally add a DB-backed implementation using `@polagent/db` tables (EWMA latency, error rate, success rate, rolling cost).
- Update router scoring using rolling stats (e.g., penalize recent errors and slowdowns).

### 5) Seamless Switching
- Make model selection per-request (or per-step) without changing agent state.
- Introduce `ModelSession` concept:
  - Each request chooses a model; agent memory remains independent of model.
  - If a request fails before streaming starts, retry with fallback.

### 6) Error Handling + Fallback
- Wrap calls in `withModelFallback(candidates, fn)`:
  - Catch provider/network/429/5xx errors.
  - Retry with exponential backoff within constraints.
  - Escalate to next candidate when a model is unavailable.
- Standardize errors into `ModelProviderError`, `ModelRateLimitError`, `ModelUnavailableError`.

### 7) Configuration Management
- Extend `packages/env/src/server.ts` with provider-specific settings:
  - `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `DEEPSEEK_API_KEY`
  - Optional endpoints/base URLs for OpenAI-compatible APIs (DeepSeek, self-hosted, etc.)
  - Optional per-model cost overrides and enable/disable flags
- Keep config centralized and validated with Zod (matching existing env patterns).

### 8) Monitoring + Logging
- Emit structured logs per call: `{ modelId, provider, taskType, latencyMs, tokens, costUsd, fallbackUsed }`.
- Add a lightweight server endpoint:
  - `GET /ai/models/stats` returns rolling stats (for dashboarding).
- Reuse AI SDK middleware/devtools where possible.

## Integration Points (Concrete Changes)
- `packages/agents`:
  - Update `TradingAgent.respond()` to accept a `TaskSpec` (or infer one from context) and ask the router for a model.
  - Or update `AgentOrchestrator.respond()` to choose the model and pass it into `TradingAgent` per-call.
- `apps/server/src/index.ts`:
  - Replace single `agentModel` with `ModelRegistry + ModelRouter`.
  - Add request-level override fields: `modelOverride?: ModelId`.
- `apps/web/src/app/ai/page.tsx`:
  - Add optional manual model dropdown (in addition to agent selection), passing `modelOverride` in the request body.

## Provider Support Strategy
- OpenAI: via `@ai-sdk/openai`
- Claude (Anthropic): via `@ai-sdk/anthropic`
- DeepSeek and “OpenAI-compatible”: via OpenAI provider with configurable `baseURL` + API key
- Future providers: add a `ProviderFactory` entry + `ModelProfile` entry; no agent code changes.

## Verification Plan
- Unit tests in `packages/models`:
  - Router selection (cost/latency/requirements filtering)
  - Fallback behavior on simulated failures
  - Metrics updates affecting routing
- Integration test (mock model):
  - Ensure a request can fail on primary and succeed on fallback without losing conversation continuity.

## Deliverables
- `packages/models` (registry/router/profiles/metrics/logging)
- Updated server endpoints to support `agentic` routing + manual override
- Updated web UI to expose agent + optional model override
- Tests for routing/fallback and performance telemetry

Confirm this plan and I’ll implement it end-to-end in this repository.