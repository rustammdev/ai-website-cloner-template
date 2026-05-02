type Level = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<Level, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const envLevel = (process.env.LOG_LEVEL ?? "info").toLowerCase() as Level;
const MIN_LEVEL = LEVEL_ORDER[envLevel] ?? LEVEL_ORDER.info;

export interface Logger {
  debug(msg: string, ctx?: Record<string, unknown>): void;
  info(msg: string, ctx?: Record<string, unknown>): void;
  warn(msg: string, ctx?: Record<string, unknown>): void;
  error(msg: string, ctx?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}

function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  return { value: String(err) };
}

function write(level: Level, msg: string, base: Record<string, unknown>, ctx?: Record<string, unknown>): void {
  if (LEVEL_ORDER[level] < MIN_LEVEL) return;
  const record: Record<string, unknown> = {
    level,
    time: new Date().toISOString(),
    msg,
    ...base,
    ...(ctx ?? {}),
  };
  if (ctx && "err" in ctx) {
    record.err = serializeError(ctx.err);
  }
  const line = JSON.stringify(record);
  if (level === "error" || level === "warn") {
    process.stderr.write(line + "\n");
  } else {
    process.stdout.write(line + "\n");
  }
}

function createLogger(bindings: Record<string, unknown> = {}): Logger {
  return {
    debug: (msg, ctx) => write("debug", msg, bindings, ctx),
    info: (msg, ctx) => write("info", msg, bindings, ctx),
    warn: (msg, ctx) => write("warn", msg, bindings, ctx),
    error: (msg, ctx) => write("error", msg, bindings, ctx),
    child: (extra) => createLogger({ ...bindings, ...extra }),
  };
}

export const logger: Logger = createLogger();
