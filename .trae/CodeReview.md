# Code Review & Improvement Recommendations
## Autonomous Polymarket Trading Agent System

**Review Date:** January 27, 2026  
**Reviewer:** Claude (AI Code Reviewer)  
**Severity Levels:** 🔴 Critical | 🟠 High | 🟡 Medium | 🟢 Low

---

## Executive Summary

**Overall Code Quality:** 7.5/10

The codebase demonstrates solid TypeScript practices with good type safety and clean architecture. However, there are several critical issues around error handling, state management, memory leaks, and missing production-ready features that need attention before deployment with real capital.

**Key Strengths:**
- ✅ Strong type safety with TypeScript strict mode
- ✅ Clean separation of concerns (agents, tools, memory, orchestration)
- ✅ Good use of Vercel AI SDK v6 patterns
- ✅ Comprehensive strategy system design

**Critical Issues Found:**
- 🔴 Agent state not persisted (loss on restart)
- 🔴 No transaction rollback on failures
- 🔴 Race conditions in concurrent operations
- 🔴 Memory leak potential in long-running agents
- 🔴 Missing production monitoring/alerting

---

## 1. Critical Issues (Must Fix Before Production)

### 🔴 Issue #1: Agent State Not Persisted

**File:** `trading-agent.ts`  
**Lines:** 56-64

**Problem:**
```typescript
this.state = {
  currentCapital: options.config.initialCapital,
  tradesToday: 0,
  maxDrawdownObserved: 0,
  paused: false,
  ...options.state,
};
```

The agent state (current capital, trades count, drawdown) is only kept in memory. If the process restarts, all state is lost, leading to:
- Incorrect capital calculations
- Exceeded trade limits not being honored
- Loss of drawdown tracking

**Impact:** High financial risk - agents could exceed limits or miscalculate positions after restart

**Solution:**
```typescript
// Add state persistence to database
export class TradingAgent {
  private async loadState(agentId: string): Promise<AgentRuntimeState> {
    const saved = await db
      .select()
      .from(agentStates)
      .where(eq(agentStates.agentId, agentId))
      .limit(1);
    
    if (saved[0]) {
      return JSON.parse(saved[0].state);
    }
    
    return {
      currentCapital: this.config.initialCapital,
      tradesToday: 0,
      maxDrawdownObserved: 0,
      paused: false,
    };
  }

  private async saveState(): Promise<void> {
    await db
      .insert(agentStates)
      .values({
        agentId: this.config.id,
        state: JSON.stringify(this.state),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: agentStates.agentId,
        set: {
          state: JSON.stringify(this.state),
          updatedAt: new Date(),
        },
      });
  }

  async respond(options: {...}): Promise<{...}> {
    // Load state at start
    this.state = await this.loadState(this.config.id);
    
    // ... existing code ...
    
    // Save state after response
    await this.saveState();
    
    return { result, originalMessages, onFinish };
  }
}
```

---

### 🔴 Issue #2: No Transaction Safety in Tool Execution

**File:** `trading-tools.ts`  
**Lines:** 205-240

**Problem:**
The `executeTrade` tool doesn't handle partial failures. If the trade executes on Polymarket but database logging fails, you have inconsistent state.

```typescript
execute: async ({...}): Promise<ExecutionResult> => {
  // Execute trade
  const result = await options.dataSource.executeTrade({...});
  
  // If this fails, trade is executed but not logged!
  // No rollback mechanism
}
```

**Impact:** Financial reconciliation nightmares, audit trail gaps

