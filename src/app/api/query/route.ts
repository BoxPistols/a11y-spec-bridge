import { NextRequest, NextResponse } from "next/server";
import { search, type Source } from "@/lib/rag";
import { generate, type ModelId, type UserRole } from "@/lib/llm";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { question, model, role = "designer", k = 6, filterSource, history } = await req.json() as {
      question: string;
      model: ModelId;
      role?: UserRole;
      k?: number;
      filterSource?: Source;
      history?: { role: "user" | "assistant"; content: string }[];
    };

    if (!question) return NextResponse.json({ error: "question required" }, { status: 400 });
    if (!model)    return NextResponse.json({ error: "model required" },    { status: 400 });

    const results = await search(question, k, filterSource);

    if (results.length === 0) {
      return NextResponse.json({
        answer: "関連する仕様ドキュメントが見つかりませんでした。別のキーワードで試してください。",
        sources: [],
        model,
      });
    }

    const llmRes = await generate(model, role, results, question, history);

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
