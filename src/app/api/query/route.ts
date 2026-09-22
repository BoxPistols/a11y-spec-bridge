import { NextRequest, NextResponse } from "next/server";
import { search, type Source } from "@/lib/rag";
import { generate, type ModelId, type UserRole, type AnswerMode } from "@/lib/llm";
import { checkRateLimit } from "@/lib/ratelimit";
import { parseGrounding } from "@/lib/helpers";

export const runtime = "nodejs";

// ── プロバイダのエラーをユーザー向けに正規化 ──────────
// SDK の生エラー（"[503 Service Unavailable] This model is currently..."）をそのまま
// 返すと何をすればいいか分からないため、HTTP ステータスと日本語メッセージに変換する
function toUserError(e: unknown): { message: string; status: number } {
  const raw = e instanceof Error ? e.message : String(e);
  if (/\b(503|overloaded|high demand|Service Unavailable)\b/i.test(raw)) {
    return { message: "AI サービスが混雑しています。少し待つか、別のモデルをお試しください。", status: 503 };
  }
  if (/\b429\b|rate limit|quota/i.test(raw)) {
    return { message: "AI サービスの利用上限に達しました。時間をおくか、ご自身の API キーを設定してください。", status: 429 };
  }
  if (/\b401\b|invalid api key|API キーが設定されていません/i.test(raw)) {
    return { message: "API キーが無効、または未設定です。設定画面をご確認ください。", status: 401 };
  }
  return { message: raw, status: 500 };
}

export async function POST(req: NextRequest) {
  try {
    const { question, model, role = "designer", mode, k = 6, filterSource, history } = await req.json() as {
      question: string;
      model: ModelId;
      role?: UserRole;
      mode?: AnswerMode;
      k?: number;
      filterSource?: Source;
      history?: { role: "user" | "assistant"; content: string }[];
    };
    // 不正値は concise に丸める（デフォルトも concise = 結論ファースト）
    const answerMode: AnswerMode = mode === "detailed" ? "detailed" : "concise";

    // ユーザー API キーはヘッダーから取得（ボディには含めない）
    const userApiKey = req.headers.get("x-user-api-key") ?? undefined;

    if (!question) return NextResponse.json({ error: "question required" }, { status: 400 });
    if (!model)    return NextResponse.json({ error: "model required" },    { status: 400 });

    // Gemini Pro は無料枠の対象外。自前の API キーがないと呼べない
    if (model === "gemini-2.5-pro" && !userApiKey) {
      return NextResponse.json({ error: "Gemini 2.5 Pro にはご自身の Gemini API キーが必要です" }, { status: 400 });
    }

    // レート制限（自分のAPIキーがあればスキップ）
    if (!userApiKey) {
      const inviteCode = req.headers.get("x-invite-code");
      const rl = await checkRateLimit(req, inviteCode);
      if (!rl.allowed) {
        return NextResponse.json(
          { error: `本日の利用上限（${rl.limit}回）に達しました。ご自身のAPIキーを設定すると無制限に利用できます。`, remaining: 0, limit: rl.limit },
          { status: 429 },
        );
      }
    }

    // 仕様に該当が無くても門前払いしない。検索結果が空でも generate に渡し、
    // LLM が一般知識で回答する（回答先頭の [[GENERAL]] センチネルで grounded を判定）
    const results = await search(question, k, filterSource);

    const llmRes = await generate(model, role, results, question, history, userApiKey, answerMode);

    // 一般知識回答なら先頭センチネルを剥がして grounded=false
    const parsed = parseGrounding(llmRes.answer);
    // サーバ側の裏付け: コンテキストが1件も無ければ「仕様ベース」はあり得ない
    // （LLM がセンチネルを付け忘れても grounded=true にしない）
    const grounded = parsed.grounded && results.length > 0;
    const answer = parsed.answer;

    return NextResponse.json({
      answer,
      // 仕様外の一般知識回答では、無関係な低スコア結果を根拠として見せない
      sources: grounded ? results : [],
      grounded,
      model: llmRes.model,
      tokens: { input: llmRes.inputTokens, output: llmRes.outputTokens },
    });
  } catch (e: unknown) {
    const { message, status } = toUserError(e);
    return NextResponse.json({ error: message }, { status });
  }
}
