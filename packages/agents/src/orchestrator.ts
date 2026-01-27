import type { LanguageModel, UIMessage } from "ai";
import { TradingAgent } from "./agents/trading-agent";
import { AgentConfigError } from "./errors";
import type { AgentMemoryStore } from "./memory/memory-store";
import { createTradingTools, type MarketDataSource } from "./tools/trading-tools";
import type { AgentConfig, AgentStrategy } from "./types";

export class AgentOrchestrator {
  private readonly agents = new Map<string, TradingAgent>();

  constructor(options: {
    model: LanguageModel;
    memory: AgentMemoryStore;
    dataSource: MarketDataSource;
    agentConfigs?: AgentConfig[];
  }) {
    const tools = createTradingTools({ dataSource: options.dataSource });
    const configs = options.agentConfigs ?? defaultAgentConfigs();

    for (const config of configs) {
      const agent = new TradingAgent({
        config,
        model: options.model,
        tools,
        memory: options.memory,
      });
      this.agents.set(config.id, agent);
    }
  }

  listAgents(): Array<{ id: string; name: string; strategy: AgentStrategy }> {
    return [...this.agents.values()].map((a) => ({
      id: a.config.id,
      name: a.config.name,
      strategy: a.config.strategy,
    }));
  }

  getAgent(agentId: string): TradingAgent {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new AgentConfigError(`Unknown agentId: ${agentId}`);
    }
    return agent;
  }

  async respond(options: {
    threadId: string;
    agentId: string;
    messages: UIMessage[];
    modelOverride?: LanguageModel;
    taskType?: string;
    onModelFinish?: Parameters<TradingAgent["respond"]>[0]["onModelFinish"];
  }): Promise<{
    result: unknown;
    originalMessages: UIMessage[];
    onFinish: (options: { messages: UIMessage[] }) => Promise<void>;
  }> {
    const agent = this.getAgent(options.agentId);
    return (await agent.respond({
      threadId: options.threadId,
      incomingMessages: options.messages,
      modelOverride: options.modelOverride,
      taskType: options.taskType,
      onModelFinish: options.onModelFinish,
    })) as any;
  }
}

export function defaultAgentConfigs(): AgentConfig[] {
  const mk = (
    strategy: AgentStrategy,
    initialCapital: number
  ): AgentConfig => ({
    id: `agent_${strategy}`,
    name:
      strategy === "risk_parity"
        ? "Risk Parity Agent"
        : `${strategy.charAt(0).toUpperCase()}${strategy.slice(1)} Agent`,
    strategy,
    initialCapital,
    riskLevel: strategy === "risk_parity" ? "low" : "medium",
    maxTradesPerDay: strategy === "news" ? 15 : 10,
    maxDrawdown: 0.4,
    strategyParameters: {
      confidenceThreshold: 0.75,
      positionSizePercent: 0.15,
      stopLossPercent: 0.12,
      takeProfitPercent: 0.25,
      maxHoldingPeriod: strategy === "news" ? 6 : 24,
      minLiquidity: 10_000,
    },
  });

  return [
    mk("momentum", 200),
    mk("contrarian", 200),
    mk("arbitrage", 200),
    mk("news", 200),
    mk("risk_parity", 200),
  ];
}
