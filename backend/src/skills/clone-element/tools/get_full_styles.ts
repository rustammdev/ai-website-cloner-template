import { tool } from "@langchain/core/tools";
import { z } from "zod";
import {
  defineTool,
  getBag,
  pickedSelector,
  runBridge,
  toolError,
  NO_SELECTOR_MSG,
} from "./_shared.ts";

export const getFullStyles = defineTool(
  tool(
    async ({ maxDepth }, config) => {
      const { bridge, elementContext } = getBag(config);
      const selector = pickedSelector(elementContext);
      if (!selector) return toolError(NO_SELECTOR_MSG);
      return runBridge(
        bridge,
        (b) => b.getFullStyles({ selector, maxDepth }),
        "style tree too deep — lower maxDepth and retry",
      );
    },
    {
      name: "get_full_styles",
      description:
        "Walk the picked element and its descendants, returning a tree of every element's non-default computed styles (box model, typography, layout, SVG fill/stroke, everything). Lightweight per node — the extension diffs against browser defaults so you only see properties the site actually set. Use as your primary reference when the initial computedStyles map is too shallow. Auto-scoped to the picked element.",
      schema: z.object({
        maxDepth: z
          .number()
          .int()
          .min(0)
          .max(8)
          .optional()
          .describe("Descent depth, 0–8 (default 3). Keep low for big subtrees."),
      }),
    },
  ),
  { requiresBridge: true, runLimit: 2 },
);
