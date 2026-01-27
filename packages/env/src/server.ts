import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    CORS_ORIGIN: z.url(),
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    POLYMARKET_USDC_ADDRESS: z.string().min(1),
    POLYMARKET_API_KEY: z.string().min(1).optional(),
    POLYMARKET_API_SECRET: z.string().min(1).optional(),
    POLYMARKET_WALLET_PRIVATE_KEY: z.string().min(1).optional(),
    POLYMARKET_BASE_URL: z.url().default("https://clob.polymarket.com"),
    POLYMARKET_RPC_URL: z.url().default("https://polygon-rpc.com"),
    POLYMARKET_CHAIN_ID: z.coerce.number().int().default(137),
    GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1).optional(),
    OPENAI_API_KEY: z.string().min(1).optional(),
    OPENAI_BASE_URL: z.url().optional(),
    ANTHROPIC_API_KEY: z.string().min(1).optional(),
    ANTHROPIC_BASE_URL: z.url().optional(),
    DEEPSEEK_API_KEY: z.string().min(1).optional(),
    DEEPSEEK_BASE_URL: z.url().optional(),
    AGENT_LLM_MODEL: z.string().min(1).default("gemini-2.5-flash"),
    MODEL_ROUTER_MAX_CANDIDATES: z.coerce
      .number()
      .int()
      .min(1)
      .max(10)
      .default(3),
    MODEL_ROUTER_ENABLED_MODELS: z.string().optional(),
    AI_SDK_TELEMETRY_ENABLED: z.coerce.boolean().default(false),
    NEWS_API_KEY: z.string().min(1),
    NEWS_API_BASE_URL: z.url().default("https://newsapi.org/v2"),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
