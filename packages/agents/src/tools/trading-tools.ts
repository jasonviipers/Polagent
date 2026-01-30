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
  // New methods for swarm agents
  getTechnicalIndicators?(marketId: string): Promise<Record<string, number>>;
  getNews?(
    query: string
  ): Promise<Array<{ title: string; content: string; score: number }>>;
  getMacroData?(indicator: string): Promise<Record<string, unknown>>;
  getVolatilityMetrics?(
    marketId: string
  ): Promise<{ vix?: number; impliedVolatility?: number }>;
  getCorrelations?(
    marketId: string,
    baseAsset: string
  ): Promise<Record<string, number>>;
  // Even more methods for advanced swarm
  backtest?(
    strategy: AgentStrategy,
    params: Record<string, any>
  ): Promise<{ sharpe: number; winRate: number; drawdown: number }>;
  optimize?(positions: any[]): Promise<any>;
  scanArbitrage?(): Promise<any[]>;
  getEvents?(): Promise<any[]>;
  predict?(
    marketId: string
  ): Promise<{ probability: number; confidence: number }>;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getRiskFactor(riskLevel: "low" | "medium" | "high"): number {
  if (riskLevel === "high") {
    return 1.4;
  }
  if (riskLevel === "medium") {
    return 1.0;
  }
  return 0.7;
}

function calculateConfidence(strategy: AgentStrategy, spread: number): number {
  if (strategy === "momentum") {
    return 0.55 + clamp(spread, 0, 0.3);
  }
  if (strategy === "contrarian") {
    return 0.45 + clamp(1 - spread, 0, 0.3);
  }
  if (strategy === "risk_parity") {
    return 0.5;
  }
  if (strategy === "news") {
    return 0.52;
  }
  return 0.48;
}

function getRecommendation(confidence: number): "buy" | "sell" | "hold" {
  if (confidence > 0.65) {
    return "buy";
  }
  if (confidence < 0.4) {
    return "sell";
  }
  return "hold";
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
  const riskFactor = getRiskFactor(riskLevel);
  return clamp(size * (0.08 + liquidityPenalty) * riskFactor, 0, size);
}

