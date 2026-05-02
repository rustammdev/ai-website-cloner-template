import type { DefinedTool } from "./_shared.ts";
import { requestChildStyles } from "./request_child_styles.ts";
import { requestExactCopy } from "./request_exact_copy.ts";
import { getFullStyles } from "./get_full_styles.ts";
import { getStateDiff } from "./get_state_diff.ts";
import { getAssets } from "./get_assets.ts";
import { getDesignTokens } from "./get_design_tokens.ts";
import { getBehaviors } from "./get_behaviors.ts";
import { getSvgs } from "./get_svgs.ts";
import { getResponsive } from "./get_responsive.ts";
import { saveGeneration } from "./save_generation.ts";

export const tools: DefinedTool[] = [
  requestChildStyles,
  requestExactCopy,
  getFullStyles,
  getStateDiff,
  getAssets,
  getDesignTokens,
  getBehaviors,
  getSvgs,
  getResponsive,
  saveGeneration,
];

export type { DefinedTool, ToolMeta } from "./_shared.ts";
