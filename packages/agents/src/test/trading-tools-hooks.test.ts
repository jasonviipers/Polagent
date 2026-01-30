import { expect, test } from "bun:test";

import { AgentToolError } from "../errors";
import { createTradingTools } from "../tools/trading-tools";
import type { MarketSnapshot } from "../types";

test("executeTrade hook enforces daily trade limit", async () => {
  const snapshot: MarketSnapshot = {
    id: "market_1",
    question: "Test?",
    category: "Test",
    liquidity: 100_000,
    volume24h: 1000,
    outcomes: [
      { id: "yes", label: "Yes", price: 0.6 },
      { id: "no", label: "No", price: 0.4 },
    ],
    updatedAt: new Date(),
  };

  const dataSource = {
    getMarketSnapshot: async () => snapshot,
    listMarketIds: async () => ["market_1"],
    executeTrade: async () => ({
      status: "success",
      txId: "t1",
      filledPrice: 0.6,
    }),
  };

  const state = { tradesToday: 0 };

  const tools = createTradingTools({
    dataSource,
    beforeExecuteTrade: () => {
      if (state.tradesToday >= 1) {
        throw new AgentToolError("Daily trade limit reached", "executeTrade");
      }
    },
    afterExecuteTrade: (result) => {
      if (result.status === "success") {
        state.tradesToday += 1;
      }
    },
  });

  const first = await tools.executeTrade.execute({
    marketId: "market_1",
    outcomeId: "yes",
    side: "buy",
    size: 10,
    maxSlippage: 0.02,
  });
  expect(first.status).toBe("success");
  expect(state.tradesToday).toBe(1);

  await expect(() =>
    tools.executeTrade.execute({
      marketId: "market_1",
      outcomeId: "yes",
      side: "buy",
      size: 10,
      maxSlippage: 0.02,
    })
  ).toThrow();
});
