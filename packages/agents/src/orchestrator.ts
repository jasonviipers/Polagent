import { type LanguageModel, tool, type UIMessage } from "ai";
import { z } from "zod";
import { TradingAgent } from "./agents/trading-agent";
import { AgentConfigError } from "./errors";
import type { AgentMemoryStore } from "./memory/memory-store";
import {
  createTradingTools,
  type MarketDataSource,
} from "./tools/trading-tools";
import type { AgentConfig, AgentStrategy } from "./types";

export class AgentOrchestrator {
  private readonly activeAgents = new Map<string, TradingAgent>();
  private readonly agentConfigs = new Map<string, AgentConfig>();
  private readonly tradingTools: any;
  private readonly options: {
    model: LanguageModel;
    memory: AgentMemoryStore;
    dataSource: MarketDataSource;
  };

  constructor(options: {
    model: LanguageModel;
    memory: AgentMemoryStore;
    dataSource: MarketDataSource;
    agentConfigs?: AgentConfig[];
  }) {
    this.options = options;
    this.tradingTools = createTradingTools({ dataSource: options.dataSource });
    const configs = options.agentConfigs ?? defaultAgentConfigs();

    for (const config of configs) {
      this.agentConfigs.set(config.id, config);
    }

    // Always ensure at least one orchestrator is ready
    this.getAgent("agent_orchestrator");
  }

  listAgents(): Array<{ id: string; name: string; strategy: AgentStrategy }> {
    return Array.from(this.agentConfigs.values()).map((c) => ({
      id: c.id,
      name: c.name,
      strategy: c.strategy,
    }));
  }

  getAgent(agentId: string): TradingAgent {
    // Check if agent is already active
    let agent = this.activeAgents.get(agentId);
    if (agent) {
      return agent;
    }

    // Check if we have a config for this agentId
    const config = this.agentConfigs.get(agentId);
    if (!config) {
      throw new AgentConfigError(`Unknown agentId: ${agentId}`);
    }

    // Spawn the agent on-demand
    agent = new TradingAgent({
      config,
      model: this.options.model,
      tools: this.tradingTools,
      memory: this.options.memory,
    });

    // Inject orchestrator tools if it's an orchestrator
    if (config.strategy === "orchestrator") {
      this.injectOrchestratorTools(agent);
    }

    this.activeAgents.set(agentId, agent);
    return agent;
  }

