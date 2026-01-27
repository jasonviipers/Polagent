import type { ModelId, ModelOutcome, TaskType } from "./types";

export interface ModelCallMetrics {
  modelId: ModelId;
  taskType: TaskType;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  outcome: ModelOutcome;
  errorType?: string;
  timestamp: Date;
}

export interface ModelRollingStats {
  modelId: ModelId;
  taskType: TaskType;
  calls: number;
  errors: number;
  ewmaLatencyMs?: number;
  ewmaCostUsd?: number;
  lastCallAt?: Date;
  lastErrorAt?: Date;
}

export interface ModelMetricsStore {
  record(metrics: ModelCallMetrics): Promise<void>;
  get(modelId: ModelId, taskType: TaskType): Promise<ModelRollingStats | null>;
  list(): Promise<ModelRollingStats[]>;
}

export class InMemoryModelMetricsStore implements ModelMetricsStore {
  private readonly stats = new Map<string, ModelRollingStats>();
  private readonly alpha: number;

  constructor(alpha = 0.2) {
    this.alpha = alpha;
  }

  private key(modelId: string, taskType: string) {
    return `${modelId}::${taskType}`;
  }

  async record(metrics: ModelCallMetrics): Promise<void> {
    const key = this.key(metrics.modelId, metrics.taskType);
    const existing = this.stats.get(key);
    const next: ModelRollingStats = existing
      ? { ...existing }
      : {
          modelId: metrics.modelId,
          taskType: metrics.taskType,
          calls: 0,
          errors: 0,
        };

    next.calls += 1;
    if (metrics.outcome === "error" || metrics.outcome === "fallback_error") {
      next.errors += 1;
      next.lastErrorAt = metrics.timestamp;
    }
    next.lastCallAt = metrics.timestamp;

    next.ewmaLatencyMs = ewma(
      next.ewmaLatencyMs,
      metrics.latencyMs,
      this.alpha
    );
    if (metrics.costUsd != null) {
      next.ewmaCostUsd = ewma(next.ewmaCostUsd, metrics.costUsd, this.alpha);
    }

    this.stats.set(key, next);
  }

  async get(
    modelId: ModelId,
    taskType: TaskType
  ): Promise<ModelRollingStats | null> {
    return this.stats.get(this.key(modelId, taskType)) ?? null;
  }

  async list(): Promise<ModelRollingStats[]> {
    return [...this.stats.values()].sort(
      (a, b) => (b.lastCallAt?.getTime() ?? 0) - (a.lastCallAt?.getTime() ?? 0)
    );
  }
}

function ewma(current: number | undefined, value: number, alpha: number) {
  if (current == null) {
    return value;
  }
  return alpha * value + (1 - alpha) * current;
}