**Solution:**
```typescript
// Implement two-phase commit pattern
execute: async ({
  marketId,
  outcomeId,
  side,
  size,
  maxSlippage,
}: {
  marketId: string;
  outcomeId: string;
  side: TradeSide;
  size: number;
  maxSlippage: number;
}): Promise<ExecutionResult> => {
  const snapshot = await options.dataSource.getMarketSnapshot(marketId);
  if (!snapshot) {
    throw new AgentToolError("Market not found", "executeTrade");
  }

  const outcome = snapshot.outcomes.find((o) => o.id === outcomeId);
  if (!outcome) {
    return { status: "rejected", reason: "Outcome not found" };
  }

  const slippage = clamp(
    size / Math.max(snapshot.liquidity, 1),
    0,
    maxSlippage
  );
  const limitPrice =
    side === "buy"
      ? outcome.price * (1 + slippage)
      : outcome.price * (1 - slippage);

  // Begin transaction
  const tradeId = crypto.randomUUID();
  
  try {
    // 1. Create pending trade record
    await db.insert(trades).values({
      id: tradeId,
      marketId,
      outcomeId,
      side,
      size,
      requestedPrice: limitPrice,
      status: "pending",
      createdAt: new Date(),
    });

    // 2. Execute on Polymarket
    const result = await options.dataSource.executeTrade({
      marketId,
      outcomeId,
      side,
      size,
      price: limitPrice,
    });

    // 3. Update trade record with result
    await db
      .update(trades)
      .set({
        status: result.status === "success" ? "filled" : "rejected",
        txId: result.txId,
        filledPrice: result.filledPrice,
        error: result.status === "rejected" ? result.reason : null,
        updatedAt: new Date(),
      })
      .where(eq(trades.id, tradeId));

    return result;
  } catch (error) {
    // Rollback: mark trade as failed
    await db
      .update(trades)
      .set({
        status: "failed",
        error: String(error),
        updatedAt: new Date(),
      })
      .where(eq(trades.id, tradeId));

    throw new AgentToolError(
      `Trade execution failed: ${String(error)}`,
      "executeTrade",
      error
    );
  }
},
```

---

### 🔴 Issue #3: Race Conditions in Agent State Updates

**File:** `trading-agent.ts`  
**Lines:** 70-130

**Problem:**
Multiple concurrent requests to the same agent can cause race conditions:

```typescript
async respond(options: {...}): Promise<{...}> {
  // Load state (read)
  const previous = await this.memory.load(options.threadId);
  
  // ... processing ...
  
  // Save state (write)
  await this.memory.save(options.threadId, messages);
}
```

If two requests run concurrently, they both read the same state, modify it, and write back, causing lost updates.

**Impact:** Trade limit violations, incorrect capital tracking

**Solution:**
```typescript
// Add mutex locking per agent
import { Mutex } from 'async-mutex';

export class TradingAgent {
  private readonly stateMutex = new Mutex();
  
  async respond(options: {...}): Promise<{...}> {
    // Acquire lock for this agent
    const release = await this.stateMutex.acquire();
    
    try {
      // Load state
      this.state = await this.loadState(this.config.id);
      
      // Check if agent should be paused
      if (this.state.paused) {
        throw new AgentError(`Agent ${this.config.id} is paused`);
      }
      
      // Check daily trade limit BEFORE executing
      if (this.state.tradesToday >= this.config.maxTradesPerDay) {
        throw new AgentError(
          `Daily trade limit reached: ${this.state.tradesToday}/${this.config.maxTradesPerDay}`
        );
      }
      
      const model = options.modelOverride ?? this.model;
      const previous = await this.memory.load(options.threadId);
      const merged = mergeConversation({
        previous,
        incoming: options.incomingMessages,
        maxMessages: 60,
      });

      // ... rest of logic ...

      // Update state atomically
      this.state.tradesToday++;
      await this.saveState();
      
      return { result, originalMessages, onFinish };
    } finally {
      // Always release lock
      release();
    }
  }
}
```

---

### 🔴 Issue #4: Memory Leak in StreamText

**File:** `trading-agent.ts`  
**Lines:** 99-120

**Problem:**
The `streamText` result is returned but never consumed. Streams that aren't consumed can leak memory.

