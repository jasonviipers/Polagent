# @polagent/models

Multi-model, multi-provider routing for the Polymarket Autonomous Trading Agent System.

This package provides:
- A unified registry that instantiates AI SDK models across providers
- Model capability profiles (cost/latency/capabilities/suitability)
- A router that selects the best model per task (with manual override support)
- A metrics store to refine routing based on observed performance

## Providers

Supported providers (via Vercel AI SDK providers):
- Google Gemini (`@ai-sdk/google`)
- OpenAI (`@ai-sdk/openai`)
- Anthropic Claude (`@ai-sdk/anthropic`)
- DeepSeek (via OpenAI-compatible OpenAI provider instance with custom base URL)

## Server Configuration

Configure providers in server environment variables (validated in [server.ts](file:///c:/Users/4hkee/OneDrive/Bureau/Jason%20Platform/polagent/packages/env/src/server.ts)):

- `GOOGLE_GENERATIVE_AI_API_KEY` (optional)
- `OPENAI_API_KEY` (optional)
- `OPENAI_BASE_URL` (optional)
- `ANTHROPIC_API_KEY` (optional)
- `ANTHROPIC_BASE_URL` (optional)
- `DEEPSEEK_API_KEY` (optional)
- `DEEPSEEK_BASE_URL` (optional)

Router tuning:
- `MODEL_ROUTER_MAX_CANDIDATES` (default: `3`)
- `MODEL_ROUTER_ENABLED_MODELS` (optional comma-separated model profile ids, e.g. `google:gemini-2.5-flash,openai:gpt-4o-mini`)

## How Routing Works

Callers specify a `TaskSpec`:
- `taskType`: `tradingDecision | marketAnalysis | search | summarization | extraction`
- `priority`: `quality | latency | cost`
- `required`: e.g. `{ tools: true }`

The router filters models by requirements and ranks by suitability + observed error rate + latency.

## Manual Override

Server endpoints accept `modelOverride` (a profile id like `openai:gpt-4o-mini`) to force a specific model.

## Adding a New Provider/Model

1. Add a `ModelProfile` entry in [profiles.ts](file:///c:/Users/4hkee/OneDrive/Bureau/Jason%20Platform/polagent/packages/models/src/profiles.ts).
2. Ensure the registry can create the model in [registry.ts](file:///c:/Users/4hkee/OneDrive/Bureau/Jason%20Platform/polagent/packages/models/src/registry.ts).
3. Add environment variables (if needed) in [server.ts](file:///c:/Users/4hkee/OneDrive/Bureau/Jason%20Platform/polagent/packages/env/src/server.ts).
4. Validate routing behavior by extending [model-router.test.ts](file:///c:/Users/4hkee/OneDrive/Bureau/Jason%20Platform/polagent/packages/models/src/test/model-router.test.ts).
