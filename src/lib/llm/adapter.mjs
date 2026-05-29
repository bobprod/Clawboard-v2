/**
 * adapter.mjs — Model-agnostic LLM adapter for Clawboard.
 *
 * Supports: OpenAI-compatible, Anthropic, Google Gemini, Ollama.
 * Features: auto-detect provider, fallback chain, load balancing.
 */

// ─── Provider detection ──────────────────────────────────────────────────────

const PROVIDER_PATTERNS = [
  { provider: "anthropic", pattern: /^(claude|anthropic)/i },
  { provider: "google", pattern: /^(gemini|google)/i },
  { provider: "ollama", pattern: /^(ollama\/|llama|qwen|mistral|phi|deepseek|codellama|vicuna|wizard)/i },
  { provider: "openai", pattern: /^(gpt-4|gpt-3|o1|o3|chatgpt)/i },
  { provider: "deepseek", pattern: /^deepseek/i },
  { provider: "openrouter", pattern: /^openrouter\//i },
  { provider: "openai", pattern: /.*/ }, // fallback
];

function detectProvider(model) {
  if (!model) return "openai";
  for (const { provider, pattern } of PROVIDER_PATTERNS) {
    if (pattern.test(model)) return provider;
  }
  return "openai";
}

function resolveBaseUrl(provider, envOverrides = {}) {
  const defaults = {
    openai: "https://api.openai.com/v1",
    anthropic: "https://api.anthropic.com",
    google: "https://generativelanguage.googleapis.com/v1beta",
    ollama: "http://localhost:11434",
    deepseek: "https://api.deepseek.com/v1",
    openrouter: "https://openrouter.ai/api/v1",
  };
  const envMap = {
    openai: "OPENAI_BASE_URL",
    anthropic: "ANTHROPIC_BASE_URL",
    google: "GOOGLE_BASE_URL",
    ollama: "OLLAMA_BASE_URL",
    deepseek: "DEEPSEEK_BASE_URL",
    openrouter: "OPENROUTER_BASE_URL",
  };
  const envKey = envMap[provider];
  if (envKey && process.env[envKey]) return process.env[envKey];
  if (envOverrides[provider]) return envOverrides[provider];
  return defaults[provider] || defaults.openai;
}

function resolveApiKey(provider, apiKeys = {}) {
  const envMap = {
    openai: "OPENAI_API_KEY",
    anthropic: "ANTHROPIC_API_KEY",
    google: "GOOGLE_API_KEY",
    deepseek: "DEEPSEEK_API_KEY",
    openrouter: "OPENROUTER_API_KEY",
    ollama: null,
  };
  const key = apiKeys[provider] || apiKeys[`${provider}_api_key`];
  if (key) return key;
  const envKey = envMap[provider];
  if (envKey && process.env[envKey]) return process.env[envKey];
  return null;
}

// ─── Request builders per provider ───────────────────────────────────────────

function buildOpenAIRequest(messages, options) {
  const body = {
    model: options.model,
    messages,
    max_tokens: options.maxTokens || 4096,
    temperature: options.temperature ?? 0.7,
    stream: false,
  };
  if (options.tools) body.tools = options.tools;
  if (options.stop) body.stop = options.stop;
  return body;
}

function buildAnthropicRequest(messages, options) {
  const system = [];
  const userMessages = [];
  for (const m of messages) {
    if (m.role === "system") {
      system.push(m.content);
    } else {
      userMessages.push(m);
    }
  }
  const body = {
    model: options.model,
    max_tokens: options.maxTokens || 4096,
    messages: userMessages,
  };
  if (system.length > 0) body.system = system.join("\n\n");
  if (options.temperature !== undefined) body.temperature = options.temperature;
  if (options.tools) body.tools = options.tools;
  if (options.stop) body.stop_sequences = options.stop;
  return body;
}

function buildGeminiRequest(messages, options) {
  const contents = [];
  for (const m of messages) {
    if (m.role === "system") continue;
    contents.push({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    });
  }
  const body = {
    contents,
    generationConfig: {
      maxOutputTokens: options.maxTokens || 4096,
      temperature: options.temperature ?? 0.7,
    },
  };
  const systemMsg = messages.find((m) => m.role === "system");
  if (systemMsg) {
    body.systemInstruction = { parts: [{ text: systemMsg.content }] };
  }
  return body;
}

function buildOllamaRequest(messages, options) {
  return {
    model: options.model,
    messages,
    stream: false,
    options: {
      num_predict: options.maxTokens || 4096,
      temperature: options.temperature ?? 0.7,
    },
  };
}

// ─── Response parsers per provider ───────────────────────────────────────────

function parseOpenAIResponse(data) {
  const choice = data.choices?.[0];
  return {
    content: choice?.message?.content || "",
    usage: {
      promptTokens: data.usage?.prompt_tokens || 0,
      completionTokens: data.usage?.completion_tokens || 0,
      totalTokens: data.usage?.total_tokens || 0,
    },
    finishReason: choice?.finish_reason || null,
    raw: data,
  };
}

function parseAnthropicResponse(data) {
  const text = data.content?.map((b) => b.text).join("") || "";
  return {
    content: text,
    usage: {
      promptTokens: data.usage?.input_tokens || 0,
      completionTokens: data.usage?.output_tokens || 0,
      totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
    },
    finishReason: data.stop_reason || null,
    raw: data,
  };
}

function parseGeminiResponse(data) {
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";
  return {
    content: text,
    usage: {
      promptTokens: data.usageMetadata?.promptTokenCount || 0,
      completionTokens: data.usageMetadata?.candidatesTokenCount || 0,
      totalTokens: data.usageMetadata?.totalTokenCount || 0,
    },
    finishReason: data.candidates?.[0]?.finishReason || null,
    raw: data,
  };
}

function parseOllamaResponse(data) {
  return {
    content: data.message?.content || "",
    usage: {
      promptTokens: data.prompt_eval_count || 0,
      completionTokens: data.eval_count || 0,
      totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
    },
    finishReason: data.done ? "stop" : null,
    raw: data,
  };
}

// ─── HTTP helpers ────────────────────────────────────────────────────────────

async function makeRequest(url, headers, body, timeoutMs = 60000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      const error = new Error(`LLM API error ${res.status}: ${errText.slice(0, 500)}`);
      error.status = res.status;
      error.provider = null; // set by caller
      throw error;
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ─── Core adapter class ──────────────────────────────────────────────────────

export class LLMAdapter {
  /**
   * @param {Object} opts
   * @param {Object} opts.apiKeys - { openai: "sk-...", anthropic: "sk-...", ... }
   * @param {Object} opts.baseUrls - override base URLs per provider
   * @param {number} opts.timeout - request timeout in ms (default 60000)
   */
  constructor(opts = {}) {
    this.apiKeys = opts.apiKeys || {};
    this.baseUrls = opts.baseUrls || {};
    this.timeout = opts.timeout || 60000;
  }

  /**
   * Send a chat completion request to the appropriate provider.
   * @param {Array<{role: string, content: string}>} messages
   * @param {Object} options - { model, maxTokens, temperature, tools, stop }
   * @returns {Promise<{content: string, usage: Object, finishReason: string, raw: Object}>}
   */
  async chat(messages, options = {}) {
    const model = options.model || "gpt-4o";
    const provider = detectProvider(model);
    const baseUrl = resolveBaseUrl(provider, this.baseUrls);
    const apiKey = resolveApiKey(provider, this.apiKeys);

    const opts = { ...options, model };

    let url, headers, body, parser;

    switch (provider) {
      case "anthropic": {
        url = `${baseUrl}/v1/messages`;
        headers = {
          "x-api-key": apiKey || "",
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        };
        body = buildAnthropicRequest(messages, opts);
        parser = parseAnthropicResponse;
        break;
      }
      case "google": {
        const geminiModel = model.replace(/^google\//, "");
        url = `${baseUrl}/models/${geminiModel}:generateContent?key=${apiKey || ""}`;
        headers = {};
        body = buildGeminiRequest(messages, opts);
        parser = parseGeminiResponse;
        break;
      }
      case "ollama": {
        url = `${baseUrl}/api/chat`;
        headers = {};
        body = buildOllamaRequest(messages, opts);
        parser = parseOllamaResponse;
        break;
      }
      default: {
        // openai, deepseek, openrouter, or any OpenAI-compatible
        let actualModel = model;
        if (provider === "openrouter") actualModel = model.replace(/^openrouter\//, "");
        url = `${baseUrl}/chat/completions`;
        headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
        body = buildOpenAIRequest(messages, { ...opts, model: actualModel });
        parser = parseOpenAIResponse;
        break;
      }
    }

    const raw = await makeRequest(url, headers, body, this.timeout);
    const result = parser(raw);
    result.provider = provider;
    return result;
  }
}

// ─── Fallback chain + load balancing ─────────────────────────────────────────

/**
 * Create an adapter with fallback chain.
 * @param {Object} opts
 * @param {string[]} opts.models - ordered list of models to try
 * @param {Object} opts.apiKeys - API keys per provider
 * @param {Object} opts.baseUrls - override base URLs
 * @param {number} opts.timeout - per-request timeout
 * @returns {{ chat: Function }}
 */
export function createFallbackChain(opts = {}) {
  const adapter = new LLMAdapter(opts);
  const models = opts.models || ["gpt-4o", "claude-sonnet-4-20250514"];

  return {
    async chat(messages, options = {}) {
      let lastError;
      for (const model of models) {
        try {
          return await adapter.chat(messages, { ...options, model });
        } catch (err) {
          lastError = err;
          // Only fallback on 429, 500, 502, 503, 504 or network errors
          if (err.status && err.status >= 400 && err.status < 500 && err.status !== 429) {
            throw err;
          }
        }
      }
      throw lastError || new Error("All models in fallback chain failed");
    },
  };
}

/**
 * Create a load-balanced adapter across multiple API keys for the same provider.
 * @param {Object} opts
 * @param {string} opts.model - model name
 * @param {string[]} opts.apiKeys - array of API keys to rotate
 * @param {number} opts.timeout
 * @returns {{ chat: Function }}
 */
export function createLoadBalancer(opts = {}) {
  const { model, apiKeys: keys = [], timeout = 60000 } = opts;
  const provider = detectProvider(model);
  let idx = 0;

  return {
    async chat(messages, options = {}) {
      if (keys.length === 0) throw new Error("No API keys provided for load balancer");
      const key = keys[idx % keys.length];
      idx++;
      const adapter = new LLMAdapter({
        apiKeys: { [provider]: key },
        timeout,
      });
      return adapter.chat(messages, { ...options, model });
    },
  };
}

// ─── Convenience: quick chat function ────────────────────────────────────────

/**
 * One-shot chat call.
 * @param {string} model - model identifier
 * @param {Array<{role: string, content: string}>} messages
 * @param {Object} opts - { apiKeys, maxTokens, temperature, timeout }
 * @returns {Promise<{content: string, usage: Object}>}
 */
export async function quickChat(model, messages, opts = {}) {
  const adapter = new LLMAdapter({
    apiKeys: opts.apiKeys || {},
    timeout: opts.timeout,
  });
  return adapter.chat(messages, {
    model,
    maxTokens: opts.maxTokens,
    temperature: opts.temperature,
    tools: opts.tools,
    stop: opts.stop,
  });
}

export { detectProvider, resolveBaseUrl, resolveApiKey };
