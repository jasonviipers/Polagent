import { devToolsMiddleware } from "@ai-sdk/devtools";
import { google } from "@ai-sdk/google";
import { cors } from "@elysiajs/cors";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { AgentOrchestrator, InMemoryAgentMemoryStore, PolymarketMarketDataSource } from "@polagent/agents";
import { createContext } from "@polagent/api/context";
import { appRouter } from "@polagent/api/routers/index";
import { auth } from "@polagent/auth";
import { env } from "@polagent/env/server";
import {
  createModelRegistry,
  createModelRouter,
  defaultModelProfiles,
  estimateCostUsd,
  InMemoryModelMetricsStore,
  logModelCall,
  type ModelProfile,
} from "@polagent/models";
import { PolymarketClient } from "@polagent/polymarket-sdk";
import {
  convertToModelMessages,
  streamText,
  type UIMessage,
  wrapLanguageModel,
} from "ai";
import { Elysia } from "elysia";
import { z } from "zod";

const agentMemory = new InMemoryAgentMemoryStore();

// Initialize Polymarket Client and Data Source
const polymarketClient = new PolymarketClient(
  {
    apiKey: env.POLYMARKET_API_KEY || "",
    apiSecret: env.POLYMARKET_API_SECRET || "",
    baseUrl: env.POLYMARKET_BASE_URL,
    chainId: env.POLYMARKET_CHAIN_ID,
    rpcUrl: env.POLYMARKET_RPC_URL,
  },
  env.POLYMARKET_WALLET_PRIVATE_KEY || ""
);
const dataSource = new PolymarketMarketDataSource(polymarketClient);

const modelMetrics = new InMemoryModelMetricsStore();
const modelProfiles = applyEnabledModels(
  defaultModelProfiles(),
  env.MODEL_ROUTER_ENABLED_MODELS
);
const modelRegistry = createModelRegistry({
  providerConfig: {
    google: { apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY },
    openai: { apiKey: env.OPENAI_API_KEY, baseURL: env.OPENAI_BASE_URL },
    anthropic: {
      apiKey: env.ANTHROPIC_API_KEY,
      baseURL: env.ANTHROPIC_BASE_URL,
    },
    deepseek: { apiKey: env.DEEPSEEK_API_KEY, baseURL: env.DEEPSEEK_BASE_URL },
  },
  middleware: devToolsMiddleware(),
});
const modelRouter = createModelRouter({
  profiles: modelProfiles,
  metrics: modelMetrics,
});
const agentModel = wrapLanguageModel({
  model: google(env.AGENT_LLM_MODEL),
  middleware: devToolsMiddleware(),
});
const agentOrchestrator = new AgentOrchestrator({
  model: agentModel,
  memory: agentMemory,
  dataSource,
});

const rpcHandler = new RPCHandler(appRouter, {
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
});
const apiHandler = new OpenAPIHandler(appRouter, {
  plugins: [
    new OpenAPIReferencePlugin({
      schemaConverters: [new ZodToJsonSchemaConverter()],
    }),
  ],
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
});

