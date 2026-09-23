export type ModelId  = "gpt-6-luna" | "gemini-3.8-flash";
export type UserRole = "designer" | "engineer";
export type AnswerMode = "concise" | "detailed";
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
  grounded?: boolean; // false = 仕様外・AIの一般知識に基づく回答
  error?: boolean;
};

export type ChatSession = {
  id: string;
  title: string;
  messages: Message[];
  role: UserRole;
  createdAt: string;
};
