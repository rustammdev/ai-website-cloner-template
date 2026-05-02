import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { env } from "../config.ts";
import type { ModelDescriptor } from "../lib/types.ts";

/**
 * Flat, data-driven model catalogue. Adding a new model is one row; adding a
 * new provider is one row here plus one branch in `instantiate()` below. The
 * rest (listing, availability checks, default resolution, vision detection)
 * derives automatically.
 *
 * `vision: true` means the model accepts `image_url` content blocks alongside
 * text. When false or absent, the runner strips screenshots out of outgoing
 * messages — text-only providers (e.g. DeepSeek) reject unknown content
 * variants with a 400 instead of silently ignoring them.
 */

export type ProviderId = "openai" | "deepseek" | "anthropic" | "google";

interface ModelEntry {
  provider: ProviderId;
  id: string;
  label: string;
  vision?: boolean;
}

const MODELS: readonly ModelEntry[] = [
  { provider: "openai", id: "gpt-4o-mini", label: "GPT-4o mini", vision: true },
  { provider: "openai", id: "gpt-4o", label: "GPT-4o", vision: true },
  {
    provider: "openai",
    id: "gpt-4.1",
    label: "GPT-4.1 (coding · 1M context)",
    vision: true,
  },
  {
    provider: "openai",
    id: "gpt-4.1-mini",
    label: "GPT-4.1 mini (coding)",
    vision: true,
  },
  {
    provider: "openai",
    id: "o4-mini",
    label: "o4-mini (reasoning · coding)",
    vision: true,
  },
  { provider: "openai", id: "o3-mini", label: "o3-mini (reasoning · cheaper)" },
  { provider: "deepseek", id: "deepseek-chat", label: "DeepSeek V3 (chat)" },
  {
    provider: "deepseek",
    id: "deepseek-reasoner",
    label: "DeepSeek R1 (reasoner)",
  },
  {
    provider: "anthropic",
    id: "claude-sonnet-4-6",
    label: "Claude Sonnet 4.6",
    vision: true,
  },
  {
    provider: "anthropic",
    id: "claude-haiku-4-5-20251001",
    label: "Claude Haiku 4.5",
    vision: true,
  },
  {
    provider: "anthropic",
    id: "claude-opus-4-7",
    label: "Claude Opus 4.7",
    vision: true,
  },
  {
    provider: "google",
    id: "gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    vision: true,
  },
];

const API_KEY: Record<ProviderId, string | undefined> = {
  openai: env.OPENAI_API_KEY,
  deepseek: env.DEEPSEEK_API_KEY,
  anthropic: env.ANTHROPIC_API_KEY,
  google: env.GOOGLE_API_KEY,
};

function providerAvailable(p: ProviderId): boolean {
  return Boolean(API_KEY[p]);
}

function isKnownProvider(p: string): p is ProviderId {
  return p === "openai" || p === "deepseek" || p === "anthropic" || p === "google";
}

export function listModels(): ModelDescriptor[] {
  return MODELS.map((m) => ({
    provider: m.provider,
    id: m.id,
    label: m.label,
    available: providerAvailable(m.provider),
  }));
}

export interface ResolvedModel {
  model: BaseChatModel;
  vision: boolean;
}

/**
 * `initChatModel` is the v1 idiom — a single entry point that dispatches to
 * the right provider class and applies provider-agnostic options. DeepSeek
 * requires a base-URL override that `initChatModel`'s JS option surface does
 * not expose, so that one keeps its direct ChatOpenAI path.
 */
async function instantiate(
  provider: ProviderId,
  modelId: string,
  apiKey: string,
): Promise<BaseChatModel> {
  if (provider === "deepseek") {
    const { ChatOpenAI } = await import("@langchain/openai");
    return new ChatOpenAI({
      model: modelId,
      apiKey,
      temperature: 0,
      configuration: { baseURL: "https://api.deepseek.com/v1" },
    });
  }

  if (provider === "anthropic") {
    await import("@langchain/anthropic").catch(() => {
      throw new Error("Install @langchain/anthropic to use this provider.");
    });
  }
  if (provider === "google") {
    await import("@langchain/google-genai").catch(() => {
      throw new Error("Install @langchain/google-genai to use this provider.");
    });
  }

  // Reasoning models (o1/o3/o4 family) reject the `temperature` param.
  const isReasoning = provider === "openai" && /^o\d/.test(modelId);
  const modelProvider = provider === "google" ? "google-genai" : provider;

  const { initChatModel } = await import("langchain");
  return initChatModel(modelId, {
    modelProvider,
    apiKey,
    ...(isReasoning ? {} : { temperature: 0 }),
  });
}

export async function getModel(
  provider: string = env.DEFAULT_PROVIDER,
  modelId: string = env.DEFAULT_MODEL,
): Promise<ResolvedModel> {
  if (!isKnownProvider(provider)) {
    throw new Error(
      `Unknown provider "${provider}". Known: openai, deepseek, anthropic, google.`,
    );
  }
  const apiKey = API_KEY[provider];
  if (!apiKey) {
    throw new Error(
      `Provider "${provider}" is not configured. Set the corresponding API key in .env.`,
    );
  }
  const model = await instantiate(provider, modelId, apiKey);
  // Unknown model IDs (e.g. a typo) fall back to `vision: false` — safer to
  // drop the screenshot than to send it to a model that will 400 on it.
  const vision =
    MODELS.find((m) => m.provider === provider && m.id === modelId)?.vision ??
    false;
  return { model, vision };
}
