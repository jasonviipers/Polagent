import type { LanguageModel, LanguageModelUsage, UIMessage } from "ai";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  validateUIMessages,
} from "ai";

import { mergeConversation } from "../conversation";
import type { AgentMemoryStore } from "../memory/memory-store";
import type { TradingToolset } from "../tools/trading-tools";
import type { AgentConfig, AgentRuntimeState, AgentStrategy } from "../types";

function strategySystemPrompt(strategy: AgentStrategy) {
  const shared = [
    "You are an autonomous trading agent operating in a simulated Polymarket environment.",
    "Use tools to inspect markets, quantify risk, and execute trades only when justified.",
    "Always call calculateRisk before executeTrade.",
    "If confidence is low or liquidity is insufficient, recommend hold.",
    "When you trade, include a concise rationale and the key signals.",
  ].join("\n");

  const byStrategy: Record<AgentStrategy, string> = {
    momentum:
      "Focus on trends and directional movement; prefer continuation setups.",
    contrarian:
      "Focus on overreactions; prefer mean reversion setups and clear stop levels.",
    arbitrage:
      "Focus on pricing inconsistencies; avoid directional exposure when possible.",
    news: "Focus on event-driven signals and rapid repricing; emphasize recency.",
    risk_parity:
      "Focus on balanced exposure and risk-adjusted returns; prioritize drawdown control.",
  };

  return `${shared}\n\nStrategy:\n${byStrategy[strategy]}`;
}

export class TradingAgent {
  readonly config: AgentConfig;
  readonly state: AgentRuntimeState;
  private readonly model: LanguageModel;
  private readonly tools: TradingToolset;
  private readonly memory: AgentMemoryStore;

  constructor(options: {
    config: AgentConfig;
    state?: Partial<AgentRuntimeState>;
    model: LanguageModel;
    tools: TradingToolset;
    memory: AgentMemoryStore;
  }) {
    this.config = options.config;
    this.model = options.model;
    this.tools = options.tools;
    this.memory = options.memory;
    this.state = {
      currentCapital: options.config.initialCapital,
      tradesToday: 0,
      maxDrawdownObserved: 0,
      paused: false,
      ...options.state,
    };
  }

  async respond(options: {
    threadId: string;
    incomingMessages: UIMessage[];
    modelOverride?: LanguageModel;
    taskType?: string;
    onModelFinish?: (event: {
      modelId: string;
      taskType: string;
      totalUsage: LanguageModelUsage;
      finishReason: string;
      latencyMs: number;
    }) => Promise<void> | void;
  }): Promise<{
    result: unknown;
    originalMessages: UIMessage[];
    onFinish: (options: { messages: UIMessage[] }) => Promise<void>;
  }> {
    const model = options.modelOverride ?? this.model;
    const previous = await this.memory.load(options.threadId);
    const merged = mergeConversation({
      previous,
      incoming: options.incomingMessages,
      maxMessages: 60,
    });

    const validated = await validateUIMessages({
      // biome-ignore lint/suspicious/noExplicitAny: Vercel AI SDK typing mismatch
      messages: merged as any,
      // biome-ignore lint/suspicious/noExplicitAny: Vercel AI SDK typing mismatch
      tools: this.tools as any,
    });

    const startedAt = Date.now();
    const result = streamText({
      model,
      system: [
        strategySystemPrompt(this.config.strategy),
        `Agent name: ${this.config.name}`,
        `Current capital: ${this.state.currentCapital}`,
        `Risk level: ${this.config.riskLevel}`,
        `Trades today: ${this.state.tradesToday}/${this.config.maxTradesPerDay}`,
        `Max drawdown limit: ${this.config.maxDrawdown}`,
      ].join("\n"),
      // biome-ignore lint/suspicious/noExplicitAny: Vercel AI SDK typing mismatch
      tools: this.tools as any,
      stopWhen: stepCountIs(10),
      // biome-ignore lint/suspicious/noExplicitAny: Vercel AI SDK typing mismatch
      messages: await convertToModelMessages(validated as any),
      onFinish: async (event) => {
        const latencyMs = Date.now() - startedAt;
        if (options.onModelFinish) {
          await options.onModelFinish({
            // biome-ignore lint/suspicious/noExplicitAny: Accessing internal property
            modelId: (model as any).modelId ?? "unknown",
            taskType: options.taskType ?? "unknown",
            totalUsage: event.totalUsage,
            finishReason: event.finishReason,
            latencyMs,
          });
        }
      },
      onError: (error) => {
        console.error(error);
      },
    });

    return {
      result,
      originalMessages: merged,
      onFinish: async ({ messages }: { messages: UIMessage[] }) => {
        await this.memory.save(options.threadId, messages);
      },
    };
  }
}
