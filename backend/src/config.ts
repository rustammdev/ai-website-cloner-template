import { z } from "zod";

const EnvSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().int().positive().default(3001),

    OPENAI_API_KEY: z.string().optional(),
    DEEPSEEK_API_KEY: z.string().optional(),
    ANTHROPIC_API_KEY: z.string().optional(),
    GOOGLE_API_KEY: z.string().optional(),
    DEFAULT_PROVIDER: z.string().default("openai"),
    DEFAULT_MODEL: z.string().default("gpt-4o-mini"),

    // CORS — comma-separated whitelist; echoed back per-request. Empty by
    // default during dev so the server does not hand out CORS headers to
    // unknown origins. Production requires this to be set (see .superRefine
    // below) so a misconfigured deploy cannot silently accept requests
    // missing from an intended whitelist.
    ALLOWED_ORIGINS: z.string().default(""),

    MONGODB_URI: z.string().default("mongodb://localhost:27017/ai_cloner"),
    MONGODB_DB_NAME: z.string().default("ai_cloner"),

    // Upload storage (local disk for now; production should switch to S3/R2).
    STORAGE_DIR: z.string().default("./storage"),

    // Agent graph knobs.
    //
    // `AGENT_MODEL_CALL_LIMIT` is the primary safety net: it caps how many
    // model → tool round-trips the agent performs per user message.
    // LangChain's `modelCallLimitMiddleware` terminates the run gracefully
    // when reached (no exception, the agent returns its last message).
    //
    // `AGENT_RECURSION_LIMIT` is the LangGraph ceiling. It only kicks in for
    // pathological loops the middleware cannot detect (e.g. a tool that
    // produces malformed output that the model keeps re-parsing). Kept at
    // 50 as a hard backstop.
    AGENT_MODEL_CALL_LIMIT: z.coerce.number().int().positive().default(12),
    AGENT_RECURSION_LIMIT: z.coerce.number().int().positive().default(50),

    BETTER_AUTH_SECRET: z
      .string()
      .min(16, "BETTER_AUTH_SECRET must be at least 16 chars (run `openssl rand -base64 32`)"),
    BETTER_AUTH_URL: z.string().url().default("http://localhost:3001"),

    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV !== "production") return;
    const origins = data.ALLOWED_ORIGINS.split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (origins.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ALLOWED_ORIGINS"],
        message:
          "ALLOWED_ORIGINS must list at least one origin in production (web UI origin and `chrome-extension://<id>`).",
      });
    }
  });

export type Env = z.infer<typeof EnvSchema>;

export const env: Env = EnvSchema.parse(process.env);

export const isProduction = env.NODE_ENV === "production";

export const googleOAuthEnabled = Boolean(
  env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET,
);

export const allowedOrigins: ReadonlySet<string> = new Set(
  env.ALLOWED_ORIGINS.split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);
