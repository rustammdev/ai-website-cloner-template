/**
 * Wire protocol between the Chrome extension and the backend.
 *
 * The backend pushes `RpcRequest` frames down an SSE stream
 * (`GET /bridge/subscribe`). The extension replies with exactly one
 * `RpcResponse` per request by POSTing `{ conversationId, response }` to
 * `POST /bridge/respond`. Out-of-band telemetry is modelled as `RpcEvent`
 * (currently unused on the server).
 */

export type RpcMethod =
  | "request_child_styles"
  | "request_exact_copy"
  | "get_full_styles"
  | "get_state_diff"
  | "get_assets"
  | "get_design_tokens"
  | "get_behaviors"
  | "get_svgs"
  | "get_responsive";

export type StateTrigger = "hover" | "focus" | "active" | "scroll";

export interface RpcRequest<P = unknown> {
  type: "request";
  requestId: string;
  method: RpcMethod;
  params: P;
}

export type RpcResponse<R = unknown> =
  | {
      type: "response";
      requestId: string;
      ok: true;
      data: R;
    }
  | {
      type: "response";
      requestId: string;
      ok: false;
      error: string;
    };

export interface RpcEvent<P = unknown> {
  type: "event";
  name: string;
  data: P;
}

export type RpcInbound = RpcResponse | RpcEvent;
export type RpcOutbound = RpcRequest;

export interface RequestChildStylesParams {
  parentSelector: string;
  childSelector: string;
}

export interface RequestChildStylesResult {
  styles: Record<string, string>;
}

export interface RequestExactCopyParams {
  selector: string;
}

export interface RequestExactCopyResult {
  html: string;
}

export interface GetFullStylesParams {
  selector: string;
  maxDepth?: number;
}

export interface FullStyleNode {
  selector: string;
  tagName: string;
  id?: string;
  classes?: string;
  text?: string;
  styles: Record<string, string>;
  children?: FullStyleNode[];
}

export interface GetFullStylesResult {
  tree: FullStyleNode;
}

export interface GetStateDiffParams {
  selector: string;
  trigger: StateTrigger;
  scrollBy?: number;
}

export interface StyleDiffEntry {
  selector: string;
  tagName: string;
  changes: Record<string, { from: string; to: string }>;
}

export interface GetStateDiffResult {
  trigger: StateTrigger;
  entries: StyleDiffEntry[];
}

export interface SelectorParams {
  selector: string;
}

export interface AssetImage {
  src: string;
  alt: string | null;
  naturalWidth: number;
  naturalHeight: number;
  displayWidth: number;
  displayHeight: number;
  srcset: string | null;
  loading: string | null;
  position: string;
  zIndex: string;
  selector: string;
}

export interface AssetVideo {
  src: string | null;
  poster: string | null;
  autoplay: boolean;
  loop: boolean;
  muted: boolean;
  selector: string;
}

export interface AssetBackground {
  url: string;
  selector: string;
  tagName: string;
  position: string;
  zIndex: string;
}

export interface AssetReport {
  images: AssetImage[];
  videos: AssetVideo[];
  backgroundImages: AssetBackground[];
  svgCount: number;
  iframes: { src: string | null; selector: string }[];
}

export interface DesignToken<T> {
  value: T;
  count: number;
  sampleSelectors: string[];
}

export interface DesignTokens {
  colors: DesignToken<string>[];
  backgroundColors: DesignToken<string>[];
  fontFamilies: DesignToken<string>[];
  fontSizes: DesignToken<string>[];
  fontWeights: DesignToken<string>[];
  borderRadii: DesignToken<string>[];
  boxShadows: DesignToken<string>[];
  gradients: DesignToken<string>[];
}

export interface BehaviorReport {
  sticky: { selector: string; top: string; zIndex: string }[];
  scrollSnap: { selector: string; type: string; align?: string }[];
  transitions: {
    selector: string;
    property: string;
    duration: string;
    easing: string;
  }[];
  animations: {
    selector: string;
    name: string;
    duration: string;
    iterations: string;
    easing: string;
  }[];
  interactive: {
    selector: string;
    tag: string;
    role: string | null;
    tabIndex: number;
    cursor: string;
  }[];
  overflow: { selector: string; x: string; y: string }[];
}

export interface ExtractedSvg {
  name: string;
  viewBox: string | null;
  width: string | null;
  height: string | null;
  markup: string;
  occurrences: number;
  sampleSelector: string;
}

export interface GetSvgsResult {
  svgs: ExtractedSvg[];
}

export interface ResponsiveRule {
  media: string;
  selector: string;
  cssText: string;
}

export interface GetResponsiveResult {
  rules: ResponsiveRule[];
}

export function isRpcResponse(value: unknown): value is RpcResponse {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    v.type === "response" &&
    typeof v.requestId === "string" &&
    (v.ok === true || v.ok === false)
  );
}

export function isRpcEvent(value: unknown): value is RpcEvent {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return v.type === "event" && typeof v.name === "string";
}
