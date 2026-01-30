import { expect, test } from "bun:test";

import { MockLanguageModelV3 } from "ai/test";
import { InMemoryAgentMemoryStore } from "../memory/in-memory";
import { AgentOrchestrator } from "../orchestrator";
import type { MarketDataSource } from "../tools/trading-tools";

test("orchestrator rejects oversized message arrays", async () => {
  const model = new MockLanguageModelV3({
    doGenerate: [],
  });

  const dataSource: MarketDataSource = {
    getMarketSnapshot: async () => null,
    listMarketIds: async () => [],
    executeTrade: async () => ({
      status: "rejected",
      reason: "not implemented",
    }),
  };

  const orchestrator = new AgentOrchestrator({
    model,
    memory: new InMemoryAgentMemoryStore(),
    dataSource,
  });

  const tooMany = Array.from({ length: 201 }, () => ({}));

  await expect(() =>
    orchestrator.respond({
      threadId: "thread_1",
      agentId: "agent_momentum",
      messages: tooMany as any,
    })
  ).toThrow();
});
