import { noInputBridgeTool } from "./_shared.ts";

export const getResponsive = noInputBridgeTool({
  name: "get_responsive",
  description:
    "Collect @media rules that match elements inside the picked subtree, each with its media query text, selector, and full cssText. Use to reproduce breakpoint-specific styling (Tailwind sm:/md:/lg: classes) accurately instead of eyeballing mobile vs desktop layouts. Auto-scoped to the picked element.",
  runLimit: 1,
  call: (b, selector) => b.getResponsive({ selector }),
});