  private injectOrchestratorTools(agent: TradingAgent) {
    const delegateTasks = tool({
      description:
        "Delegate multiple subtasks to specialized agents in parallel.",
      inputSchema: z.object({
        tasks: z
          .array(
            z.object({
              id: z.string().describe("Unique identifier for this task."),
              agentId: z
                .string()
                .describe("The ID of the specialized agent to use."),
              taskDescription: z
                .string()
                .describe("What the agent should analyze or do."),
              dependsOn: z
                .array(z.string())
                .optional()
                .describe(
                  "IDs of tasks that must complete before this one starts."
                ),
            })
          )
          .max(100),
      }),
      strict: true,
      execute: async ({ tasks }) => {
        const startTime = Date.now();
        const orchestrationOverhead = 1;
        const DECISION_DEADLINE_MS = 30_000;

        try {
          const results = new Map<string, any>();
          const executionResults: any[] = [];
          let totalCriticalSteps = orchestrationOverhead;
          let totalLatencyMs = 0;

          // Wrap the entire scheduling loop in a deadline
          await Promise.race([
            (async () => {
              const taskMap = new Map(tasks.map((t) => [t.id, t]));
              const remainingTasks = new Set(tasks.map((t) => t.id));

              while (remainingTasks.size > 0) {
                const currentStageTasks = Array.from(remainingTasks).filter(
                  (taskId) => {
                    const task = taskMap.get(taskId)!;
                    return (
                      !task.dependsOn ||
                      task.dependsOn.every((depId) => results.has(depId))
                    );
                  }
                );

                if (currentStageTasks.length === 0) {
                  throw new Error("Circular dependency detected in tasks");
                }

                const stageResults = await Promise.all(
                  currentStageTasks.map(async (taskId) => {
                    const task = taskMap.get(taskId)!;
                    const subAgent = this.getAgent(task.agentId);
                    const subStartTime = Date.now();

                    let enrichedDescription = task.taskDescription;
                    if (task.dependsOn && task.dependsOn.length > 0) {
                      const depContext = task.dependsOn
                        .map(
                          (id) =>
                            `Result of ${id}: ${JSON.stringify(results.get(id))}`
                        )
                        .join("\n");
                      enrichedDescription = `${task.taskDescription}\n\nContext from previous tasks:\n${depContext}`;
                    }

                    const response = await subAgent.respond({
                      threadId: `swarm_${startTime}`,
                      incomingMessages: [
                        {
                          role: "user",
                          id: `task_${Date.now()}`,
                          parts: [{ type: "text", text: enrichedDescription }],
                        },
                      ],
                      taskType: subAgent.config.strategy,
                    });

                    const subDuration = Date.now() - subStartTime;
                    const steps =
                      typeof (response as any).steps === "function"
                        ? (response as any).steps()
                        : 1;

                    return {
                      id: task.id,
                      agentId: task.agentId,
                      strategy: subAgent.config.strategy,
                      result: response.result,
                      latencyMs: subDuration,
                      steps,
                    };
                  })
                );

                for (const res of stageResults) {
                  results.set(res.id, res.result);
                  remainingTasks.delete(res.id);
                  executionResults.push(res);
                  totalLatencyMs += res.latencyMs;
                }

                totalCriticalSteps += Math.max(
                  ...stageResults.map((r) => r.steps),
                  0
                );
              }
            })(),
            new Promise<void>((_, reject) =>
              setTimeout(
                () =>
                  reject(
                    new Error(
                      `Decision deadline of ${DECISION_DEADLINE_MS}ms exceeded`
                    )
                  ),
                DECISION_DEADLINE_MS
              )
            ),
          ]);

          const wallClockTimeMs = Date.now() - startTime;
          const slowestTask =
            executionResults.length > 0
              ? executionResults.reduce((prev, current) =>
                  prev.latencyMs > current.latencyMs ? prev : current
                )
              : null;

          return {
            results: executionResults,
            parallelizationMetrics: {
              totalSubagents: tasks.length,
              wallClockTimeMs,
              criticalSteps: totalCriticalSteps,
              latencyReductionVsSequential: totalLatencyMs / wallClockTimeMs,
              serialCollapseDetected: tasks.length < 3,
              bottleneckAgent: slowestTask?.agentId,
              bottleneckDurationMs: slowestTask?.latencyMs,
              parallelismEfficiency: tasks.length / (wallClockTimeMs / 1000), // simplistic concurrent agents per second
            },
          };
        } catch (error) {
          return {
            error: error instanceof Error ? error.message : String(error),
            parallelizationMetrics: {
              totalSubagents: tasks.length,
              wallClockTimeMs: Date.now() - startTime,
              status: "failed",
            },
          };
        }
      },
    });

    (agent as any).tools.delegateTasks = delegateTasks;
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
    mk("orchestrator", 0),
    mk("momentum", 200),
    mk("contrarian", 200),
    mk("arbitrage", 200),
    mk("news", 200),
    mk("risk_parity", 200),
    mk("crypto_technical_analyst", 200),
    mk("macro_economist_agent", 200),
    mk("news_aggregator", 200),
    mk("volatility_analyst", 200),
    mk("correlation_analyst", 200),
    mk("liquidity_scanner", 200),
    mk("risk_manager", 200),
    mk("stock_fundamental_analyst", 200),
    mk("polymarket_sentiment_analyst", 200),
    mk("order_executor", 200),
    mk("portfolio_rebalancer", 200),
    mk("event_monitor", 200),
    mk("backtest_validator", 200),
    mk("polymarket_arbitrageur", 200),
    mk("outcome_predictor", 200),
    mk("resolution_monitor", 200),
    mk("market_maker", 200),
  ];
}
