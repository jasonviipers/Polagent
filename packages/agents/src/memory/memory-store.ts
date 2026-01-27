import type { UIMessage } from "ai";

export interface AgentMemoryStore {
  load(threadId: string): Promise<UIMessage[]>;
  save(threadId: string, messages: UIMessage[]): Promise<void>;
  clear(threadId: string): Promise<void>;
}