```typescript
const result = streamText({
  model,
  system: [...],
  tools: this.tools as any,
  stopWhen: stepCountIs(10),
  messages: await convertToModelMessages(validated as any),
  // ...
});

return {
  result, // Stream never consumed!
  originalMessages: merged,
  onFinish: async ({ messages }: { messages: UIMessage[] }) => {
    await this.memory.save(options.threadId, messages);
  },
};
```

**Impact:** Memory usage grows over time, eventual OOM crashes

**Solution:**
```typescript
// Option 1: Consume stream in respond method
async respond(options: {...}): Promise<{...}> {
  // ... setup code ...

  const result = streamText({...});
  
  // Consume the stream
  const responseText = await result.text;
  const toolCalls = await result.toolCalls;
  
  return {
    text: responseText,
    toolCalls,
    originalMessages: merged,
    onFinish: async ({ messages }: { messages: UIMessage[] }) => {
      await this.memory.save(options.threadId, messages);
    },
  };
}

// Option 2: Make caller responsible for consumption
async respond(options: {...}): Promise<{...}> {
  // Return stream with cleanup handler
  const result = streamText({...});
  
  return {
    result,
    originalMessages: merged,
    onFinish: async ({ messages }: { messages: UIMessage[] }) => {
      await this.memory.save(options.threadId, messages);
    },
    cleanup: async () => {
      // Ensure stream is consumed
      if (result.textStream) {
        for await (const _ of result.textStream) {
          // Drain stream
        }
      }
    },
  };
}
```

---

### 🔴 Issue #5: Missing Daily Trade Counter Reset

**File:** `trading-agent.ts`  
**Lines:** 56-64

**Problem:**
`tradesToday` counter is never reset. Once an agent hits its daily limit, it's stuck forever.

**Solution:**
```typescript
// Add daily reset mechanism
export class TradingAgent {
  private lastResetDate: string = new Date().toISOString().split('T')[0];
  
  private checkAndResetDailyCounters(): void {
    const today = new Date().toISOString().split('T')[0];
    
    if (today !== this.lastResetDate) {
      this.state.tradesToday = 0;
      this.lastResetDate = today;
    }
  }
  
  async respond(options: {...}): Promise<{...}> {
    this.checkAndResetDailyCounters();
    
    // ... rest of logic ...
  }
}

// Or use a scheduled job
// cron: "0 0 * * *" (midnight UTC)
export async function resetAllAgentDailyCounters() {
  await db
    .update(agentStates)
    .set({
      'state.tradesToday': 0,
      updatedAt: new Date(),
    });
}
```

---

## 2. High Priority Issues

### 🟠 Issue #6: Inadequate Error Handling in Tools

**File:** `trading-tools.ts`  
**Lines:** Multiple locations

**Problem:**
Tools throw errors that crash the agent instead of returning structured error responses.

```typescript
if (!snapshot) {
  throw new AgentToolError("Market not found", "analyzeMarket");
}
```

**Solution:**
```typescript
// Return structured errors instead of throwing
execute: async ({...}): Promise<MarketAnalysis | ToolError> => {
  const snapshot = await options.dataSource.getMarketSnapshot(marketId);
  if (!snapshot) {
    return {
      error: true,
      code: "MARKET_NOT_FOUND",
      message: `Market ${marketId} not found`,
      toolName: "analyzeMarket",
    };
  }
  
  // ... continue with normal flow ...
}

// Add ToolError type
export type ToolError = {
  error: true;
  code: string;
  message: string;
  toolName: string;
  recoverable?: boolean;
};

export type ToolResult<T> = T | ToolError;

export function isToolError(result: unknown): result is ToolError {
  return typeof result === 'object' && result !== null && 'error' in result;
}
```

---

### 🟠 Issue #7: No Timeout Protection

**File:** `trading-agent.ts`  
**Lines:** 99-120

**Problem:**
LLM calls can hang indefinitely. No timeout protection.

