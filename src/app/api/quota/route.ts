import { NextRequest, NextResponse } from "next/server";
import { getRemainingQuota } from "@/lib/ratelimit";

export const runtime = "nodejs";

/**
 * 残り回数取得
 * GET /api/quota
 * Header: x-invite-code (任意)
 * Response: { remaining: number, limit: number }
 */
export async function GET(req: NextRequest) {
  try {
    const inviteCode = req.headers.get("x-invite-code");
    const quota = await getRemainingQuota(req, inviteCode);
    return NextResponse.json(quota);
  } catch {
    return NextResponse.json({ remaining: 0, limit: 0 });
  }
}
