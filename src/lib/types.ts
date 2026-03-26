export type ModelId  = "gpt-5.4-nano" | "gpt-5.4-mini" | "gemini-2.5-flash";
export type UserRole = "designer" | "engineer";
export type SourceTag = "MDN" | "WCAG" | "WAI-ARIA" | "CUSTOM" | "CURATED";

export type Source = {
  id: string;
  score: number;
  source: SourceTag;
  title: string;
  section: string;
  url: string;
  snippet: string;
};

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  model?: ModelId;
  userRole?: UserRole;
  sources?: Source[];
  tokens?: { input?: number; output?: number };
  error?: boolean;
};

export type ChatSession = {
  id: string;
  title: string;
  messages: Message[];
  role: UserRole;
  createdAt: string;
};
