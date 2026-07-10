import { NextRequest, NextResponse } from "next/server";
import { search, type Source } from "@/lib/rag";
import { generate, type ModelId, type UserRole, type AnswerMode } from "@/lib/llm";
import { checkRateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";

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

    if (model === "gpt-5.4-mini" && !userApiKey) {
      return NextResponse.json({ error: "GPT-5.4 mini にはご自身の OpenAI API キーが必要です" }, { status: 400 });
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

    const results = await search(question, k, filterSource);

    if (results.length === 0) {
      return NextResponse.json({
        answer: "関連する仕様ドキュメントが見つかりませんでした。別のキーワードで試してください。",
        sources: [],
        model,
      });
    }

    const llmRes = await generate(model, role, results, question, history, userApiKey, answerMode);

    return NextResponse.json({
      answer: llmRes.answer,
      sources: results,
      model: llmRes.model,
      tokens: { input: llmRes.inputTokens, output: llmRes.outputTokens },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
