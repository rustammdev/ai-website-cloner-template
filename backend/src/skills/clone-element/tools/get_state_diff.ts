import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { StateTrigger } from "../../../bridge/types.ts";
import {
  defineTool,
  getBag,
  pickedSelector,
  runBridge,
  toolError,
  NO_SELECTOR_MSG,
} from "./_shared.ts";

const VALID_TRIGGERS = ["hover", "focus", "active", "scroll"] as const;

export const getStateDiff = defineTool(
  tool(
    async ({ trigger, scrollBy }, config) => {
      const { bridge, elementContext } = getBag(config);
      const selector = pickedSelector(elementContext);
      if (!selector) return toolError(NO_SELECTOR_MSG);
      return runBridge(bridge, (b) =>
        b.getStateDiff({
          selector,
          trigger: trigger as StateTrigger,
          scrollBy,
        }),
      );
    },
    {
      name: "get_state_diff",
      description:
        "Simulate hover/focus/active/scroll on the picked element (and descendants) and return only the CSS properties that CHANGE. Use to capture interactive states — :hover color shifts, focus rings, scroll-shadow effects — that the static computed-style snapshot can't see. Auto-scoped to the picked element.",
      schema: z.object({
        trigger: z
          .enum(VALID_TRIGGERS)
          .describe(
            "Which interaction to simulate: 'hover', 'focus', 'active', or 'scroll'.",
          ),
        scrollBy: z
          .number()
          .optional()
          .describe(
            "Pixels to scroll when trigger='scroll' (default 400). Ignored otherwise.",
          ),
      }),
    },
  ),
  { requiresBridge: true, runLimit: 3 },
);
