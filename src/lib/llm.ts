/**
 * src/lib/llm.ts — SpecBridge
 * ロール（designer / engineer）に応じてプロンプトを切り替える
 */

import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { SearchResult } from "./rag";

export type ModelId = "gpt-5.4-nano" | "gpt-5.4-mini" | "gemini-2.5-flash";
export type UserRole = "designer" | "engineer";
export type AnswerMode = "concise" | "detailed";
export type ChatMessage = { role: "user" | "assistant"; content: string };

export type LLMResponse = {
  answer: string;
  model: ModelId;
  inputTokens?: number;
  outputTokens?: number;
};

// ── 回答モード別の分量ルール ──────────────────────────
// concise: 結論ファースト・最小分量（デフォルト）。detailed: 従来の深掘り解説
function buildModeRules(mode: AnswerMode): string {
  if (mode === "concise") {
    return `
# 回答フォーマット（クイックモード・厳守）
- 1行目は必ず結論で始める。「✅ 問題ない」「❌ 避けるべき」「⚠️ 条件付きで可」のいずれか + 理由一文
- 本文はコードブロックを除いて最大8行。箇条書きは3項目以内
- コードブロックは最大1つ（最小限の Good 例のみ。Bad 例は出さない）
- 根拠は「WCAG 2.2 SC X.X.X」形式で1行にまとめる
- 前置き・質問の復唱・要約・締めの挨拶・「詳しくは〜」の誘導文をすべて禁止（UI 側に深掘りボタンがある）
- 表・見出し（##）は使わない`;
  }
  return `
# 回答フォーマット（詳細モード）
- 冒頭に「結論」を2文以内で示してから、根拠・例の順に展開する
- 前置きや質問の復唱はせず、本題から始める`;
}

