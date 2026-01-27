import type { UIMessage } from "ai";
import Redis from "ioredis";

import { AgentMemoryError } from "../errors";
import type { AgentMemoryStore } from "./memory-store";

export class RedisAgentMemoryStore implements AgentMemoryStore {
  private readonly redis: Redis;
  private readonly keyPrefix: string;

  constructor(options: { url: string; keyPrefix?: string }) {
    this.redis = new Redis(options.url);
    this.keyPrefix = options.keyPrefix ?? "polagent:agent-memory:";
  }

  async load(threadId: string): Promise<UIMessage[]> {
    const key = this.keyPrefix + threadId;
    try {
      const value = await this.redis.get(key);
      if (!value) return [];
      const parsed = JSON.parse(value) as UIMessage[];
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      throw new AgentMemoryError(
        `Failed to load agent memory for threadId=${threadId}: ${String(err)}`
      );
    }
  }

  async save(threadId: string, messages: UIMessage[]): Promise<void> {
    const key = this.keyPrefix + threadId;
    try {
      await this.redis.set(key, JSON.stringify(messages));
    } catch (err) {
      throw new AgentMemoryError(
        `Failed to save agent memory for threadId=${threadId}: ${String(err)}`
      );
    }
  }

  async clear(threadId: string): Promise<void> {
    const key = this.keyPrefix + threadId;
    try {
      await this.redis.del(key);
    } catch (err) {
      throw new AgentMemoryError(
        `Failed to clear agent memory for threadId=${threadId}: ${String(err)}`
      );
    }
  }

  async close(): Promise<void> {
    try {
      await this.redis.quit();
    } catch (err) {
      throw new AgentMemoryError(
        `Failed to close redis memory store: ${String(err)}`
      );
    }
  }
}
