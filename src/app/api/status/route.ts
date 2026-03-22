import { NextResponse } from "next/server";
import { getStoreStats } from "@/lib/rag";

export const runtime = "nodejs";

export async function GET() {
  try {
    const stats = await getStoreStats();
    return NextResponse.json({
      ...stats,
      hasOpenAI: !!process.env.OPENAI_API_KEY,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
