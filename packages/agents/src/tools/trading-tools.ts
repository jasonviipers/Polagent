import { tool } from "ai";
import { z } from "zod";

import { AgentToolError } from "../errors";
import type {
  AgentStrategy,
  ExecutionResult,
  MarketAnalysis,
  MarketSnapshot,
  ProposedTrade,
  RiskAssessment,
  TradeSide,
} from "../types";

export interface MarketDataSource {
  getMarketSnapshot(marketId: string): Promise<MarketSnapshot | null>;
  listMarketIds(): Promise<string[]>;
  executeTrade(params: {
    marketId: string;
    outcomeId: string;
    side: TradeSide;
    size: number;
    price: number;
  }): Promise<ExecutionResult>;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function estimateVar95({
  size,
  liquidity,
  riskLevel,
}: {
  size: number;
  liquidity: number;
  riskLevel: "low" | "medium" | "high";
}): number {
  const liquidityPenalty = clamp(size / Math.max(liquidity, 1), 0, 1);
  const riskFactor =
    riskLevel === "high" ? 1.4 : riskLevel === "medium" ? 1.0 : 0.7;
  return clamp(size * (0.08 + liquidityPenalty) * riskFactor, 0, size);
}

export function createTradingTools(options: {
  dataSource: MarketDataSource;
  now?: () => Date;
}) {
  const now = options.now ?? (() => new Date());

  const analyzeMarket = tool({
    description:
      "Analyze a prediction market for strategy-aligned opportunities.",
    inputSchema: z.object({
      marketId: z.string().min(1),
      strategy: z.enum([
        "momentum",
        "contrarian",
        "arbitrage",
        "news",
        "risk_parity",
      ]),
      minLiquidity: z.number().nonnegative().optional(),
    }),
    strict: true,
    execute: async ({
      marketId,
      strategy,
      minLiquidity,
    }: {
      marketId: string;
      strategy: AgentStrategy;
      minLiquidity?: number;
    }): Promise<MarketAnalysis> => {
      const snapshot = await options.dataSource.getMarketSnapshot(marketId);
      if (!snapshot) {
        throw new AgentToolError("Market not found", "analyzeMarket");
      }

      if (minLiquidity != null && snapshot.liquidity < minLiquidity) {
        return {
          market: snapshot,
          recommendation: "hold",
          confidence: 0.15,
          reasoning: `Liquidity ${snapshot.liquidity} below threshold ${minLiquidity}.`,
          signals: { liquidity: snapshot.liquidity, minLiquidity },
        };
      }

      const yes = snapshot.outcomes[0];
      const no = snapshot.outcomes[1];
      if (!(yes && no)) {
        throw new AgentToolError("Market outcomes missing", "analyzeMarket");
      }
      const spread = Math.abs(yes.price - no.price);
      const baseConfidence =
        strategy === "momentum"
          ? 0.55 + clamp(spread, 0, 0.3)
          : strategy === "contrarian"
            ? 0.45 + clamp(1 - spread, 0, 0.3)
            : strategy === "risk_parity"
              ? 0.5
              : strategy === "news"
                ? 0.52
                : 0.48;

      const recommendation =
        yes.price > 0.6 ? "buy" : yes.price < 0.35 ? "sell" : "hold";
      const confidence = clamp(baseConfidence, 0.05, 0.95);

      const proposedTrade: ProposedTrade | undefined =
        recommendation === "hold"
          ? undefined
          : {
              marketId: snapshot.id,
              outcomeId: recommendation === "buy" ? yes.id : no.id,
              side: recommendation as TradeSide,
              size: 50,
              maxSlippage: 0.02,
              reasoning: `Strategy=${strategy}. Spread=${spread.toFixed(2)}. Liquidity=${snapshot.liquidity}.`,
            };

      return {
        market: { ...snapshot, updatedAt: now() },
        recommendation,
        confidence,
        reasoning: `Strategy=${strategy}. Recommendation=${recommendation}. Confidence=${confidence.toFixed(2)}.`,
        proposedTrade,
        signals: {
          spread,
          liquidity: snapshot.liquidity,
          volume24h: snapshot.volume24h,
        },
      };
    },
  });

  const calculateRisk = tool({
    description:
      "Calculate risk metrics and decide if a trade fits risk limits.",
    inputSchema: z.object({
      marketId: z.string().min(1),
      side: z.enum(["buy", "sell"]),
      size: z.number().positive(),
      currentCapital: z.number().positive(),
      riskLevel: z.enum(["low", "medium", "high"]),
      maxDrawdown: z.number().min(0).max(1),
    }),
    strict: true,
    execute: async ({
      marketId,
      size,
      currentCapital,
      riskLevel,
      maxDrawdown,
    }: {
      marketId: string;
      side: TradeSide;
      size: number;
      currentCapital: number;
      riskLevel: "low" | "medium" | "high";
      maxDrawdown: number;
    }): Promise<RiskAssessment> => {
      const snapshot = await options.dataSource.getMarketSnapshot(marketId);
      if (!snapshot) {
        throw new AgentToolError("Market not found", "calculateRisk");
      }

      const maxPositionSize = currentCapital * 0.2;
      const sizeRatio = size / Math.max(currentCapital, 1);
      const estimatedVar95 = estimateVar95({
        size,
        liquidity: snapshot.liquidity,
        riskLevel,
      });
      const estimatedDrawdownImpact = clamp(
        estimatedVar95 / Math.max(currentCapital, 1),
        0,
        1
      );

      const approved =
        size <= maxPositionSize &&
        estimatedDrawdownImpact <= maxDrawdown &&
        snapshot.liquidity >= size * 10;

      const recommendedSize = Math.min(size, maxPositionSize);

      const reasoning = approved
        ? `Approved. size=${size}, maxPositionSize=${maxPositionSize.toFixed(2)}, estVaR95=${estimatedVar95.toFixed(2)}.`
        : `Rejected. size=${size}, maxPositionSize=${maxPositionSize.toFixed(2)}, estVaR95=${estimatedVar95.toFixed(2)}, liquidity=${snapshot.liquidity}.`;

      return {
        approved,
        recommendedSize,
        metrics: {
          maxPositionSize,
          sizeRatio,
          estimatedVar95,
          estimatedDrawdownImpact,
        },
        reasoning,
      };
    },
  });

  const executeTrade = tool({
    description: "Execute a real trade on the market.",
    inputSchema: z.object({
      marketId: z.string().min(1),
      outcomeId: z.string().min(1),
      side: z.enum(["buy", "sell"]),
      size: z.number().positive(),
      maxSlippage: z.number().min(0).max(0.2),
      reasoning: z.string().min(1).optional(),
    }),
    strict: true,
    execute: async ({
      marketId,
      outcomeId,
      side,
      size,
      maxSlippage,
      reasoning,
    }: {
      marketId: string;
      outcomeId: string;
      side: TradeSide;
      size: number;
      maxSlippage: number;
      reasoning?: string;
    }): Promise<ExecutionResult> => {
      const snapshot = await options.dataSource.getMarketSnapshot(marketId);
      if (!snapshot) {
        throw new AgentToolError("Market not found", "executeTrade");
      }

      const outcome = snapshot.outcomes.find((o) => o.id === outcomeId);
      if (!outcome) {
        return { status: "rejected", reason: "Outcome not found" };
      }

      const slippage = clamp(
        size / Math.max(snapshot.liquidity, 1),
        0,
        maxSlippage
      );
      const limitPrice =
        side === "buy"
          ? outcome.price * (1 + slippage)
          : outcome.price * (1 - slippage);

      return options.dataSource.executeTrade({
        marketId,
        outcomeId,
        side,
        size,
        price: limitPrice,
      });
    },
  });

  const listMarkets = tool({
    description: "List available market ids that can be analyzed.",
    inputSchema: z.object({}),
    strict: true,
    execute: async (): Promise<{ marketIds: string[] }> => {
      try {
        return { marketIds: await options.dataSource.listMarketIds() };
      } catch (err) {
        throw new AgentToolError(
          `Failed to list markets: ${String(err)}`,
          "listMarkets",
          err
        );
      }
    },
  });

  return {
    analyzeMarket,
    calculateRisk,
    executeTrade,
    listMarkets,
  };
}

export type TradingToolset = ReturnType<typeof createTradingTools>;
