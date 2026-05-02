import { noInputBridgeTool } from "./_shared.ts";

export const getDesignTokens = noInputBridgeTool({
  name: "get_design_tokens",
  description:
    "Aggregate the palette inside the picked element: distinct colors, background colors, font families, font sizes, font weights, border radii, box shadows, and gradients — each with a usage count and sample selectors. Use this to pick the right Tailwind named tokens (e.g. nearest violet-* or slate-*) instead of guessing. Auto-scoped to the picked element.",
  runLimit: 1,
  call: (b, selector) => b.getDesignTokens({ selector }),
});
