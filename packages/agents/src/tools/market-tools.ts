import type {
  PolymarketClient,
  PolymarketMarket,
} from "@polagent/polymarket-sdk";
import type { ExecutionResult, MarketSnapshot, TradeSide } from "../types";
import type { MarketDataSource } from "./trading-tools";

function convertToMarketSnapshot(market: PolymarketMarket): MarketSnapshot {
  return {
    id: market.id,
    question: market.question,
    category: market.category,
    liquidity: market.liquidity,
    volume24h: market.volume, // Using volume as volume24h (Polymarket API provides total volume)
    // biome-ignore lint/suspicious/noExplicitAny: SDK outcome type not fully typed
    outcomes: market.outcomes.map((outcome: any) => ({
      id: outcome.id,
      label: outcome.name,
      price: outcome.price,
    })),
    updatedAt: new Date(),
  };
}

export class PolymarketMarketDataSource implements MarketDataSource {
  private readonly client: PolymarketClient;

  constructor(client: PolymarketClient) {
    this.client = client;
  }

  async getMarketSnapshot(marketId: string): Promise<MarketSnapshot | null> {
    const market = await this.client.getMarketById(marketId);
    if (!market) {
      return null;
    }
    return convertToMarketSnapshot(market);
  }

  async listMarketIds(): Promise<string[]> {
    const markets = await this.client.getMarkets("active");
    return markets.map((m) => m.id);
  }

  async executeTrade(params: {
    marketId: string;
    outcomeId: string;
    side: TradeSide;
    size: number;
    price: number;
  }): Promise<ExecutionResult> {
    try {
      const order = await this.client.createOrder({
        marketId: params.marketId,
        outcomeId: params.outcomeId,
        side: params.side,
        size: params.size,
        price: params.price,
        type: "limit",
      });

      return {
        status: "success",
        txId: order.id,
        filledPrice: order.price,
      };
    } catch (error: unknown) {
      return {
        status: "rejected",
        reason:
          error instanceof Error
            ? error.message
            : "Unknown error during trade execution",
      };
    }
  }
}
