import { expect, test } from "bun:test";
import { generateText, stepCountIs } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { createTradingTools, type MarketDataSource } from "../tools/trading-tools";

// Minimal in-test data source to replace the removed shared MockMarketDataSource
const testDataSource: MarketDataSource = {
  async getMarketSnapshot(marketId: string) {
    if (marketId === "market_demo_bitcoin_100k_feb_2026") {
      return {
        id: "market_demo_bitcoin_100k_feb_2026",
        question: "Will Bitcoin hit $100k by Feb 2026?",
        category: "Crypto",
        liquidity: 50000,
        volume24h: 120000,
        outcomes: [
          { id: "outcome_yes", label: "Yes", price: 0.65 },
          { id: "outcome_no", label: "No", price: 0.35 },
        ],
        updatedAt: new Date(),
      };
    }
    return null;
  },
  async listMarketIds() {
    return ["market_demo_bitcoin_100k_feb_2026"];
  },
  async executeTrade(params) {
    return {
      status: "success",
      txId: "test_tx_id",
      filledPrice: params.price,
    };
  }
};

function usage() {
  return {
    inputTokens: {
      total: 1,
      noCache: 1,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: { total: 1, text: 1, reasoning: undefined },
  };
}

test("agent flow can call tools and produce a final response", async () => {
  const tools = createTradingTools({ dataSource: testDataSource });

  const model = new MockLanguageModelV3({
    doGenerate: [
      {
        content: [
          {
            type: "tool-call",
            toolCallId: "tc1",
            toolName: "listMarkets",
            input: JSON.stringify({}),
          },
        ],
        finishReason: { unified: "tool-calls", raw: undefined },
        usage: usage(),
        warnings: [],
      },
      {
        content: [
          {
            type: "tool-call",
            toolCallId: "tc2",
            toolName: "analyzeMarket",
            input: JSON.stringify({
              marketId: "market_demo_bitcoin_100k_feb_2026",
              strategy: "momentum",
              minLiquidity: 10_000,
            }),
          },
        ],
        finishReason: { unified: "tool-calls", raw: undefined },
        usage: usage(),
        warnings: [],
      },
      {
        content: [
          {
            type: "tool-call",
            toolCallId: "tc3",
            toolName: "calculateRisk",
            input: JSON.stringify({
              marketId: "market_demo_bitcoin_100k_feb_2026",
              side: "buy",
              size: 50,
              currentCapital: 200,
              riskLevel: "medium",
              maxDrawdown: 0.4,
            }),
          },
        ],
        finishReason: { unified: "tool-calls", raw: undefined },
        usage: usage(),
        warnings: [],
      },
      {
        content: [
          {
            type: "tool-call",
            toolCallId: "tc4",
            toolName: "executeTrade",
            input: JSON.stringify({
              marketId: "market_demo_bitcoin_100k_feb_2026",
              outcomeId: "outcome_yes",
              side: "buy",
              size: 50,
              maxSlippage: 0.02,
              reasoning: "Momentum setup with sufficient liquidity.",
            }),
          },
        ],
        finishReason: { unified: "tool-calls", raw: undefined },
        usage: usage(),
        warnings: [],
      },
      {
        content: [
          { type: "text", text: "Decision: executed trade in demo mode." },
        ],
        finishReason: { unified: "stop", raw: undefined },
        usage: usage(),
        warnings: [],
      },
    ],
  });

  const result = await generateText({
    model,
    tools,
    stopWhen: stepCountIs(10),
    prompt: "Scan markets and trade if criteria are met.",
  });

  expect(result.text).toContain("executed trade");
  expect(result.steps.length).toBeGreaterThanOrEqual(4);
  const toolNames = result.steps
    .flatMap((s) => s.toolCalls ?? [])
    .map((c) => c.toolName);
  expect(toolNames).toEqual(
    expect.arrayContaining(["analyzeMarket", "calculateRisk", "executeTrade"])
  );
});
