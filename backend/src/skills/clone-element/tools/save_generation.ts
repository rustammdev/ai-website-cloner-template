import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { createGeneration } from "../../../db/generations.ts";
import { saveDataUrl } from "../../../storage/local.ts";
import { defineTool, getBag, toolError } from "./_shared.ts";

function normaliseFramework(raw: string): "react-tailwind" | "html" | "vue" {
  const v = raw.trim().toLowerCase();
  if (v === "html" || v === "plain-html") return "html";
  if (v === "vue" || v.startsWith("vue")) return "vue";
  return "react-tailwind";
}

export interface GenerationArtifact {
  generationId: string;
  name: string;
  framework: "react-tailwind" | "html" | "vue";
}

export const saveGeneration = defineTool(
  tool(
    async (input, config): Promise<[string, GenerationArtifact | { error: string }]> => {
      const { userId, conversationId, elementContext } = getBag(config);
      if (!userId || !conversationId) {
        const msg = "save_generation called outside a user session";
        return [toolError(msg), { error: msg }];
      }

      try {
        let screenshotUrl: string | undefined;
        if (elementContext?.screenshotDataUrl) {
          const upload = await saveDataUrl(
            userId,
            elementContext.screenshotDataUrl,
          );
          screenshotUrl = upload.url;
        }

        const sourceContext = elementContext
          ? {
              url: elementContext.url,
              selector: elementContext.selector,
              screenshotUrl,
            }
          : undefined;

        const framework = normaliseFramework(input.framework);
        const gen = await createGeneration({
          userId,
          conversationId,
          name: input.name,
          framework,
          code: input.code,
          cssCode: input.cssCode,
          dependencies: input.dependencies,
          sourceContext,
        });

        const artifact: GenerationArtifact = {
          generationId: gen.id,
          name: gen.name,
          framework: gen.framework,
        };
        const content = `Saved "${gen.name}" (${gen.framework}) to the user's dashboard. The UI will show a preview automatically. Do not call save_generation again this turn.`;
        return [content, artifact];
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return [toolError(message), { error: message }];
      }
    },
    {
      name: "save_generation",
      description:
        "Persist the finished UI component to the user's dashboard gallery. Call this EXACTLY ONCE per response, after you have written the final code. Do not call it for intermediate drafts, diagnostic snippets, or alternative variants. The `code` field should be what the user would copy-paste to use the component.",
      schema: z.object({
        name: z
          .string()
          .min(1)
          .max(120)
          .describe(
            "Short, human-readable name shown in the dashboard, e.g. 'Primary CTA button', 'Pricing card'.",
          ),
        framework: z
          .string()
          .min(1)
          .describe(
            "Target framework. Must be one of: 'react-tailwind' (default), 'html', 'vue'.",
          ),
        code: z
          .string()
          .min(1)
          .describe(
            "The component's code — the single artifact the user copies out.",
          ),
        cssCode: z
          .string()
          .optional()
          .describe(
            "Separate stylesheet, only for frameworks that don't embed styles in the markup (e.g. plain HTML).",
          ),
        dependencies: z
          .array(z.string())
          .optional()
          .describe(
            "npm packages the code imports, e.g. ['lucide-react']. Omit built-in / framework-core packages.",
          ),
      }),
      responseFormat: "content_and_artifact",
    },
  ),
  { requiresBridge: false, runLimit: 1 },
);