**Solution:**
```typescript
// Add timeout to all LLM calls
import { withTimeout } from './utils';

const result = await withTimeout(
  streamText({
    model,
    system: [...],
    tools: this.tools as any,
    stopWhen: stepCountIs(10),
    messages: await convertToModelMessages(validated as any),
    onFinish: async (event) => {
      // ... logging ...
    },
  }),
  30000, // 30 second timeout
  () => {
    throw new AgentError('LLM call timed out after 30s');
  }
);

// utils.ts
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  onTimeout: () => void
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => {
        onTimeout();
        reject(new Error(`Operation timed out after ${timeoutMs}ms`));
      }, timeoutMs)
    ),
  ]);
}
```

---

### 🟠 Issue #8: Conversation Memory Growth

**File:** `conversation.ts`  
**Lines:** 32-40

**Problem:**
`mergeConversation` limits to 60 messages, but over time this grows unbounded in storage. Old conversations are never purged.

**Solution:**
```typescript
// Add conversation pruning
export async function pruneOldConversations(
  memory: AgentMemoryStore,
  maxAgeMs: number = 30 * 24 * 60 * 60 * 1000 // 30 days
): Promise<void> {
  const cutoffDate = new Date(Date.now() - maxAgeMs);
  
  // Implement in memory store
  for (const [threadId, messages] of memory.store.entries()) {
    if (messages.length === 0) continue;
    
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.createdAt && lastMessage.createdAt < cutoffDate) {
      await memory.clear(threadId);
    }
  }
}

// Add to RedisAgentMemoryStore
export class RedisAgentMemoryStore implements AgentMemoryStore {
  async save(threadId: string, messages: UIMessage[]): Promise<void> {
    const key = this.keyPrefix + threadId;
    try {
      // Set with TTL (30 days)
      await this.redis.set(
        key,
        JSON.stringify(messages),
        'EX',
        30 * 24 * 60 * 60
      );
    } catch (err) {
      throw new AgentMemoryError(
        `Failed to save agent memory for threadId=${threadId}: ${String(err)}`
      );
    }
  }
}
```

---

### 🟠 Issue #9: Missing Input Validation

**File:** `orchestrator.ts`  
**Lines:** 49-67

**Problem:**
No validation of user inputs before passing to agents.

```typescript
async respond(options: {
  threadId: string;
  agentId: string;
  messages: UIMessage[];
  // No validation!
}): Promise<{...}> {
  const agent = this.getAgent(options.agentId);
  return await agent.respond({...});
}
```

**Solution:**
```typescript
import { z } from 'zod';

const RespondOptionsSchema = z.object({
  threadId: z.string().uuid(),
  agentId: z.string().startsWith('agent_'),
  messages: z.array(z.object({
    id: z.string(),
    role: z.enum(['user', 'assistant']),
    content: z.string().max(10000), // Prevent huge inputs
  })).min(1).max(100),
  modelOverride: z.any().optional(),
  taskType: z.string().optional(),
});

async respond(options: {
  threadId: string;
  agentId: string;
  messages: UIMessage[];
  modelOverride?: LanguageModel;
  taskType?: string;
}): Promise<{...}> {
  // Validate inputs
  const validated = RespondOptionsSchema.parse(options);
  
  const agent = this.getAgent(validated.agentId);
  return await agent.respond({...validated});
}
```

---

## 3. Medium Priority Issues

### 🟡 Issue #10: Hardcoded Configuration Values

**File:** `orchestrator.ts`  
**Lines:** 71-101

**Problem:**
Strategy parameters are hardcoded in `defaultAgentConfigs()`. Should be configurable.

**Solution:**
```typescript
// Move to environment or config file
export interface SystemConfig {
  agents: {
    defaultCapital: number;
    strategies: Record<AgentStrategy, Partial<AgentConfig>>;
  };
}

export function loadSystemConfig(): SystemConfig {
  return {
    agents: {
      defaultCapital: Number(process.env.DEFAULT_AGENT_CAPITAL ?? 200),
      strategies: {
        momentum: {
          riskLevel: 'medium',
          maxTradesPerDay: 10,
          strategyParameters: {
            confidenceThreshold: 0.75,
            positionSizePercent: 0.15,
            stopLossPercent: 0.12,
            takeProfitPercent: 0.25,
            maxHoldingPeriod: 24,
            minLiquidity: 10_000,
          },
        },
        // ... other strategies ...
      },
    },
  };
}

export function defaultAgentConfigs(
  config: SystemConfig = loadSystemConfig()
): AgentConfig[] {
  // Use config values instead of hardcoded
}
```

