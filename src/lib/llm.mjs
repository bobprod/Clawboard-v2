// ─── Minimal OpenAI-compatible text generation ──────────────────────────────
// Utilisé pour l'exécution réelle des tâches via n'importe quel endpoint
// compatible OpenAI (OpenCode Go/Zen, OpenAI, OpenRouter, local…).

export async function generateText({
  key,
  baseUrl,
  model,
  messages,
  sessionHeader = "",
  maxTokens = 1200,
  temperature = 0.2,
}) {
  const url = `${String(baseUrl).replace(/\/+$/, "")}/chat/completions`;

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`,
  };
  if (sessionHeader) headers["x-opencode-session"] = sessionHeader;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    const err = new Error(`LLM HTTP ${res.status} ${detail.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  const text = typeof content === "string" ? content : JSON.stringify(content || "");
  const usage = data?.usage || {};

  return {
    text,
    promptTokens: usage.prompt_tokens || 0,
    completionTokens: usage.completion_tokens || 0,
    model: data?.model || model,
  };
}
