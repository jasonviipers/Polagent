import type { ModelProfile } from "./types";

export function defaultModelProfiles(): ModelProfile[] {
  return [
    {
      id: "google:gemini-2.5-flash",
      provider: "google",
      modelName: "gemini-2.5-flash",
      enabledByDefault: true,
      cost: { inputUsdPer1kTokens: 0.0, outputUsdPer1kTokens: 0.0 },
      latency: { p50Ms: 700, p95Ms: 2500 },
      capabilities: {
        supportsTools: true,
        supportsJson: true,
        supportsLongContext: true,
        maxContextTokens: 1_000_000,
      },
      suitability: {
        tradingDecision: 0.78,
        marketAnalysis: 0.8,
        search: 0.7,
        summarization: 0.75,
        extraction: 0.7,
      },
    },
    {
      id: "google:gemini-2.5-pro",
      provider: "google",
      modelName: "gemini-2.5-pro",
      enabledByDefault: false,
      cost: { inputUsdPer1kTokens: 0.0, outputUsdPer1kTokens: 0.0 },
      latency: { p50Ms: 1400, p95Ms: 5000 },
      capabilities: {
        supportsTools: true,
        supportsJson: true,
        supportsLongContext: true,
        maxContextTokens: 1_000_000,
      },
      suitability: {
        tradingDecision: 0.86,
        marketAnalysis: 0.9,
        search: 0.75,
        summarization: 0.82,
        extraction: 0.78,
      },
    },
    {
      id: "openai:gpt-4o-mini",
      provider: "openai",
      modelName: "gpt-4o-mini",
      enabledByDefault: true,
      cost: { inputUsdPer1kTokens: 0.0, outputUsdPer1kTokens: 0.0 },
      latency: { p50Ms: 650, p95Ms: 2200 },
      capabilities: {
        supportsTools: true,
        supportsJson: true,
        supportsLongContext: true,
        maxContextTokens: 128_000,
      },
      suitability: {
        tradingDecision: 0.75,
        marketAnalysis: 0.76,
        search: 0.7,
        summarization: 0.74,
        extraction: 0.74,
      },
    },
    {
      id: "openai:gpt-4o",
      provider: "openai",
      modelName: "gpt-4o",
      enabledByDefault: false,
      cost: { inputUsdPer1kTokens: 0.0, outputUsdPer1kTokens: 0.0 },
      latency: { p50Ms: 900, p95Ms: 3200 },
      capabilities: {
        supportsTools: true,
        supportsJson: true,
        supportsLongContext: true,
        maxContextTokens: 128_000,
      },
      suitability: {
        tradingDecision: 0.85,
        marketAnalysis: 0.86,
        search: 0.76,
        summarization: 0.82,
        extraction: 0.8,
      },
    },
    {
      id: "anthropic:claude-3-5-sonnet-latest",
      provider: "anthropic",
      modelName: "claude-3-5-sonnet-latest",
      enabledByDefault: false,
      cost: { inputUsdPer1kTokens: 0.0, outputUsdPer1kTokens: 0.0 },
      latency: { p50Ms: 1100, p95Ms: 4200 },
      capabilities: {
        supportsTools: true,
        supportsJson: true,
        supportsLongContext: true,
        maxContextTokens: 200_000,
      },
      suitability: {
        tradingDecision: 0.84,
        marketAnalysis: 0.9,
        search: 0.78,
        summarization: 0.83,
        extraction: 0.8,
      },
    },
    {
      id: "deepseek:deepseek-chat",
      provider: "deepseek",
      modelName: "deepseek-chat",
      enabledByDefault: false,
      cost: { inputUsdPer1kTokens: 0.0, outputUsdPer1kTokens: 0.0 },
      latency: { p50Ms: 750, p95Ms: 2800 },
      capabilities: {
        supportsTools: true,
        supportsJson: true,
        supportsLongContext: true,
        maxContextTokens: 64_000,
      },
      suitability: {
        tradingDecision: 0.72,
        marketAnalysis: 0.74,
        search: 0.66,
        summarization: 0.7,
        extraction: 0.7,
      },
    },
  ];
}

export function modelProfileById(
  profiles: ModelProfile[],
  id: string
): ModelProfile | null {
  return profiles.find((p) => p.id === id) ?? null;
}
