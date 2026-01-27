import type { UIMessage } from "ai";

import type { AgentMemoryStore } from "./memory-store";

export class InMemoryAgentMemoryStore implements AgentMemoryStore {
  private readonly store = new Map<string, UIMessage[]>();

  async load(threadId: string): Promise<UIMessage[]> {
    return this.store.get(threadId) ?? [];
  }

  async save(threadId: string, messages: UIMessage[]): Promise<void> {
    this.store.set(threadId, messages);
  }

  async clear(threadId: string): Promise<void> {
    this.store.delete(threadId);
  }
}
