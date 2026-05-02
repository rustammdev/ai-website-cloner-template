import { noInputBridgeTool } from "./_shared.ts";

export const getAssets = noInputBridgeTool({
  name: "get_assets",
  description:
    "Enumerate images (<img>, srcset, background-image), videos, SVGs, and iframes inside the picked element, with absolute URLs, natural/display dimensions, and source selectors. Call before writing the component if it contains media — you'll need the real URLs rather than placeholders. Auto-scoped to the picked element.",
  runLimit: 1,
  call: (b, selector) => b.getAssets({ selector }),
});