export function createTradingTools(options: {
  dataSource: MarketDataSource;
  now?: () => Date;
  beforeExecuteTrade?: (params: {
    marketId: string;
    outcomeId: string;
    side: TradeSide;
    size: number;
    maxSlippage: number;
  }) => void | Promise<void>;
  afterExecuteTrade?: (result: ExecutionResult) => void | Promise<void>;
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
      const baseConfidence = calculateConfidence(strategy, spread);
      const recommendation = getRecommendation(baseConfidence);
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
    }: {
      marketId: string;
      outcomeId: string;
      side: TradeSide;
      size: number;
      maxSlippage: number;
    }): Promise<ExecutionResult> => {
      if (options.beforeExecuteTrade) {
        await options.beforeExecuteTrade({
          marketId,
          outcomeId,
          side,
          size,
          maxSlippage,
        });
      }

      const snapshot = await options.dataSource.getMarketSnapshot(marketId);
      if (!snapshot) {
        throw new AgentToolError("Market not found", "executeTrade");
      }

      const outcome = snapshot.outcomes.find((o) => o.id === outcomeId);
      if (!outcome) {
        const res: ExecutionResult = {
          status: "rejected",
          reason: "Outcome not found",
        };
        if (options.afterExecuteTrade) {
          await options.afterExecuteTrade(res);
        }
        return res;
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

      const result = await options.dataSource.executeTrade({
        marketId,
        outcomeId,
        side,
        size,
        price: limitPrice,
      });

      if (options.afterExecuteTrade) {
        await options.afterExecuteTrade(result);
      }

      return result;
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

  const getTechnicalIndicators = tool({
    description:
      "Get technical indicators like RSI, MACD, and Bollinger Bands.",
    inputSchema: z.object({
      marketId: z.string().min(1),
    }),
    strict: true,
    execute: async ({ marketId }) => {
      if (!options.dataSource.getTechnicalIndicators) {
        return { error: "Technical indicators not supported by data source" };
      }
      return await options.dataSource.getTechnicalIndicators(marketId);
    },
  });

  const getNews = tool({
    description: "Get real-time news related to a market or asset.",
    inputSchema: z.object({
      query: z.string().min(1),
    }),
    strict: true,
    execute: async ({ query }) => {
      if (!options.dataSource.getNews) {
        return { error: "News not supported by data source" };
      }
      return await options.dataSource.getNews(query);
    },
  });

  const getMacroData = tool({
    description: "Assess Fed policy, inflation, and macro data.",
    inputSchema: z.object({
      indicator: z.string().min(1),
    }),
    strict: true,
    execute: async ({ indicator }) => {
      if (!options.dataSource.getMacroData) {
        return { error: "Macro data not supported by data source" };
      }
      return await options.dataSource.getMacroData(indicator);
    },
  });

  const getVolatilityMetrics = tool({
    description: "Analyze VIX and implied volatility.",
    inputSchema: z.object({
      marketId: z.string().min(1),
    }),
    strict: true,
    execute: async ({ marketId }) => {
      if (!options.dataSource.getVolatilityMetrics) {
        return { error: "Volatility metrics not supported by data source" };
      }
      return await options.dataSource.getVolatilityMetrics(marketId);
    },
  });

  const getCorrelations = tool({
    description: "Identify cross-asset relationships.",
    inputSchema: z.object({
      marketId: z.string().min(1),
      baseAsset: z.string().min(1),
    }),
    strict: true,
    execute: async ({ marketId, baseAsset }) => {
      if (!options.dataSource.getCorrelations) {
        return { error: "Correlations not supported by data source" };
      }
      return await options.dataSource.getCorrelations(marketId, baseAsset);
    },
  });

  const backtestStrategy = tool({
    description: "Validate a trading strategy against historical data.",
    inputSchema: z.object({
      strategy: z.string().min(1),
      parameters: z
        .record(z.string(), z.unknown())
        .describe("Strategy-specific parameters."),
    }),
    strict: true,
    execute: async ({ strategy, parameters }) => {
      if (!options.dataSource.backtest) {
        return { error: "Backtesting not supported by data source" };
      }
      return await options.dataSource.backtest(
        strategy as any,
        parameters as any
      );
    },
  });

  const optimizePortfolio = tool({
    description:
      "Optimize asset allocation to maintain target risk-reward profiles.",
    inputSchema: z.object({
      positions: z
        .array(z.record(z.string(), z.unknown()))
        .describe("Current portfolio positions."),
    }),
    strict: true,
    execute: async ({ positions }) => {
      if (!options.dataSource.optimize) {
        return { error: "Portfolio optimization not supported by data source" };
      }
      return await options.dataSource.optimize(positions);
    },
  });

  const scanArbitrage = tool({
    description:
      "Find and exploit pricing discrepancies across different markets.",
    inputSchema: z.object({}),
    strict: true,
    execute: async () => {
      if (!options.dataSource.scanArbitrage) {
        return { error: "Arbitrage scanning not supported by data source" };
      }
      return await options.dataSource.scanArbitrage();
    },
  });

  const monitorEvents = tool({
    description: "Track upcoming market-moving events like earnings or FOMC.",
    inputSchema: z.object({}),
    strict: true,
    execute: async () => {
      if (!options.dataSource.getEvents) {
        return { error: "Event monitoring not supported by data source" };
      }
      return await options.dataSource.getEvents();
    },
  });

  const predictOutcome = tool({
    description: "Model event probabilities for prediction markets.",
    inputSchema: z.object({
      marketId: z.string().min(1),
    }),
    strict: true,
    execute: async ({ marketId }) => {
      if (!options.dataSource.predict) {
        return { error: "Prediction modeling not supported by data source" };
      }
      return await options.dataSource.predict(marketId);
    },
  });

  return {
    analyzeMarket,
    calculateRisk,
    executeTrade,
    listMarkets,
    getTechnicalIndicators,
    getNews,
    getMacroData,
    getVolatilityMetrics,
    getCorrelations,
    backtestStrategy,
    optimizePortfolio,
    scanArbitrage,
    monitorEvents,
    predictOutcome,
  };
}

export type TradingToolset = ReturnType<typeof createTradingTools>;
