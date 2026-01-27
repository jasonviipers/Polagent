import type { UIMessage } from "ai";

export function dedupeUIMessagesById(messages: UIMessage[]): UIMessage[] {
  const seen = new Set<string>();
  const out: UIMessage[] = [];
  for (const m of messages) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    out.push(m);
  }
  return out;
}

export function trimUIMessages(
  messages: UIMessage[],
  maxMessages: number
): UIMessage[] {
  if (maxMessages <= 0) return [];
  if (messages.length <= maxMessages) return messages;
  return messages.slice(messages.length - maxMessages);
}

export function mergeConversation({
  previous,
  incoming,
  maxMessages,
}: {
  previous: UIMessage[];
  incoming: UIMessage[];
  maxMessages: number;
}): UIMessage[] {
  const merged = dedupeUIMessagesById([...previous, ...incoming]);
  return trimUIMessages(merged, maxMessages);
}
