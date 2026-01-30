import { expect, test } from "bun:test";

import { PolymarketClient } from "../client";

test("getMarkets maps Gamma markets into PolymarketMarket", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (!url.includes("gamma-api.polymarket.com/markets")) {
      return new Response("not found", { status: 404 });
    }

    return Response.json([
      {
        id: "market_1",
        question: "Will it rain tomorrow?",
        description: "Test market",
        category: "Weather",
        endDate: "2026-01-01T00:00:00Z",
        liquidity: "1000",
        volume: "5000",
        outcomes: [
          {
            id: "token_yes",
            name: "Yes",
            price: "0.6",
            probability: "0.6",
          },
          {
            id: "token_no",
            name: "No",
            price: "0.4",
            probability: "0.4",
          },
        ],
        bestBid: "0.59",
        bestAsk: "0.61",
        spread: "0.02",
        active: true,
        status: "active",
      },
    ]);
  };

  try {
    const client = new PolymarketClient(
      {
        apiKey: "test",
        apiSecret: "test",
        baseUrl: "https://clob.polymarket.com",
        gammaUrl: "https://gamma-api.polymarket.com",
        chainId: 137,
        rpcUrl: "https://polygon-rpc.com",
      },
      ""
    );

    const markets = await client.getMarkets("active");
    expect(markets).toHaveLength(1);
    expect(markets[0]?.id).toBe("market_1");
    expect(markets[0]?.outcomes).toHaveLength(2);
    expect(markets[0]?.outcomes[0]?.id).toBe("token_yes");
    expect(markets[0]?.outcomes[0]?.name).toBe("Yes");
    expect(markets[0]?.outcomes[0]?.price).toBeCloseTo(0.6);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
