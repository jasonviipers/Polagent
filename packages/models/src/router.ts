import type { ModelMetricsStore } from "./metrics";
import type { ModelProfile, ModelSelection, TaskSpec, TaskType } from "./types";

export interface ModelRouter {
  select(
    task: TaskSpec,
    options?: { overrideModelId?: string; maxCandidates?: number }
  ): Promise<ModelSelection>;
}

export function createModelRouter(options: {
  profiles: ModelProfile[];
  metrics: ModelMetricsStore;
}): ModelRouter {
  const profiles = options.profiles;

  return {
    async select(
      task: TaskSpec,
      selectOptions?: { overrideModelId?: string; maxCandidates?: number }
    ): Promise<ModelSelection> {
      const override = selectOptions?.overrideModelId;
      const maxCandidates = selectOptions?.maxCandidates ?? 3;

      if (override) {
        const profile = profiles.find((p) => p.id === override);
        if (profile) {
          return {
            primary: profile,
            candidates: [profile],
            reason: "manual_override",
          };
        }
      }

      const enabledEligible = profiles
        .filter((p) => p.enabledByDefault)
        .filter((p) => matchesRequirements(p, task))
        .filter((p) => matchesBudget(p, task));
      const eligible =
        enabledEligible.length > 0
          ? enabledEligible
          : profiles
              .filter((p) => matchesRequirements(p, task))
              .filter((p) => matchesBudget(p, task));

      const scored = await Promise.all(
        eligible.map(async (p) => ({
          profile: p,
          score: await scoreProfile(p, task, options.metrics),
        }))
      );

      scored.sort((a, b) => b.score - a.score);
      const candidates =
        scored.length > 0
          ? scored.slice(0, Math.max(1, maxCandidates)).map((s) => s.profile)
          : profiles.slice(0, Math.max(1, maxCandidates));
      const primary = candidates[0] ?? profiles[0];
      if (!primary) {
        throw new Error("No model profiles configured.");
      }

      return {
        primary,
        candidates,
        reason: `auto:${task.taskType}:${task.priority}`,
      };
    },
  };
}

function matchesRequirements(profile: ModelProfile, task: TaskSpec) {
  const required = task.required;
  if (!required) {
    return true;
  }
  if (required.tools && !profile.capabilities.supportsTools) {
    return false;
  }
  if (required.jsonOutput && !profile.capabilities.supportsJson) {
    return false;
  }
  if (required.longContext && !profile.capabilities.supportsLongContext) {
    return false;
  }
  return true;
}

function matchesBudget(profile: ModelProfile, task: TaskSpec) {
  const budget = task.budget;
  if (!budget) {
    return true;
  }
  if (
    budget.maxLatencyMs != null &&
    profile.latency.p95Ms > budget.maxLatencyMs
  ) {
    return false;
  }
  return true;
}

async function scoreProfile(
  profile: ModelProfile,
  task: TaskSpec,
  metrics: ModelMetricsStore
) {
  const baseSuitability = suitability(profile, task.taskType);
  const stats = await metrics.get(profile.id, task.taskType);

  const errorRate = stats && stats.calls > 0 ? stats.errors / stats.calls : 0;
  const reliability = clamp(1 - errorRate, 0.2, 1);
  const latencyMs = stats?.ewmaLatencyMs ?? profile.latency.p50Ms;

  const costScore =
    profile.cost.inputUsdPer1kTokens + profile.cost.outputUsdPer1kTokens > 0
      ? 1 /
        (profile.cost.inputUsdPer1kTokens + profile.cost.outputUsdPer1kTokens)
      : 1;
  const latencyScore = 1000 / Math.max(200, latencyMs);

  let priorityBoost: number;
  if (task.priority === "quality") {
    priorityBoost = 1;
  } else if (task.priority === "latency") {
    priorityBoost = latencyScore;
  } else {
    priorityBoost = costScore;
  }

  return baseSuitability * reliability * priorityBoost;
}

function suitability(profile: ModelProfile, taskType: TaskType) {
  return profile.suitability[taskType] ?? 0.5;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
