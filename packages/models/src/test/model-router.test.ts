import { InMemoryModelMetricsStore } from "../metrics";
import { createModelRouter } from "../router";
import type { ModelProfile } from "../types";
import { expect, test } from "bun:test";

const baseProfile = (id: string): ModelProfile => ({
  id,
  provider: "openai",
  modelName: id,
  enabledByDefault: true,
  cost: { inputUsdPer1kTokens: 1, outputUsdPer1kTokens: 1 },
  latency: { p50Ms: 1000, p95Ms: 3000 },
  capabilities: {
    supportsTools: true,
    supportsJson: true,
    supportsLongContext: true,
    maxContextTokens: 128_000,
  },
  suitability: {
    tradingDecision: 0.5,
    marketAnalysis: 0.5,
    search: 0.5,
    summarization: 0.5,
    extraction: 0.5,
  },
});

test("router honors manual override", async () => {
  const metrics = new InMemoryModelMetricsStore();
  const profiles = [
    baseProfile("openai:gpt-4o-mini"),
    baseProfile("google:gemini-2.5-flash"),
  ];
  profiles[1].enabledByDefault = false;
  const router = createModelRouter({ profiles, metrics });

  const selection = await router.select(
    {
      taskType: "marketAnalysis",
      priority: "quality",
      required: { tools: true },
    },
    { overrideModelId: "google:gemini-2.5-flash" }
  );

  expect(selection.primary.id).toBe("google:gemini-2.5-flash");
  expect(selection.reason).toBe("manual_override");
});

test("router avoids models with high observed error rate", async () => {
  const metrics = new InMemoryModelMetricsStore();
  const a = baseProfile("openai:gpt-4o-mini");
  const b = baseProfile("google:gemini-2.5-flash");
  a.suitability.marketAnalysis = 0.9;
  b.suitability.marketAnalysis = 0.7;
  const router = createModelRouter({ profiles: [a, b], metrics });

  for (let i = 0; i < 20; i++) {
    await metrics.record({
      modelId: a.id,
      taskType: "marketAnalysis",
      latencyMs: 900,
      outcome: "error",
      timestamp: new Date(),
    });
  }

  const selection = await router.select({
    taskType: "marketAnalysis",
    priority: "quality",
    required: { tools: true },
  });

  expect(selection.primary.id).toBe(b.id);
});

test("router falls back to non-default profiles when no enabled models match", async () => {
  const metrics = new InMemoryModelMetricsStore();
  const a = baseProfile("openai:gpt-4o-mini");
  a.enabledByDefault = false;
  a.capabilities.supportsTools = false;
  const b = baseProfile("anthropic:claude-3-5-sonnet-latest");
  b.enabledByDefault = false;
  b.capabilities.supportsTools = true;
  b.suitability.tradingDecision = 0.9;
  const router = createModelRouter({ profiles: [a, b], metrics });

  const selection = await router.select({
    taskType: "tradingDecision",
    priority: "quality",
    required: { tools: true },
  });

  expect(selection.primary.id).toBe(b.id);
  expect(selection.candidates.length).toBeGreaterThan(0);
});
