import type { LanguageModelUsage } from "ai";

import type { ModelProfile, TaskType } from "./types";

export interface ModelCallLogEntry {
  modelId: string;
  provider: string;
  taskType: TaskType;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  outcome: "success" | "error" | "fallback_success" | "fallback_error";
  error?: string;
  fallbackUsed?: boolean;
}

export function estimateCostUsd(
  profile: ModelProfile,
  usage: LanguageModelUsage | undefined
) {
  const input = usage?.inputTokens ?? 0;
  const output = usage?.outputTokens ?? 0;
  const inputCost = (input / 1000) * profile.cost.inputUsdPer1kTokens;
  const outputCost = (output / 1000) * profile.cost.outputUsdPer1kTokens;
  const total = inputCost + outputCost;
  return Number.isFinite(total) ? total : undefined;
}

export function logModelCall(entry: ModelCallLogEntry) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    ...entry,
  });
  console.log(line);
}
