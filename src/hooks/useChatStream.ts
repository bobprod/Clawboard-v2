import { useState, useRef, useCallback } from "react";
import { apiFetch } from "../lib/apiFetch";

const BASE = "http://localhost:4000";

export interface StreamMessage {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  tool?: string;
  thinking?: string;
  done?: boolean;
  ts: Date;
  toolCalls?: {
    tool: string;
    input: Record<string, unknown>;
    result: Record<string, unknown>;
  }[];
}

let counter = 0;
function uid() {
  return `msg-${++counter}-${Date.now()}`;
}

/**
 * Shared chat streaming hook used by both ChatModule (full page) and AgentChat (floating bubble).
 * Handles SSE streaming, JSON fallback, tool calls, and thinking traces.
 */
export function useChatStream() {
  const [messages, setMessages] = useState<StreamMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const clearMessages = useCallback(() => setMessages([]), []);

  const send = useCallback(
    async (opts: {
      text: string;
      agent?: string;
      model?: string;
      mode?: string;
      permissions?: Record<string, boolean>;
      preInstructions?: string;
      history?: { role: string; content: string }[];
    }) => {
      const {
        text,
        agent,
        model,
        mode,
        permissions,
        preInstructions,
        history,
      } = opts;
      if (!text.trim() || loading) return;

      const userMsg: StreamMessage = {
        id: uid(),
        role: "user",
        content: text,
        done: true,
        ts: new Date(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setLoading(true);

      const assistantId = uid();
      setMessages((prev) => [
        ...prev,
        {
          id: assistantId,
          role: "assistant",
          content: "",
          done: false,
          ts: new Date(),
          toolCalls: [],
        },
      ]);

      const ctrl = new AbortController();
      abortRef.current = ctrl;

      const chatHistory =
        history ??
        messages
          .filter((m) => m.role !== "tool")
          .map((m) => ({ role: m.role, content: m.content }));

      try {
        const res = await apiFetch(`${BASE}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agent: agent ?? "main",
            model: model ?? undefined,
            mode: mode ?? undefined,
            permissions: permissions ?? undefined,
            preInstructions: preInstructions ?? undefined,
            messages: [...chatHistory, { role: "user", content: text }],
            stream: true,
          }),
          signal: ctrl.signal,
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const contentType = res.headers.get("content-type") ?? "";

        if (contentType.includes("text/event-stream")) {
          const reader = res.body!.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          let accum = "";
          const toolCalls: StreamMessage["toolCalls"] = [];

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              if (!line.startsWith("data:")) continue;
              const raw = line.slice(5).trim();
              if (raw === "[DONE]") break;
              try {
                const parsed = JSON.parse(raw);
                const delta =
                  parsed.delta?.content ?? parsed.content ?? parsed.text ?? "";
                const toolCall = parsed.tool_call;
                const thinking = parsed.thinking ?? parsed.reasoning;

                if (toolCall) {
                  const tc = {
                    tool: toolCall.name ?? toolCall.function?.name ?? "tool",
                    input:
                      toolCall.arguments ?? toolCall.function?.arguments ?? {},
                    result: toolCall.result ?? {},
                  };
                  toolCalls.push(tc);
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantId
                        ? { ...m, toolCalls: [...toolCalls] }
                        : m,
                    ),
                  );
                } else {
                  accum += delta;
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantId
                        ? {
                            ...m,
                            content: accum,
                            thinking: thinking ?? m.thinking,
                          }
                        : m,
                    ),
                  );
                }
              } catch {
                /* skip malformed */
              }
            }
          }
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, done: true } : m)),
          );
        } else {
          const data = await res.json();
          const reply =
            data.content ??
            data.message ??
            data.response ??
            data.text ??
            JSON.stringify(data);
          const tcs = (data.tool_calls ?? []).map((tc: any) => ({
            tool: tc.name ?? tc.function?.name ?? "tool",
            input: tc.arguments ?? tc.function?.arguments ?? {},
            result: tc.result ?? {},
          }));
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    content: reply,
                    done: true,
                    toolCalls: tcs.length ? tcs : undefined,
                  }
                : m,
            ),
          );
        }
      } catch (err: any) {
        if (err.name !== "AbortError") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    content: `⚠️ Erreur : ${err.message ?? "impossible de joindre l'agent"}`,
                    done: true,
                  }
                : m,
            ),
          );
        }
      }

      setLoading(false);
      abortRef.current = null;
    },
    [loading, messages],
  );

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
  }, []);

  return { messages, loading, send, clearMessages, abort, setMessages };
}
