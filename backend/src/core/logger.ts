import "server-only";
import { serverEnv } from "./env";

type Level = "debug" | "info" | "warn" | "error";
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/**
 * Keys whose values must never reach logs: credentials, tokens, message/post content and
 * contact details. Matching is case-insensitive and applies at any depth.
 */
const REDACT = /pass(word)?|secret|token|authorization|cookie|api[_-]?key|signature|body|message|content|email|phone|card|code/i;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 5) return "[depth]";
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = REDACT.test(k) ? "[redacted]" : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

function write(level: Level, event: string, fields?: Record<string, unknown>) {
  let min: Level = "info";
  try {
    min = serverEnv().LOG_LEVEL;
  } catch {
    // fall back to info if env parsing fails during early boot
  }
  if (ORDER[level] < ORDER[min]) return;
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...(fields ? (redact(fields) as object) : {}) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/** Structured JSON logger with automatic redaction of sensitive fields. */
export const logger = {
  debug: (event: string, fields?: Record<string, unknown>) => write("debug", event, fields),
  info: (event: string, fields?: Record<string, unknown>) => write("info", event, fields),
  warn: (event: string, fields?: Record<string, unknown>) => write("warn", event, fields),
  error: (event: string, fields?: Record<string, unknown>) => write("error", event, fields),
};
