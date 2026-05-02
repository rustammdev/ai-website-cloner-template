import { noInputBridgeTool } from "./_shared.ts";

export const getSvgs = noInputBridgeTool({
  name: "get_svgs",
  description:
    "Extract inline <svg> markup (with viewBox and dimensions) from the picked element, deduplicated and with an occurrence count. Use to port icons verbatim rather than guessing from Lucide — match the exact paths the source ships. Auto-scoped to the picked element.",
  runLimit: 1,
  call: (b, selector) => b.getSvgs({ selector }),
});
