import { allowedOrigins, env, isProduction } from "./config.ts";
import { getAuth } from "./auth/instance.ts";
import { fromUnknown, notFound } from "./lib/http.ts";
import { logger } from "./lib/logger.ts";
import { healthRoute } from "./routes/health.ts";
import { modelsRoute } from "./routes/models.ts";
import { skillsRoute } from "./routes/skills.ts";
import { chatRoute } from "./routes/chat.ts";
import {
  getConversationRoute,
  listConversationsRoute,
} from "./routes/conversations.ts";
import {
  deleteGenerationRoute,
  getGenerationRoute,
  listGenerationsRoute,
  patchGenerationRoute,
} from "./routes/generations.ts";
import { storageRoute } from "./routes/storage.ts";
import { subscribeRoute } from "./bridge/stream.ts";
import { respondRoute } from "./bridge/respond.ts";

/**
 * Build CORS headers for a given request.
 *
 * The Fetch spec forbids pairing `Access-Control-Allow-Origin: *` with
 * `Access-Control-Allow-Credentials: true`, so we echo the incoming Origin
 * back — but only if it's in the whitelist. Unknown or missing origins get
 * no CORS headers at all; same-origin and server-to-server calls still work,
 * browser cross-origin calls from unknown origins are blocked.
 */
function buildCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin");
  if (!origin || !allowedOrigins.has(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Cookie",
    "Access-Control-Max-Age": "86400",
    // Proxies caching responses must key on Origin — otherwise one origin's
    // allowed response gets served to another origin.
    Vary: "Origin",
  };
}

function applyCors(res: Response, headers: Record<string, string>): Response {
  for (const [k, v] of Object.entries(headers)) res.headers.set(k, v);
  return res;
}

const CONV_DETAIL = /^\/conversations\/([a-f0-9]{24})$/i;
const GEN_DETAIL = /^\/generations\/([a-f0-9]{24})$/i;
const STORAGE_PATH = /^\/storage\/(.+)$/;

async function route(req: Request): Promise<Response> {
  const url = new URL(req.url);

  if (req.method === "OPTIONS") return new Response(null, { status: 204 });

  if (url.pathname === "/bridge/subscribe" && req.method === "GET") {
    return subscribeRoute(req);
  }
  if (url.pathname === "/bridge/respond" && req.method === "POST") {
    return respondRoute(req);
  }

  if (url.pathname.startsWith("/api/auth/")) {
    const auth = await getAuth();
    return auth.handler(req);
  }

  if (url.pathname === "/health" && req.method === "GET") return healthRoute();
  if (url.pathname === "/models" && req.method === "GET") return modelsRoute();
  if (url.pathname === "/skills" && req.method === "GET") return skillsRoute();
  if (url.pathname === "/chat" && req.method === "POST") return chatRoute(req);

  if (url.pathname === "/conversations" && req.method === "GET") {
    return listConversationsRoute(req);
  }
  const convMatch = url.pathname.match(CONV_DETAIL);
  if (convMatch && req.method === "GET") {
    return getConversationRoute(req, convMatch[1]!);
  }

  if (url.pathname === "/generations" && req.method === "GET") {
    return listGenerationsRoute(req);
  }
  const genMatch = url.pathname.match(GEN_DETAIL);
  if (genMatch) {
    if (req.method === "GET") return getGenerationRoute(req, genMatch[1]!);
    if (req.method === "PATCH") return patchGenerationRoute(req, genMatch[1]!);
    if (req.method === "DELETE") return deleteGenerationRoute(req, genMatch[1]!);
  }

  const storageMatch = url.pathname.match(STORAGE_PATH);
  if (storageMatch && req.method === "GET") {
    return storageRoute(req, storageMatch[1]!);
  }

  return notFound("Route");
}

// Eagerly init the auth instance so Mongo is connected at boot, not on first
// request. Non-fatal: if it fails we log and let requests surface the error.
getAuth().catch((err) => {
  logger.error("auth init failed", { err });
});

const server = Bun.serve({
  port: env.PORT,
  idleTimeout: 255,
  async fetch(req) {
    const cors = buildCorsHeaders(req);
    try {
      const res = await route(req);
      return applyCors(res, cors);
    } catch (err) {
      logger.error("unhandled request error", {
        err,
        path: new URL(req.url).pathname,
        method: req.method,
      });
      return applyCors(fromUnknown(err), cors);
    }
  },
});

logger.info("agent backend ready", {
  port: server.port,
  url: `http://localhost:${server.port}`,
  env: env.NODE_ENV,
  provider: env.DEFAULT_PROVIDER,
  model: env.DEFAULT_MODEL,
  openaiKeyPresent: Boolean(env.OPENAI_API_KEY),
  authUrl: env.BETTER_AUTH_URL,
  db: env.MONGODB_DB_NAME,
  allowedOriginCount: allowedOrigins.size,
});
if (!env.OPENAI_API_KEY) {
  logger.warn("OPENAI_API_KEY is not set — OpenAI provider will fail");
}
if (!isProduction && allowedOrigins.size === 0) {
  logger.warn(
    "ALLOWED_ORIGINS is empty — cross-origin browser requests will be blocked",
  );
}