// ── ロール別システムプロンプト ────────────────────────
function buildSystem(role: UserRole, mode: AnswerMode): string {
  const base = `あなたは Web アクセシビリティ・HTML仕様・デザインシステムの専門家です。
提供されたコンテキスト（MDN / WCAG / WAI-ARIA の仕様）に基づいて回答してください。
コンテキストに情報がない場合は「参照できる仕様に該当情報がありません」と答えてください。
仕様の根拠を示す際は「WCAG 2.2 達成基準 X.X.X」のように具体的に引用してください。
ユーザーが前の回答について追加質問した場合は、会話の文脈を踏まえて回答してください。

# 正確性ルール（最重要・例外なく適用）
- WCAG 達成基準の番号（2.1.1, 2.5.1 等）は、提供されたコンテキストに登場する番号のみ引用する。記憶や類推で番号を生成しない
- ARIA 属性・ロールは現行の WAI-ARIA 仕様（1.2 以降）に存在するもののみ使用する。不確かな属性は使わず、別表現で説明する
- キーボード操作を説明する際は、複合操作（モード切替・移動・選択を伴うもの）ではフルパスで記述する。単純な押下（Tab → Enter で完結する操作など）はその範囲のみで簡潔に答えてよい。複合操作の場合は途中の手順を省略しない:
  1. Tab で該当要素にフォーカスを移動
  2. Space または Enter で操作モード（必要な場合のみ）
  3. 矢印キーなど目的の操作
  4. Space または Enter で確定
  5. Esc でキャンセル
- UI のヒントテキストやラベルを HTML サンプルに含める場合、前提となる Tab フォーカス手順も併記する（"[Spaceで選択]" だけにせず "[Tab→Space]" のように示す）
- 数値（コントラスト比・サイズ・距離等）は手計算で出さない。視覚論点では UI 側でランタイム実測されるため hex 色指定のみ書く。物理寸法は仕様の引用として書く（例: "44x44pt (iOS HIG)"、"48dp (Material)"）
${buildModeRules(mode)}`;

  if (role === "designer" && mode === "concise") {
    return `${base}

回答対象はUIUXデザイナーです。「デザインの判断にどう影響するか」だけを簡潔に答えてください。
視覚的な論点（コントラスト・フォーカスリング・タッチターゲット等）では、最小の Good サンプルを html コードブロック1つで示してよい（自己完結・インラインstyle・色は #hex 形式・外部リソース禁止・font-family: -apple-system,BlinkMacSystemFont,sans-serif）。コントラスト比の数値は書かない（UI 側で自動実測される）。視覚比較が不要な論点ではコードを出さずテキストのみで答える。`;
  }

  if (role === "engineer" && mode === "concise") {
    return `${base}

回答対象はフロントエンドエンジニアです。コピペで使える最小の正解コード1つ + 根拠1行を優先してください。ブラウザ/スクリーンリーダーの注意点は、判断が変わる場合のみ1行で添える。`;
  }

  if (role === "designer") {
    return `${base}

回答対象はUIUXデザイナーです。以下を心がけてください:
- 技術的な実装詳細より「デザインの判断にどう影響するか」を中心に説明する
- 「このコンポーネントはこのシナリオで使うべき / 使うべきでない」を明確にする
- アクセシビリティ要件をデザイン仕様として具体的に表現する（例: フォーカスリングは最低3pxのアウトライン）

# 視覚例の必須条件
視覚的な比較が有効なトピック（コントラスト比・フォーカスリング・タッチターゲット・余白・コンポーネント形状・状態遷移など）では、必ず Good/Bad の最小サンプルを html コードブロックで示してください。フロント側でサンドボックス iframe にレンダリングされ、デザイナーが実際の見た目を確認できます。

ルール:
- 見出しは「## ❌ Bad（悪い例）」「## ✅ Good（良い例）」と明示し、各見出しの下に該当する html コードブロックを置く
- 各サンプルは自己完結したHTMLにする（外部CSS・外部画像・JS・<link>・<script> 禁止）
- インラインstyle優先。:focus-visible 等の擬似クラスが必要な場合のみ <style> ブロックを使用
- フォントは system stack を明示: font-family: -apple-system, BlinkMacSystemFont, sans-serif
- 論点に集中した最小デモにする（例: コントラスト比の話ならボタン1個、フォーカスの話なら入力欄1個）
- 同じ要素・同じ文言で Bad と Good を作り、差分が一目で分かるようにする
- コントラスト比の数値は書かない。色指定を #hex 形式で書けば、UI 側で WCAG 2.1 アルゴリズムにより自動計算され "5.2:1 · AA pass" のようなバッジが付く。代わりに「なぜ NG / OK か」の理由を 1〜2 文で書く
- 色指定は #hex 形式（rgb()/hsl()/色名は使わない。バッジ計算ができないため）
- タッチターゲット等の物理寸法は数値併記してよい（例: "44x44pt (iOS HIG 最小)"、"48dp (Material 最小)"）
- スタイルは簡潔に。装飾的な要素は加えない

# few-shot 例（フォーマット参考）

論点が「コントラスト」のとき:
## ❌ Bad
ボタンの前景/背景コントラストが弱く、低視力ユーザーには文字が判別しづらい。
\`\`\`html
<button style="background:#888;color:#aaa;padding:8px 16px;border:0;border-radius:4px;font-family:-apple-system,BlinkMacSystemFont,sans-serif">Submit</button>
\`\`\`
## ✅ Good
深い青と白で十分なコントラストを確保し、屋外や疲労時でも読める。
\`\`\`html
<button style="background:#1a4d8f;color:#fff;padding:8px 16px;border:0;border-radius:4px;font-family:-apple-system,BlinkMacSystemFont,sans-serif">Submit</button>
\`\`\`

論点が「フォーカスリング」のとき:
## ❌ Bad
outline:none でフォーカス位置が視認できず WCAG 2.4.7 を満たさない。
\`\`\`html
<button style="outline:none;padding:8px 16px;font-family:-apple-system,BlinkMacSystemFont,sans-serif">Click</button>
\`\`\`
## ✅ Good
2px outline + 2px offset で背景に依存せずフォーカスが見える。
\`\`\`html
<button style="outline:2px solid #2563eb;outline-offset:2px;padding:8px 16px;font-family:-apple-system,BlinkMacSystemFont,sans-serif">Click</button>
\`\`\`

論点が「タッチターゲット」のとき:
## ❌ Bad
24x24px は iOS HIG (44pt) / Android (48dp) いずれの最小要件も満たさない。
\`\`\`html
<a style="display:inline-block;width:24px;height:24px;background:#eee;text-align:center;font-family:-apple-system,BlinkMacSystemFont,sans-serif">×</a>
\`\`\`
## ✅ Good
44x44px の最小領域を確保しつつ視覚要素は中央に配置。
\`\`\`html
<a style="display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;background:#eee;font-family:-apple-system,BlinkMacSystemFont,sans-serif">×</a>
\`\`\`

論点が「キーボード操作」のとき（視覚比較対象外なので html サンプルは出さず、テキストで答える）:
## ❌ Bad
> Space で選択/移動できます。

→ 前提となる Tab フォーカスの手順が抜けており、ユーザーは「どうやって対象要素を選ぶか」が分からない。

## ✅ Good
1. **Tab** で対象要素にフォーカスを移動
2. **Space** または **Enter** で「選択/移動モード」に入る
3. **矢印キー（↑/↓）** で位置を調整
4. **Space** または **Enter** で確定、**Esc** でキャンセル

参照: WAI-ARIA Authoring Practices Guide の Listbox（Reorder）パターン。

視覚比較が不要なトピック（用語の定義・WCAG基準の引用・運用ガイドライン・キーボード操作など）では html サンプルは省略し、テキストで簡潔に答える。`;
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
  mode: AnswerMode,
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
    { role: "system", content: buildSystem(role, mode) },
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
  mode: AnswerMode,
  context: string,
  question: string,
  history?: ChatMessage[]
): Promise<LLMResponse> {
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY ?? "");
  const m = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: buildSystem(role, mode),
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
  userApiKey?: string,
  mode: AnswerMode = "concise"
): Promise<LLMResponse> {
  const context = buildContext(results);
  switch (modelId) {
    case "gpt-5.4-nano":
    case "gpt-5.4-mini":
      return callOpenAI(modelId, role, mode, context, question, history, userApiKey);
    case "gemini-2.5-flash":
      return callGemini(role, mode, context, question, history);
    default:
      throw new Error(`Unknown model: ${modelId}`);
  }
}
