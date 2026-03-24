/**
 * src/lib/llm.ts — SpecBridge
 * ロール（designer / engineer）に応じてプロンプトを切り替える
 */

import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { SearchResult } from "./rag";

export type ModelId = "gpt-5.4-nano" | "gpt-5.4-mini" | "gemini-2.5-flash";
export type UserRole = "designer" | "engineer";
export type ChatMessage = { role: "user" | "assistant"; content: string };

export type LLMResponse = {
  answer: string;
  model: ModelId;
  inputTokens?: number;
  outputTokens?: number;
};

// ── ロール別システムプロンプト ────────────────────────
function buildSystem(role: UserRole): string {
  const base = `あなたは Web アクセシビリティ・HTML仕様・デザインシステムの専門家です。
提供されたコンテキスト（MDN / WCAG / WAI-ARIA の仕様）に基づいて回答してください。
コンテキストに情報がない場合は「参照できる仕様に該当情報がありません」と答えてください。
仕様の根拠を示す際は「WCAG 2.2 達成基準 X.X.X」のように具体的に引用してください。
ユーザーが前の回答について追加質問した場合は、会話の文脈を踏まえて回答してください。`;

  if (role === "designer") {
    return `${base}

回答対象はUIUXデザイナーです。以下を心がけてください:
- 技術的な実装詳細より「デザインの判断にどう影響するか」を中心に説明する
- 「このコンポーネントはこのシナリオで使うべき / 使うべきでない」を明確にする
- アクセシビリティ要件をデザイン仕様として具体的に表現する（例: フォーカスリングは最低3pxのアウトライン）
- コードは原則不要。必要な場合のみ簡潔に示す`;
  }

  return `${base}

回答対象はフロントエンドエンジニアです。以下を心がけてください:
- 実装レベルの詳細（属性名・値・役割）を正確に示す
- 対応ブラウザ・スクリーンリーダーの注意点を含める
- コード例（HTML / ARIA）を積極的に示す
- React / MUI等のフレームワーク文脈での実装パターンにも言及する`;
}

// ── コンテキスト組み立て ──────────────────────────────
function buildContext(results: SearchResult[]): string {
  return results
    .map((r, i) =>
      `[${i + 1}] [${r.source}] ${r.title} — ${r.section}\n${r.snippet}\n出典: ${r.url}`
    )
    .join("\n\n---\n\n");
}

// ── OpenAI ────────────────────────────────────────────
async function callOpenAI(
  model: "gpt-5.4-nano" | "gpt-5.4-mini",
  role: UserRole,
  context: string,
  question: string,
  history?: ChatMessage[],
  userApiKey?: string
): Promise<LLMResponse> {
  // mini はユーザーの API キー必須、nano はサーバーキー
  const apiKey = model === "gpt-5.4-mini"
    ? userApiKey
    : process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("API キーが設定されていません");
  const client = new OpenAI({ apiKey });
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: buildSystem(role) },
  ];
  // 会話履歴（最新の質問を除く過去分）
  if (history && history.length > 1) {
    for (const m of history.slice(0, -1)) {
      messages.push({ role: m.role, content: m.content });
    }
  }
  messages.push({
    role: "user",
    content: `コンテキスト:\n${context}\n\n質問: ${question}`,
  });
  const res = await client.chat.completions.create({
    model,
    temperature: 0,
    messages,
  });
  return {
    answer: res.choices[0].message.content ?? "",
    model,
    inputTokens: res.usage?.prompt_tokens,
    outputTokens: res.usage?.completion_tokens,
  };
}

// ── Gemini ────────────────────────────────────────────
async function callGemini(
  role: UserRole,
  context: string,
  question: string,
  history?: ChatMessage[]
): Promise<LLMResponse> {
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY ?? "");
  const m = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: buildSystem(role),
  });
  // 会話履歴付きチャット
  const chat = m.startChat({
    history: (history && history.length > 1)
      ? history.slice(0, -1).map(msg => ({
          role: msg.role === "assistant" ? "model" as const : "user" as const,
          parts: [{ text: msg.content }],
        }))
      : [],
  });
  const result = await chat.sendMessage(
    `コンテキスト:\n${context}\n\n質問: ${question}`
  );
  return {
    answer: result.response.text(),
    model: "gemini-2.5-flash",
    inputTokens: result.response.usageMetadata?.promptTokenCount,
    outputTokens: result.response.usageMetadata?.candidatesTokenCount,
  };
}

// ── ルーター ──────────────────────────────────────────
export async function generate(
  modelId: ModelId,
  role: UserRole,
  results: SearchResult[],
  question: string,
  history?: ChatMessage[],
  userApiKey?: string
): Promise<LLMResponse> {
  const context = buildContext(results);
  switch (modelId) {
    case "gpt-5.4-nano":
    case "gpt-5.4-mini":
      return callOpenAI(modelId, role, context, question, history, userApiKey);
    case "gemini-2.5-flash":
      return callGemini(role, context, question, history);
    default:
      throw new Error(`Unknown model: ${modelId}`);
  }
}
