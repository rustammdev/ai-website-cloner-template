import { tool } from "@langchain/core/tools";
import { z } from "zod";
import {
  defineTool,
  getBag,
  runBridge,
  toolError,
  NO_SELECTOR_MSG,
} from "./_shared.ts";

export const requestExactCopy = defineTool(
  tool(
    async (_, config) => {
      const { bridge, elementContext } = getBag(config);
      const selector = elementContext?.selector;
      if (!selector) return toolError(NO_SELECTOR_MSG);
      return runBridge(
        bridge,
        (b) => b.requestExactCopy({ selector }),
        "exact-copy HTML too large — infer from the first ~80 KB",
      );
    },
    {
      name: "request_exact_copy",
      description:
        "Extract the picked element as a standalone HTML document with EVERY computed style inlined, plus all matched stylesheet rules including :hover/:focus/::before/::after pseudo-classes, @media queries, @keyframes animations, and @font-face declarations. Ground-truth CSS for gradients, shadows, custom fonts, animations, and state styles — call when the visible design contains any of those and you can't infer them from the initial computed-style map. Large payload; call at most once per turn. Scoped to the picked subtree.",
      schema: z.object({}),
    },
  ),
  { requiresBridge: true, runLimit: 1 },
);