---

### 🟡 Issue #11: Insufficient Logging

**File:** `trading-agent.ts`  
**Lines:** Throughout

**Problem:**
No structured logging for debugging production issues.

**Solution:**
```typescript
import { logger } from './logger';

export class TradingAgent {
  async respond(options: {...}): Promise<{...}> {
    logger.info('Agent decision started', {
      agentId: this.config.id,
      threadId: options.threadId,
      strategy: this.config.strategy,
      currentCapital: this.state.currentCapital,
      tradesToday: this.state.tradesToday,
    });
    
    try {
      // ... existing logic ...
      
      logger.info('Agent decision completed', {
        agentId: this.config.id,
        threadId: options.threadId,
        toolCallsCount: result.toolCalls?.length ?? 0,
        finishReason: event.finishReason,
        latencyMs,
      });
      
      return { result, originalMessages, onFinish };
    } catch (error) {
      logger.error('Agent decision failed', {
        agentId: this.config.id,
        threadId: options.threadId,
        error: String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }
}

// logger.ts
import winston from 'winston';

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'agent-system.log' }),
  ],
});
```

---

### 🟡 Issue #12: No Retry Logic for API Failures

**File:** `market-tools.ts`  
**Lines:** 54-78

**Problem:**
API calls fail permanently on transient errors.

**Solution:**
```typescript
// Add exponential backoff retry
async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelayMs = 1000,
    maxDelayMs = 10000,
  } = options;

  let lastError: unknown;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (attempt < maxRetries) {
        const delay = Math.min(
          baseDelayMs * Math.pow(2, attempt),
          maxDelayMs
        );
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
}

// Use in market data source
export class PolymarketMarketDataSource implements MarketDataSource {
  async getMarketSnapshot(marketId: string): Promise<MarketSnapshot | null> {
    return withRetry(
      async () => {
        const market = await this.client.getMarketById(marketId);
        if (!market) {
          return null;
        }
        return convertToMarketSnapshot(market);
      },
      { maxRetries: 3, baseDelayMs: 1000 }
    );
  }
}
```

---

### 🟡 Issue #13: Weak Type Safety (Any Types)

**File:** Multiple files  
**Problem:**
Multiple uses of `any` type bypass TypeScript safety.

```typescript
// trading-agent.ts
messages: merged as any,
tools: this.tools as any,
```

**Solution:**
```typescript
// Create proper type bridges
import type { 
  ToolSet,
  ValidatedMessages,
} from 'ai';

// trading-tools.ts
export type TradingToolset = {
  analyzeMarket: ToolDefinition<...>;
  calculateRisk: ToolDefinition<...>;
  executeTrade: ToolDefinition<...>;
  listMarkets: ToolDefinition<...>;
};

// trading-agent.ts
const validated = await validateUIMessages({
  messages: merged,
  tools: this.tools,
}) as ValidatedMessages; // More specific cast

const result = streamText({
  model,
  system: [...],
  tools: this.tools satisfies ToolSet, // Verify type compatibility
  stopWhen: stepCountIs(10),
  messages: await convertToModelMessages(validated),
});
```

---

## 4. Low Priority / Code Quality Issues

### 🟢 Issue #14: Duplicate Code Files

**Files:** Multiple duplicates

**Problem:**
You have duplicate files uploaded:
- conversation.ts (2 copies)
- errors.ts (2 copies)
- index.ts (2 copies)
- orchestrator.ts (2 copies)
- types.ts (2 copies)
- trading-agent.ts (2 copies)

