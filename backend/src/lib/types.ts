export type Role = "user" | "assistant" | "system" | "tool";

export interface ChatMessage {
  role: Role;
  content: string;
}

export interface ChatRequest {
  skill: string;
  model?: string;
  provider?: string;
  messages: ChatMessage[];
  context?: ElementContext;
}

export interface ChildElementInfo {
  tagName: string;
  text?: string;
  id?: string;
  classes?: string;
  styles: Record<string, string>;
}

export interface AnimationInfo {
  id: string | null;
  type: string;
  playState: string;
  duration: number | string | null;
  delay: number | null;
  easing: string | null;
  iterations: number | null;
  keyframes: unknown[];
}

export interface PseudoElementInfo {
  content: string;
  styles: Record<string, string>;
}

export interface ParentLayoutInfo {
  tagName: string;
  selector: string;
  display: string;
  position: string;
  flexDirection?: string;
  flexWrap?: string;
  justifyContent?: string;
  alignItems?: string;
  gap?: string;
  gridTemplateColumns?: string;
  gridTemplateRows?: string;
  width: string;
  height: string;
}

export interface PaletteSummary {
  colors: string[];
  backgroundColors: string[];
  fontFamilies: string[];
  fontSizes: string[];
  fontWeights: string[];
  borderRadii: string[];
  boxShadows: string[];
  gradients: string[];
}

export interface ElementContext {
  url?: string;
  outerHTML?: string;
  computedStyles?: Record<string, string>;
  screenshotDataUrl?: string;
  tagName?: string;
  selector?: string;
  children?: ChildElementInfo[];
  animations?: AnimationInfo[];
  pseudoElements?: {
    before?: PseudoElementInfo;
    after?: PseudoElementInfo;
  };
  parentLayout?: ParentLayoutInfo;
  cssVariables?: Record<string, string>;
  paletteSummary?: PaletteSummary;
  textContent?: string;
  className?: string;
  attributes?: Record<string, string>;
}

export interface ModelDescriptor {
  provider: string;
  id: string;
  label: string;
  available: boolean;
}

export interface SkillDescriptor {
  name: string;
  description: string;
  argumentHint?: string;
}

export type Framework = "react-tailwind" | "html" | "vue";

export interface SourceContext {
  url?: string;
  selector?: string;
  screenshotUrl?: string;
}

export interface Generation {
  id: string;
  userId: string;
  conversationId: string;
  name: string;
  framework: Framework;
  code: string;
  cssCode?: string;
  dependencies: string[];
  sourceContext?: SourceContext;
  thumbnailUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GenerationSummary {
  id: string;
  name: string;
  framework: Framework;
  thumbnailUrl?: string;
  sourceScreenshotUrl?: string;
  conversationId: string;
  createdAt: string;
  updatedAt: string;
}
