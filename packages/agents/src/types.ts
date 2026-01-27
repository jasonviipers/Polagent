import type { UIMessage } from "ai";

export type AgentStrategy =
  | "momentum"
  | "contrarian"
  | "arbitrage"
  | "news"
  | "risk_parity";

export type AgentRiskLevel = "low" | "medium" | "high";

export interface AgentConfig {
  id: string;
  name: string;
  strategy: AgentStrategy;
  initialCapital: number;
  riskLevel: AgentRiskLevel;
  maxTradesPerDay: number;
  maxDrawdown: number;
  strategyParameters: {
    confidenceThreshold: number;
    positionSizePercent: number;
    stopLossPercent: number;
    takeProfitPercent: number;
    maxHoldingPeriod: number;
    minLiquidity: number;
  };
}

export interface AgentRuntimeState {
  currentCapital: number;
  tradesToday: number;
  maxDrawdownObserved: number;
  paused: boolean;
}

export interface MarketOutcome {
  id: string;
  label: string;
  price: number;
}

export interface MarketSnapshot {
  id: string;
  question: string;
  category?: string;
  liquidity: number;
  volume24h: number;
  outcomes: MarketOutcome[];
  updatedAt: Date;
}

export type TradeSide = "buy" | "sell";

export interface ProposedTrade {
  marketId: string;
  outcomeId: string;
  side: TradeSide;
  size: number;
  maxSlippage: number;
  reasoning: string;
}

export interface MarketAnalysis {
  market: MarketSnapshot;
  recommendation: "buy" | "sell" | "hold";
  confidence: number;
  reasoning: string;
  proposedTrade?: ProposedTrade;
  signals: Record<string, number | string | boolean>;
}

export interface RiskAssessment {
  approved: boolean;
  recommendedSize: number;
  metrics: {
    maxPositionSize: number;
    sizeRatio: number;
    estimatedVar95: number;
    estimatedDrawdownImpact: number;
  };
  reasoning: string;
}

export interface ExecutionResult {
  status: "success" | "rejected" | "failed";
  trade?: ProposedTrade;
  txId?: string;
  filledPrice?: number;
  error?: string;
  reason?: string;
}

export type AgentChatRequest = {
  threadId: string;
  agentId: string;
  messages: UIMessage[];
};