**Solution:** Remove duplicates, ensure single source of truth

---

### 🟢 Issue #15: Missing JSDoc Comments

**Problem:**
Complex functions lack documentation.

**Solution:**
```typescript
/**
 * Analyzes a prediction market and generates trading recommendations
 * based on the specified strategy.
 * 
 * @param marketId - Unique identifier for the Polymarket market
 * @param strategy - Trading strategy to apply (momentum, contrarian, etc.)
 * @param minLiquidity - Minimum market liquidity required (in USD)
 * @returns Market analysis with recommendation and confidence score
 * @throws {AgentToolError} If market not found or analysis fails
 * 
 * @example
 * const analysis = await analyzeMarket({
 *   marketId: 'market_123',
 *   strategy: 'momentum',
 *   minLiquidity: 10000
 * });
 */
execute: async ({
  marketId,
  strategy,
  minLiquidity,
}: {
  marketId: string;
  strategy: AgentStrategy;
  minLiquidity?: number;
}): Promise<MarketAnalysis> => {
  // ... implementation ...
}
```

---

### 🟢 Issue #16: Magic Numbers

**File:** `trading-tools.ts`  
**Lines:** Multiple

**Problem:**
Hardcoded magic numbers reduce maintainability.

```typescript
const maxPositionSize = currentCapital * 0.2; // What is 0.2?
if (confidence > 0.65) { // Why 0.65?
```

**Solution:**
```typescript
// Create constants module
export const RISK_CONSTANTS = {
  MAX_POSITION_SIZE_RATIO: 0.2,
  CONFIDENCE_THRESHOLD_BUY: 0.65,
  CONFIDENCE_THRESHOLD_SELL: 0.4,
  DEFAULT_SLIPPAGE_TOLERANCE: 0.02,
  LIQUIDITY_SAFETY_MULTIPLE: 10,
  VAR_CONFIDENCE_LEVEL: 0.95,
} as const;

// Use in code
const maxPositionSize = currentCapital * RISK_CONSTANTS.MAX_POSITION_SIZE_RATIO;
if (confidence > RISK_CONSTANTS.CONFIDENCE_THRESHOLD_BUY) {
  return "buy";
}
```

---

## 5. Architecture Improvements

### Improvement #1: Add Health Check System

```typescript
// health.ts
export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'down';
  checks: {
    database: boolean;
    api: boolean;
    memory: boolean;
    agents: Record<string, boolean>;
  };
  timestamp: Date;
}

export async function performHealthCheck(
  orchestrator: AgentOrchestrator
): Promise<HealthStatus> {
  const checks = {
    database: await checkDatabase(),
    api: await checkPolymarketAPI(),
    memory: await checkMemoryStore(),
    agents: {},
  };

  for (const agent of orchestrator.listAgents()) {
    checks.agents[agent.id] = await checkAgent(agent.id);
  }

  const allHealthy = Object.values(checks).every(v => 
    typeof v === 'boolean' ? v : Object.values(v).every(Boolean)
  );

  return {
    status: allHealthy ? 'healthy' : 'degraded',
    checks,
    timestamp: new Date(),
  };
}
```

---

### Improvement #2: Add Circuit Breaker Pattern

```typescript
// circuit-breaker.ts
export class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  constructor(
    private readonly threshold: number = 5,
    private readonly timeout: number = 60000 // 1 min
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    this.state = 'closed';
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.threshold) {
      this.state = 'open';
    }
  }
}

// Use with Polymarket API
const polymarketCircuit = new CircuitBreaker(5, 60000);

async function safeExecuteTrade(params: {...}): Promise<ExecutionResult> {
  return polymarketCircuit.execute(() => 
    polymarketAPI.executeTrade(params)
  );
}
```

---

### Improvement #3: Add Performance Monitoring

