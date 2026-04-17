// ─── Structured Logger ──────────────────────────────────────────────────────
// Replaces raw console.log with level-aware, module-tagged, timestamped logging.
// Usage: import { createLogger } from './logger.mjs'
//        const log = createLogger('router');
//        log.info('Request handled', { path, status });

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const LOG_LEVEL = (process.env.LOG_LEVEL || "info").toLowerCase();
const MIN_LEVEL = LEVELS[LOG_LEVEL] ?? 1;
const NO_COLOR = !!process.env.NO_COLOR;

const COLORS = {
  debug: "\x1b[90m", // gray
  info: "\x1b[36m", // cyan
  warn: "\x1b[33m", // yellow
  error: "\x1b[31m", // red
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
};

function formatTs() {
  return new Date().toISOString().replace("T", " ").slice(0, 23);
}

function formatLevel(level) {
  if (NO_COLOR) return level.toUpperCase().padEnd(5);
  const c = COLORS[level] || COLORS.info;
  return `${c}${COLORS.bold}${level.toUpperCase().padEnd(5)}${COLORS.reset}`;
}

function formatModule(mod) {
  if (NO_COLOR) return `[${mod}]`;
  return `${COLORS.dim}[${mod}]${COLORS.reset}`;
}

function formatData(data) {
  if (!data || Object.keys(data).length === 0) return "";
  try {
    return " " + JSON.stringify(data);
  } catch {
    return " [unserializable]";
  }
}

function emit(level, mod, msg, data) {
  if (LEVELS[level] < MIN_LEVEL) return;
  const line = `${formatTs()} ${formatLevel(level)} ${formatModule(mod)} ${msg}${formatData(data)}`;
  if (level === "error") {
    process.stderr.write(line + "\n");
  } else {
    process.stdout.write(line + "\n");
  }
}

export function createLogger(moduleName = "app") {
  return {
    debug: (msg, data) => emit("debug", moduleName, msg, data),
    info: (msg, data) => emit("info", moduleName, msg, data),
    warn: (msg, data) => emit("warn", moduleName, msg, data),
    error: (msg, data) => emit("error", moduleName, msg, data),
  };
}

// Default logger for quick imports
export const log = createLogger("app");
