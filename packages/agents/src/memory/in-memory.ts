import type { UIMessage } from "ai";

import type { AgentMemoryStore } from "./memory-store";

export class InMemoryAgentMemoryStore implements AgentMemoryStore {
  private readonly store = new Map<string, UIMessage[]>();

  load(threadId: string): Promise<UIMessage[]> {
    return Promise.resolve(this.store.get(threadId) ?? []);
  }

  save(threadId: string, messages: UIMessage[]): Promise<void> {
    this.store.set(threadId, messages);
    return Promise.resolve();
  }

  clear(threadId: string): Promise<void> {
    this.store.delete(threadId);
    return Promise.resolve();
  }
}