```typescript
// metrics.ts
import { Counter, Histogram, Gauge } from 'prom-client';

export const metrics = {
  tradesExecuted: new Counter({
    name: 'agent_trades_total',
    help: 'Total number of trades executed',
    labelNames: ['agent_id', 'strategy', 'status'],
  }),

  tradeLatency: new Histogram({
    name: 'agent_trade_latency_seconds',
    help: 'Trade execution latency',
    labelNames: ['agent_id', 'strategy'],
    buckets: [0.1, 0.5, 1, 2, 5, 10],
  }),

  agentCapital: new Gauge({
    name: 'agent_capital_usd',
    help: 'Current agent capital',
    labelNames: ['agent_id', 'strategy'],
  }),

  llmCalls: new Counter({
    name: 'agent_llm_calls_total',
    help: 'Total LLM API calls',
    labelNames: ['agent_id', 'model', 'status'],
  }),
};

// Use in trading-agent.ts
async respond(options: {...}): Promise<{...}> {
  const startTime = Date.now();
  
  try {
    // ... existing logic ...
    
    metrics.llmCalls.inc({
      agent_id: this.config.id,
      model: 'gemini-2.5-flash',
      status: 'success',
    });
    
    return result;
  } catch (error) {
    metrics.llmCalls.inc({
      agent_id: this.config.id,
      model: 'gemini-2.5-flash',
      status: 'error',
    });
    throw error;
  } finally {
    metrics.tradeLatency.observe(
      { agent_id: this.config.id, strategy: this.config.strategy },
      (Date.now() - startTime) / 1000
    );
  }
}
```

---

## 6. Testing Improvements

### Improvement #4: Add Integration Tests

**File:** `agent-system.test.ts` (expand)

```typescript
import { describe, expect, test, beforeEach, afterEach } from "bun:test";

describe("TradingAgent Integration Tests", () => {
  let orchestrator: AgentOrchestrator;
  let testDb: Database;

  beforeEach(async () => {
    testDb = await createTestDatabase();
    orchestrator = new AgentOrchestrator({
      model: google('gemini-2.5-flash'),
      memory: new InMemoryAgentMemoryStore(),
      dataSource: testDataSource,
    });
  });

  afterEach(async () => {
    await testDb.close();
  });

  test("agent respects daily trade limits", async () => {
    const agent = orchestrator.getAgent('agent_momentum');
    
    // Execute trades up to limit
    for (let i = 0; i < agent.config.maxTradesPerDay; i++) {
      await agent.respond({
        threadId: `thread_${i}`,
        incomingMessages: [{ role: 'user', content: 'Find and execute trade' }],
      });
    }

    // Next trade should fail
    await expect(
      agent.respond({
        threadId: 'thread_over_limit',
        incomingMessages: [{ role: 'user', content: 'Find and execute trade' }],
      })
    ).rejects.toThrow('Daily trade limit reached');
  });

  test("agent persists state across restarts", async () => {
    const agent1 = orchestrator.getAgent('agent_momentum');
    
    // Execute trade
    await agent1.respond({
      threadId: 'thread_1',
      incomingMessages: [{ role: 'user', content: 'Execute trade' }],
    });

    const capitalBefore = agent1.state.currentCapital;
    const tradesBefore = agent1.state.tradesToday;

    // Simulate restart
    const agent2 = new TradingAgent({
      config: agent1.config,
      model: agent1.model,
      tools: agent1.tools,
      memory: agent1.memory,
    });

    expect(agent2.state.currentCapital).toBe(capitalBefore);
    expect(agent2.state.tradesToday).toBe(tradesBefore);
  });

  test("risk limits prevent oversized trades", async () => {
    const agent = orchestrator.getAgent('agent_momentum');
    
    // Try to execute trade larger than 20% of capital
    const oversizedTrade = {
      role: 'user',
      content: JSON.stringify({
        action: 'executeTrade',
        marketId: 'market_123',
        size: agent.state.currentCapital * 0.5, // 50% > 20% limit
      }),
    };

    const result = await agent.respond({
      threadId: 'thread_risk_test',
      incomingMessages: [oversizedTrade],
    });

    // Should be rejected by risk manager
    expect(result.text).toContain('rejected');
  });
});
```

