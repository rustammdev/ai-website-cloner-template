import { noInputBridgeTool } from "./_shared.ts";

export const getBehaviors = noInputBridgeTool({
  name: "get_behaviors",
  description:
    "Find dynamic/interactive behaviors inside the picked element: sticky positioning, scroll-snap, CSS transitions, CSS animations, interactive elements (with role / tabindex / cursor), and overflow axes. Use before recreating animated UI — otherwise motion and scroll effects get lost. Auto-scoped to the picked element.",
  runLimit: 1,
  call: (b, selector) => b.getBehaviors({ selector }),
});
