# @polagent/agents

Agentic core for the Polymarket Autonomous Trading Agent System (PRD v1.0).

This package demonstrates:
- Role-based agents (strategy prompts per agent)
- AI SDK v6 tool calling (market analysis, risk checks, simulated execution)
- Message validation + persistence-friendly APIs
- Pluggable memory stores (in-memory and Redis)

## Key Modules

- `src/orchestrator.ts`: creates and manages the configured strategy agents.
- `src/agents/trading-agent.ts`: a single strategy agent implemented with `streamText`.
- `src/tools/trading-tools.ts`: AI SDK tools (`analyzeMarket`, `calculateRisk`, `executeTrade`, `listMarkets`).
- `src/memory/*`: `AgentMemoryStore` interface and implementations.
- `src/conversation.ts`: merge + dedupe + truncation helpers for chat history.

## Usage (Server)

```ts
import { google } from "@ai-sdk/google";
import { AgentOrchestrator, InMemoryAgentMemoryStore } from "@polagent/agents";

const orchestrator = new AgentOrchestrator({
  model: google("gemini-2.5-flash"),
  memory: new InMemoryAgentMemoryStore(),
});

const { result, originalMessages, onFinish } = await orchestrator.respond({
  threadId: "user_123",
  agentId: "agent_momentum",
  messages, // UIMessage[]
});

return result.toUIMessageStreamResponse({
  originalMessages,
  onFinish,
});
```

## Safety/Tooling Patterns

- Use `validateUIMessages({ tools })` before converting messages to model messages.
- Keep tool execution separated into tool modules with strict input schemas.
- Treat execution tools as high-risk boundaries (error handling and approvals can be added at the tool level).

