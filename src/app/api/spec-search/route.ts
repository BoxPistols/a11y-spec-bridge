import { NextRequest, NextResponse } from "next/server";
import { search, type Source } from "@/lib/rag";

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
    // CORS: 同一オリジン以外からも呼べるように
    const origin = req.headers.get("origin") ?? "";

    const { query, k = 6, source } = await req.json() as {
      query: string;
      k?: number;
      source?: Source;
    };

    if (!query) {
      return NextResponse.json({ error: "query required" }, { status: 400 });
    }

    const results = await search(query, Math.min(k, 20), source);

    const response = NextResponse.json({ results, count: results.length });
    response.headers.set("Access-Control-Allow-Origin", origin || "*");
    response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type");
    return response;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// CORS preflight
export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin") ?? "";
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin || "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
