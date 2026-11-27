import { NextRequest, NextResponse } from "next/server";
import { touchIndex } from "@/lib/rag";
import { isAuthorizedCron } from "@/lib/cronAuth";

export const runtime = "nodejs";
// 定期実行の結果をキャッシュさせない
export const dynamic = "force-dynamic";

/**
 * インデックスの休止防止
 * GET /api/keepalive  （vercel.json の crons から毎日 1 回呼ばれる）
 * Response: { ok: true, vectorCount, matched, at }
 */
export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    const { vectorCount, matched } = await touchIndex();
    return NextResponse.json({ ok: true, vectorCount, matched, at: new Date().toISOString() });
  } catch (e: unknown) {
    // 休止中は Upstash が空の応答を返し、JSON の読み込みで失敗する。ログで気付けるよう 503 にする
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 503 });
  }
}
