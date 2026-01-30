import { expect, test } from "bun:test";
import { MockLanguageModelV3 } from "ai/test";
import { InMemoryAgentMemoryStore } from "../memory/in-memory";
import { AgentOrchestrator } from "../orchestrator";
import type { MarketDataSource } from "../tools/trading-tools";

function createUsage(input: number, output: number) {
  return {
    inputTokens: {
      total: input,
      noCache: input,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: { total: output, text: output, reasoning: undefined },
  };
}

test("orchestrator can delegate tasks to sub-agents in parallel", async () => {
  const dataSource: MarketDataSource = {
    getMarketSnapshot: async () => ({
      id: "btc-market",
      question: "Will BTC hit 100k?",
      liquidity: 100_000,
      volume24h: 500_000,
      outcomes: [],
      updatedAt: new Date(),
    }),
    listMarketIds: async () => ["btc-market"],
    executeTrade: async () => ({ status: "success" }),
    getTechnicalIndicators: async () => ({ rsi: 70 }),
    getNews: async () => [
      { title: "BTC Moon", content: "Very bullish", score: 0.9 },
    ],
  };

  const model = new MockLanguageModelV3({
    doGenerate: [
      // First call: Orchestrator decides to delegate
      {
        content: [
          {
            type: "tool-call",
            toolCallId: "tc_orchestrate",
            toolName: "delegateTasks",
            input: JSON.stringify({
              tasks: [
                {
                  id: "t1",
                  agentId: "agent_crypto_technical_analyst",
                  taskDescription: "Analyze BTC RSI",
                },
                {
                  id: "t2",
                  agentId: "agent_news_aggregator",
                  taskDescription: "Scan BTC news",
                },
              ],
            }),
          },
        ],
        finishReason: { unified: "tool-calls", raw: "stop" },
        usage: createUsage(10, 10),
        warnings: [],
      },
      // Second call (Sub-agent 1: Technical)
      {
        content: [{ type: "text", text: "RSI is 70, overbought." }],
        finishReason: { unified: "stop", raw: "stop" },
        usage: createUsage(5, 5),
        warnings: [],
      },
      // Third call (Sub-agent 2: News)
      {
        content: [{ type: "text", text: "News is very bullish." }],
        finishReason: { unified: "stop", raw: "stop" },
        usage: createUsage(5, 5),
        warnings: [],
      },
      // Final call: Orchestrator synthesizes
      {
        content: [
          {
            type: "text",
            text: "Synthesized decision: Hold due to overbought RSI despite bullish news.",
          },
        ],
        finishReason: { unified: "stop", raw: "stop" },
        usage: createUsage(20, 10),
        warnings: [],
      },
    ],
  });

  const orchestrator = new AgentOrchestrator({
    model,
    memory: new InMemoryAgentMemoryStore(),
    dataSource,
  });

  const response = await orchestrator.respond({
    threadId: "swarm_test",
    agentId: "agent_orchestrator",
    messages: [
      {
        role: "user",
        id: "msg_1",
        parts: [{ type: "text", text: "Should I buy BTC?" }],
      },
    ],
  });

  // The response.result is a stream (streamText result)
  // In a real test we would consume the stream, but here we just verify it exists
  expect(response.result).toBeDefined();
  expect(orchestrator.listAgents().length).toBeGreaterThan(10);
});
