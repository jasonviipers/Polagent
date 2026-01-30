"use client";

import { useChat } from "@ai-sdk/react";
import { env } from "@polagent/env/web";
import { DefaultChatTransport } from "ai";
import { Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Streamdown } from "streamdown";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function AIPage() {
  const [input, setInput] = useState("");
  const [threadId, setThreadId] = useState("demo_thread");
  const [agentId, setAgentId] = useState("agent_momentum");
  const [taskType, setTaskType] = useState<
    | "tradingDecision"
    | "marketAnalysis"
    | "search"
    | "summarization"
    | "extraction"
  >("marketAnalysis");
  const [priority, setPriority] = useState<"quality" | "latency" | "cost">(
    "quality"
  );
  const [modelOverride, setModelOverride] = useState<string>("");
  const [availableModels, setAvailableModels] = useState<
    Array<{ id: string; enabledByDefault?: boolean }>
  >([]);
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: `${env.NEXT_PUBLIC_SERVER_URL}/ai/agentic`,
      body: () => ({
        threadId,
        agentId,
        taskType,
        priority,
        modelOverride: modelOverride || undefined,
      }),
    }),
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${env.NEXT_PUBLIC_SERVER_URL}/ai/models/profiles`, {
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!Array.isArray(data)) {
          return;
        }
        const parsed = data.flatMap((p) => {
          if (!(typeof p === "object" && p && "id" in p)) {
            return [];
          }
          const id = String((p as { id: unknown }).id);
          if (!id) {
            return [];
          }
          const enabledByDefault =
            "enabledByDefault" in p
              ? Boolean((p as { enabledByDefault: unknown }).enabledByDefault)
              : undefined;
          return [{ id, enabledByDefault }];
        });
        setAvailableModels(parsed);
      })
      .catch(() => {
        // Ignore errors
      });
    return () => controller.abort();
  }, []);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) {
      return;
    }
    sendMessage({ text });
    setInput("");
  };

  return (
    <div className="mx-auto grid w-full grid-rows-[1fr_auto] overflow-hidden p-4">
      <div className="space-y-4 overflow-y-auto pb-4">
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-background p-3">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-sm">Thread</span>
            <Input
              className="h-9 w-[220px]"
              onChange={(e) => setThreadId(e.target.value)}
              value={threadId}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-sm">Agent</span>
            <select
              className="h-9 rounded-md border bg-background px-2 text-sm"
              onChange={(e) => setAgentId(e.target.value)}
              value={agentId}
            >
              <option value="agent_momentum">Momentum</option>
              <option value="agent_contrarian">Contrarian</option>
              <option value="agent_arbitrage">Arbitrage</option>
              <option value="agent_news">News</option>
              <option value="agent_risk_parity">Risk Parity</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-sm">Task</span>
            <select
              className="h-9 rounded-md border bg-background px-2 text-sm"
              onChange={(e) =>
                setTaskType(
                  e.target.value as
                    | "tradingDecision"
                    | "marketAnalysis"
                    | "search"
                    | "summarization"
                    | "extraction"
                )
              }
              value={taskType}
            >
              <option value="marketAnalysis">Market analysis</option>
              <option value="tradingDecision">Trading decision</option>
              <option value="search">Search</option>
              <option value="summarization">Summarization</option>
              <option value="extraction">Extraction</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-sm">Priority</span>
            <select
              className="h-9 rounded-md border bg-background px-2 text-sm"
              onChange={(e) =>
                setPriority(e.target.value as "quality" | "latency" | "cost")
              }
              value={priority}
            >
              <option value="quality">Quality</option>
              <option value="latency">Latency</option>
              <option value="cost">Cost</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-sm">Model</span>
            <select
              className="h-9 max-w-[320px] rounded-md border bg-background px-2 text-sm"
              onChange={(e) => setModelOverride(e.target.value)}
              value={modelOverride}
            >
              <option value="">Auto</option>
              {availableModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.enabledByDefault ? `${m.id} (default)` : m.id}
                </option>
              ))}
            </select>
          </div>
        </div>
        {messages.length === 0 ? (
          <div className="mt-8 text-center text-muted-foreground">
            Try: "List markets, analyze one, and execute a demo trade."
          </div>
        ) : (
          messages.map((message) => (
            <div
              className={`rounded-lg p-3 ${
                message.role === "user"
                  ? "ml-8 bg-primary/10"
                  : "mr-8 bg-secondary/20"
              }`}
              key={message.id}
            >
              <p className="mb-1 font-semibold text-sm">
                {message.role === "user" ? "You" : "AI Assistant"}
              </p>
              {message.parts?.map((part, index) => {
                if (part.type === "text") {
                  return (
                    <Streamdown
                      isAnimating={
                        status === "streaming" && message.role === "assistant"
                      }
                      // biome-ignore lint/suspicious/noArrayIndexKey: Parts lack unique IDs
                      key={index}
                    >
                      {part.text}
                    </Streamdown>
                  );
                }
                if (
                  typeof part.type === "string" &&
                  part.type.startsWith("tool-")
                ) {
                  return (
                    <pre
                      className="mt-2 overflow-auto rounded-md bg-muted p-2 text-xs"
                      // biome-ignore lint/suspicious/noArrayIndexKey: Parts lack unique IDs
                      key={index}
                    >
                      {JSON.stringify(part, null, 2)}
                    </pre>
                  );
                }
                return null;
              })}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <form
        className="flex w-full items-center space-x-2 border-t pt-2"
        onSubmit={handleSubmit}
      >
        <Input
          autoComplete="off"
          autoFocus
          className="flex-1"
          name="prompt"
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your message..."
          value={input}
        />
        <Button size="icon" type="submit">
          <Send size={18} />
        </Button>
      </form>
    </div>
  );
}
