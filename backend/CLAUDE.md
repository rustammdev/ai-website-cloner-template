# Backend — Agent Server

Bun-based HTTP server that runs LangGraph agents, manages MongoDB state, and bridges the Chrome extension via Server-Sent Events.

## Tech Stack

- **Runtime:** Bun >= 1.1.0, ES modules
- **AI:** LangChain v1 + LangGraph (`createAgent`, `modelCallLimitMiddleware`)
- **Auth:** better-auth (email/password + optional Google OAuth)
- **DB:** MongoDB (cursor-based pagination, no ORM)
- **Validation:** Zod
- **Providers:** OpenAI, DeepSeek, Anthropic (optional), Google (optional)

## Commands

```bash
bun run dev        # hot-reload dev server (port 3001)
bun run start      # production
bun run typecheck  # tsc --noEmit
```

## Architecture

```
src/
  index.ts              # HTTP server, CORS, routing
  config.ts             # Env validation via Zod
  agent/
    runner.ts           # createAgent wrapper, prompt assembly, middleware
    translate.ts        # LangGraph stream → AgentEvent translator
  auth/
    instance.ts         # better-auth singleton
    session.ts          # requireSession() helper
  bridge/
    bridge.ts           # BrowserBridge interface + factory
    registry.ts         # SSE subscriber registry, pending RPC map
    stream.ts           # GET /bridge/subscribe SSE handler
    respond.ts          # POST /bridge/respond handler
    types.ts            # Wire protocol types (RpcRequest, RpcResponse)
  db/
    client.ts           # MongoClient singleton
    conversations.ts    # Conversation CRUD + message append
    generations.ts      # Generation CRUD
    pagination.ts       # Cursor encoding/decoding helpers
  lib/
    http.ts             # HttpError, error response helpers
    logger.ts           # Minimal JSON logger (stderr/stdout)
    types.ts            # Shared domain types
  models/
    registry.ts         # Multi-provider LLM registry
  routes/
    chat.ts             # POST /chat — SSE streaming + non-streaming
    conversations.ts    # GET /conversations, GET /conversations/:id
    generations.ts      # CRUD /generations/:id
    health.ts           # GET /health
    models.ts           # GET /models
    skills.ts           # GET /skills
    storage.ts          # GET /storage/:key
  skills/
    loader.ts           # Skill folder loader + cache
    clone-element/
      SKILL.md          # System prompt with frontmatter
      tools.ts          # LangChain tools for the skill
  storage/
    local.ts            # Local disk storage (swap for S3/R2 in production)
```

## Code Style

- **TypeScript strict mode** — no `any`, `noUncheckedIndexedAccess` on
- Named exports, PascalCase types, camelCase functions
- 2-space indentation
- No default exports

### Comments

Write **no comments** by default. Add one only when the WHY is non-obvious:
a hidden constraint, a security invariant, a framework quirk, a workaround for a
specific bug. If removing the comment wouldn't confuse a future reader, don't write it.

Never:
- Describe what the code does (the code already does that)
- Write section dividers (`// -------- section --------`)
- Add JSDoc that just repeats the function signature
- Reference the current task, issue, or caller in a comment

### DRY

Do not repeat logic. Extract a helper the moment the same pattern appears twice.
Prefer composition over duplication. Shared domain types live in `src/lib/types.ts`;
shared HTTP helpers in `src/lib/http.ts`.

### Error handling

Validate only at system boundaries (incoming HTTP bodies, env vars). Trust internal
code. Use `HttpError` for known failure modes; let unknown errors bubble to the
top-level handler in `index.ts`.

### Security

- Path traversal is blocked in `storage/local.ts` — keep the guard when modifying
- RPC requests are ownership-checked at both send (bridge.ts) and resolve (registry.ts)
- Untrusted page content is fenced in the system prompt to prevent injection
- CORS echoes only whitelisted origins (Fetch spec forbids wildcard + credentials)
