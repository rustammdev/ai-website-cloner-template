import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { defineTool, getBag, runBridge } from "./_shared.ts";

export const requestChildStyles = defineTool(
  tool(
    async ({ parentSelector, childSelector }, config) => {
      const { bridge } = getBag(config);
      return runBridge(bridge, (b) =>
        b.requestChildStyles({ parentSelector, childSelector }),
      );
    },
    {
      name: "request_child_styles",
      description:
        "Run getComputedStyle() on one descendant of the picked element. Use when a single child's styling is missing from context and needed for the clone. Scoped to the picked subtree.",
      schema: z.object({
        parentSelector: z
          .string()
          .describe("CSS selector of the picked root element (from context.selector)."),
        childSelector: z
          .string()
          .describe(
            "CSS selector for the descendant, relative or absolute — whichever is unambiguous.",
          ),
      }),
    },
  ),
  { requiresBridge: true, runLimit: 4 },
);