---

## 7. Security Improvements

### Improvement #5: Add Rate Limiting

```typescript
// rate-limiter.ts
import { RateLimiterMemory } from 'rate-limiter-flexible';

export class AgentRateLimiter {
  private limiters = new Map<string, RateLimiterMemory>();

  getRateLimiter(agentId: string, pointsPerMinute: number = 60) {
    if (!this.limiters.has(agentId)) {
      this.limiters.set(
        agentId,
        new RateLimiterMemory({
          points: pointsPerMinute,
          duration: 60,
        })
      );
    }
    return this.limiters.get(agentId)!;
  }

  async checkLimit(agentId: string): Promise<void> {
    const limiter = this.getRateLimiter(agentId);
    try {
      await limiter.consume(agentId, 1);
    } catch (error) {
      throw new AgentError(
        `Rate limit exceeded for agent ${agentId}. Try again later.`
      );
    }
  }
}

// Use in orchestrator
export class AgentOrchestrator {
  private rateLimiter = new AgentRateLimiter();

  async respond(options: {...}): Promise<{...}> {
    // Check rate limit before processing
    await this.rateLimiter.checkLimit(options.agentId);
    
    const agent = this.getAgent(options.agentId);
    return await agent.respond({...});
  }
}
```

---

## 8. Priority Action Items

### Must Do Before Production (P0)
1. ✅ Implement agent state persistence (#1)
2. ✅ Add transaction safety to trade execution (#2)
3. ✅ Fix race conditions with mutex locks (#3)
4. ✅ Fix memory leak in streamText (#4)
5. ✅ Add daily trade counter reset (#5)

### Should Do Soon (P1)
6. ✅ Improve error handling in tools (#6)
7. ✅ Add timeout protection (#7)
8. ✅ Implement conversation pruning (#8)
9. ✅ Add input validation (#9)
10. ✅ Add retry logic for APIs (#12)

### Nice to Have (P2)
11. ✅ Make configuration external (#10)
12. ✅ Add structured logging (#11)
13. ✅ Improve type safety (#13)
14. ✅ Add JSDoc comments (#15)
15. ✅ Replace magic numbers with constants (#16)

### Architecture Enhancements (P3)
16. ✅ Add health check system
17. ✅ Implement circuit breaker
18. ✅ Add performance monitoring
19. ✅ Expand integration tests
20. ✅ Add rate limiting

---

## 9. Estimated Effort

| Priority | Items | Estimated Hours | Team Members |
|----------|-------|-----------------|--------------|
| P0 (Critical) | 5 | 40-60 | 2 senior devs |
| P1 (High) | 5 | 30-40 | 1 senior + 1 mid |
| P2 (Medium) | 5 | 20-30 | 1 mid dev |
| P3 (Nice to have) | 5 | 30-40 | 1 mid dev |
| **Total** | **20** | **120-170** | **2-3 devs** |

**Recommended Timeline:** 3-4 weeks for P0+P1, 2 weeks for P2+P3

---

## 10. Conclusion

Your codebase has a solid foundation with good TypeScript practices and clean architecture. However, deploying this to production with real capital requires addressing the critical issues around:

1. **State persistence** - Agents must survive restarts
2. **Transaction safety** - Trade execution must be atomic
3. **Concurrency** - Race conditions must be prevented
4. **Resource management** - Memory leaks must be fixed
5. **Observability** - Monitoring and alerting are essential

After addressing the P0 and P1 issues, this system will be production-ready. The P2 and P3 improvements will make it more robust and maintainable long-term.

**Next Steps:**
1. Review this document with your team
2. Prioritize fixes based on your timeline
3. Create GitHub issues for each item
4. Implement fixes in order of priority
5. Add comprehensive tests for critical paths
6. Deploy to testnet/paper trading first
7. Monitor for 1-2 weeks before real capital
