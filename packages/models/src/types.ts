export type ProviderId =
  | "google"
  | "openai"
  | "anthropic"
  | "deepseek"
  | "openai_compatible";

export type ModelId = string;

export type TaskType =
  | "tradingDecision"
  | "marketAnalysis"
  | "search"
  | "summarization"
  | "extraction";

export type TaskPriority = "quality" | "latency" | "cost";

export interface TaskBudget {
  maxDollars?: number;
  maxLatencyMs?: number;
  maxInputTokens?: number;
}

export interface TaskRequirements {
  tools?: boolean;
  jsonOutput?: boolean;
  longContext?: boolean;
}

export interface TaskSpec {
  taskType: TaskType;
  priority: TaskPriority;
  budget?: TaskBudget;
  required?: TaskRequirements;
}

export interface ModelCostProfile {
  inputUsdPer1kTokens: number;
  outputUsdPer1kTokens: number;
}

export interface ModelLatencyProfile {
  p50Ms: number;
  p95Ms: number;
}

export interface ModelSuitability {
  tradingDecision: number;
  marketAnalysis: number;
  search: number;
  summarization: number;
  extraction: number;
}

export interface ModelCapabilities {
  supportsTools: boolean;
  supportsJson: boolean;
  supportsLongContext: boolean;
  maxContextTokens: number;
}

export interface ModelProfile {
  id: ModelId;
  provider: ProviderId;
  modelName: string;
  enabledByDefault: boolean;
  cost: ModelCostProfile;
  latency: ModelLatencyProfile;
  capabilities: ModelCapabilities;
  suitability: ModelSuitability;
}

export interface ModelSelection {
  primary: ModelProfile;
  candidates: ModelProfile[];
  reason: string;
}

export type ModelOutcome =
  | "success"
  | "error"
  | "fallback_success"
  | "fallback_error";
