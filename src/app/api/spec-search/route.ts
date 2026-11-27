import { NextRequest, NextResponse } from "next/server";
import { search } from "@/lib/rag";
import { parseSourceParam } from "@/lib/sources";

export const runtime = "nodejs";

/**
 * 仕様検索API（外部連携用）
 * ux-review-plugin 等の外部ツールがWCAG/ARIA/MDNの仕様を検索できる
 *
 * POST /api/spec-search
 * Body: { query: string, k?: number, source?: "MDN"|"WCAG"|"WAI-ARIA"|"CUSTOM"|"CURATED" }
 * Response: { results: SearchResult[] }
 */
export async function POST(req: NextRequest) {
  try {

    const { query, k = 6, source } = await req.json() as {
      query?: unknown;
      k?: unknown;
      source?: unknown;
    };

    if (typeof query !== "string" || !query) {
      return NextResponse.json({ error: "query required" }, { status: 400 });
    }
    // source は許可リストと完全一致した値だけを通す（フィルタ注入の防止）
    const parsedSource = parseSourceParam(source);
    if (!parsedSource.ok) {
      return NextResponse.json({ error: parsedSource.error }, { status: 400 });
    }
    // k は 1〜20 の整数に丸める
    const topK = Math.min(Math.max(Math.trunc(Number(k)) || 6, 1), 20);

    const results = await search(query, topK, parsedSource.source);

    const response = NextResponse.json({ results, count: results.length });
    // 公開の読み取り専用 API。Cookie は使わないため、送信元を反射せず "*" を明示する
    response.headers.set("Access-Control-Allow-Origin", "*");
    response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type");
    return response;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
