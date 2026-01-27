import { createAnthropic } from "@ai-sdk/anthropic";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { google } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel, LanguageModelMiddleware } from "ai";
import { wrapLanguageModel } from "ai";

import type { ModelId, ProviderId } from "./types";

export interface ProviderConfig {
  google?: {
    apiKey?: string;
  };
  openai?: {
    apiKey?: string;
    organization?: string;
    project?: string;
    baseURL?: string;
  };
  anthropic?: {
    apiKey?: string;
    baseURL?: string;
  };
  deepseek?: {
    apiKey?: string;
    baseURL?: string;
  };
  openaiCompatible?: Record<
    string,
    {
      apiKey?: string;
      baseURL: string;
      providerName: string;
      modelName: string;
    }
  >;
}

export interface ModelRegistry {
  getModel(modelId: ModelId): LanguageModel;
}

export function createModelRegistry(options: {
  providerConfig: ProviderConfig;
  middleware?: LanguageModelMiddleware;
}): ModelRegistry {
  const cache = new Map<string, LanguageModel>();

  const openaiProvider = createOpenAI({
    apiKey: options.providerConfig.openai?.apiKey,
    organization: options.providerConfig.openai?.organization,
    project: options.providerConfig.openai?.project,
    baseURL: options.providerConfig.openai?.baseURL,
  });

  const anthropicProvider = createAnthropic({
    apiKey: options.providerConfig.anthropic?.apiKey,
    baseURL: options.providerConfig.anthropic?.baseURL,
  });

  const deepseekProvider = createDeepSeek({
    apiKey: options.providerConfig.deepseek?.apiKey,
    baseURL: options.providerConfig.deepseek?.baseURL,
  });

  function parseModelId(modelId: string): {
    provider: ProviderId;
    modelName: string;
  } {
    const idx = modelId.indexOf(":");
    if (idx === -1) {
      return { provider: "openai", modelName: modelId };
    }
    const provider = modelId.slice(0, idx) as ProviderId;
    const modelName = modelId.slice(idx + 1);
    return { provider, modelName };
  }

  function wrap(model: LanguageModel): LanguageModel {
    if (!options.middleware) {
      return model;
    }
    return wrapLanguageModel({
      model,
      middleware: options.middleware,
    }) as LanguageModel;
  }

  function build(modelId: string): LanguageModel {
    const parsed = parseModelId(modelId);
    if (parsed.provider === "google") {
      return wrap(google(parsed.modelName));
    }
    if (parsed.provider === "openai") {
      return wrap(openaiProvider(parsed.modelName));
    }
    if (parsed.provider === "anthropic") {
      return wrap(anthropicProvider(parsed.modelName));
    }
    if (parsed.provider === "deepseek") {
      return wrap(deepseekProvider(parsed.modelName));
    }
    if (parsed.provider === "openai_compatible") {
      const cfg = options.providerConfig.openaiCompatible?.[parsed.modelName];
      if (!cfg) {
        return wrap(openaiProvider(parsed.modelName));
      }
      const provider = createOpenAI({
        apiKey: cfg.apiKey,
        baseURL: cfg.baseURL,
        name: cfg.providerName,
      });
      return wrap(provider(cfg.modelName));
    }
    return wrap(openaiProvider(parsed.modelName));
  }

  return {
    getModel(modelId: ModelId): LanguageModel {
      const cached = cache.get(modelId);
      if (cached) {
        return cached;
      }
      const built = build(modelId);
      cache.set(modelId, built);
      return built;
    },
  };
}