new Elysia()
  .use(
    cors({
      origin: env.CORS_ORIGIN,
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
      credentials: true,
    })
  )
  .all("/api/auth/*", (context) => {
    const { request, status } = context;
    if (["POST", "GET"].includes(request.method)) {
      return auth.handler(request);
    }
    return status(405);
  })
  .all("/rpc*", async (context) => {
    const { response } = await rpcHandler.handle(context.request, {
      prefix: "/rpc",
      context: await createContext({ context }),
    });
    return response ?? new Response("Not Found", { status: 404 });
  })
  .all("/api*", async (context) => {
    const { response } = await apiHandler.handle(context.request, {
      prefix: "/api-reference",
      context: await createContext({ context }),
    });
    return response ?? new Response("Not Found", { status: 404 });
  })
  .post("/ai", async (context) => {
    const body = await context.request.json().catch(() => ({}));
    const parsed = z
      .object({
        messages: z.array(z.unknown()).default([]),
        modelOverride: z.string().optional(),
      })
      .parse(body);
    const uiMessages = parsed.messages as unknown[];
    const selection = await modelRouter.select(
      {
        taskType: "summarization",
        priority: "latency",
        required: { tools: false },
      },
      {
        overrideModelId: parsed.modelOverride,
        maxCandidates: env.MODEL_ROUTER_MAX_CANDIDATES,
      }
    );

    const chosen = pickFirstUsableModel(selection.candidates);
    const model = modelRegistry.getModel(chosen.id);
    const startedAt = Date.now();
    const result = streamText({
      model,
      messages: await convertToModelMessages(uiMessages as UIMessage[]),
      onFinish: async (event) => {
        const latencyMs = Date.now() - startedAt;
        const costUsd = estimateCostUsd(chosen, event.totalUsage);
        await modelMetrics.record({
          modelId: chosen.id,
          taskType: "summarization",
          latencyMs,
          inputTokens: event.totalUsage.inputTokens ?? undefined,
          outputTokens: event.totalUsage.outputTokens ?? undefined,
          costUsd,
          outcome:
            chosen.id === selection.primary.id ? "success" : "fallback_success",
          timestamp: new Date(),
        });
        logModelCall({
          modelId: chosen.id,
          provider: chosen.provider,
          taskType: "summarization",
          latencyMs,
          inputTokens: event.totalUsage.inputTokens ?? undefined,
          outputTokens: event.totalUsage.outputTokens ?? undefined,
          costUsd,
          outcome:
            chosen.id === selection.primary.id ? "success" : "fallback_success",
          fallbackUsed: chosen.id !== selection.primary.id,
        });
      },
    });

    return result.toUIMessageStreamResponse();
  })
  .get("/ai/agentic/agents", () => {
    return agentOrchestrator.listAgents();
  })
  .post("/ai/agentic", async (context) => {
    const body = await context.request.json().catch(() => ({}));
    const parsed = z
      .object({
        threadId: z.string().min(1).default("demo_thread"),
        agentId: z.string().min(1).default("agent_momentum"),
        messages: z.array(z.unknown()).default([]),
        taskType: z
          .enum([
            "tradingDecision",
            "marketAnalysis",
            "search",
            "summarization",
            "extraction",
          ])
          .default("marketAnalysis"),
        priority: z.enum(["quality", "latency", "cost"]).default("quality"),
        modelOverride: z.string().optional(),
      })
      .parse(body);
    const { threadId, agentId } = parsed;
    const uiMessages = parsed.messages as UIMessage[];

    const selection = await modelRouter.select(
      {
        taskType: parsed.taskType,
        priority: parsed.priority,
        required: { tools: true, jsonOutput: false },
      },
      {
        overrideModelId: parsed.modelOverride,
        maxCandidates: env.MODEL_ROUTER_MAX_CANDIDATES,
      }
    );
    let chosen = pickFirstUsableModel(selection.candidates);
    let response: Awaited<ReturnType<typeof agentOrchestrator.respond>> | null =
      null;

    for (const candidate of selection.candidates) {
      if (!modelIsConfigured(candidate.provider)) {
        continue;
      }
      try {
        const model = modelRegistry.getModel(candidate.id);
        chosen = candidate;
        response = await agentOrchestrator.respond({
          threadId,
          agentId,
          messages: uiMessages,
          modelOverride: model,
          taskType: parsed.taskType,
          onModelFinish: async (event) => {
            const costUsd = estimateCostUsd(chosen, event.totalUsage);
            await modelMetrics.record({
              modelId: chosen.id,
              taskType: parsed.taskType,
              latencyMs: event.latencyMs,
              inputTokens: event.totalUsage.inputTokens ?? undefined,
              outputTokens: event.totalUsage.outputTokens ?? undefined,
              costUsd,
              outcome:
                chosen.id === selection.primary.id
                  ? "success"
                  : "fallback_success",
              timestamp: new Date(),
            });
            logModelCall({
              modelId: chosen.id,
              provider: chosen.provider,
              taskType: parsed.taskType,
              latencyMs: event.latencyMs,
              inputTokens: event.totalUsage.inputTokens ?? undefined,
              outputTokens: event.totalUsage.outputTokens ?? undefined,
              costUsd,
              outcome:
                chosen.id === selection.primary.id
                  ? "success"
                  : "fallback_success",
              fallbackUsed: chosen.id !== selection.primary.id,
            });
          },
        });
        break;
      } catch (err) {
        await modelMetrics.record({
          modelId: candidate.id,
          taskType: parsed.taskType,
          latencyMs: 0,
          outcome: "error",
          errorType: err instanceof Error ? err.name : "unknown",
          timestamp: new Date(),
        });
        logModelCall({
          modelId: candidate.id,
          provider: candidate.provider,
          taskType: parsed.taskType,
          latencyMs: 0,
          outcome: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (!response) {
      throw new Error("No configured models available for this request.");
    }

    const { result, originalMessages, onFinish } = response;

    return result.toUIMessageStreamResponse({
      originalMessages,
      onFinish,
    });
  })
  .get("/ai/models/stats", () => {
    return modelMetrics.list();
  })
  .get("/ai/models/profiles", () => {
    return modelProfiles;
  })
  .get("/ai/agentic/history/:threadId", ({ params }) => {
    return agentMemory.load(params.threadId);
  })
  .get("/", () => "OK")
  .listen(3000, () => {
    console.log("Server is running on http://localhost:3000");
  });

function applyEnabledModels(
  profiles: ModelProfile[],
  enabled: string | undefined
): ModelProfile[] {
  if (!enabled) {
    return profiles;
  }
  const ids = enabled
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (ids.length === 0) {
    return profiles;
  }
  const set = new Set(ids);
  return profiles.map((p) => ({ ...p, enabledByDefault: set.has(p.id) }));
}

function pickFirstUsableModel(profiles: ModelProfile[]): ModelProfile {
  const fallback = profiles[0] ?? defaultModelProfiles()[0];
  if (!fallback) {
    throw new Error("No model profiles configured.");
  }
  for (const p of profiles) {
    if (p.provider === "google") {
      return p;
    }
    if (p.provider === "openai" && env.OPENAI_API_KEY) {
      return p;
    }
    if (p.provider === "anthropic" && env.ANTHROPIC_API_KEY) {
      return p;
    }
    if (p.provider === "deepseek" && env.DEEPSEEK_API_KEY) {
      return p;
    }
  }
  return fallback;
}

function modelIsConfigured(provider: string) {
  if (provider === "google") {
    return true;
  }
  if (provider === "openai") {
    return Boolean(env.OPENAI_API_KEY);
  }
  if (provider === "anthropic") {
    return Boolean(env.ANTHROPIC_API_KEY);
  }
  if (provider === "deepseek") {
    return Boolean(env.DEEPSEEK_API_KEY);
  }
  return false;
}
