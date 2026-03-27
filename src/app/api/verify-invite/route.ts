import { NextRequest, NextResponse } from "next/server";
import { isValidInviteCode } from "@/lib/ratelimit";

export const runtime = "nodejs";

/**
 * 招待コード検証
 * POST /api/verify-invite
 * Body: { code: string }
 * Response: { valid: boolean }
 */
export async function POST(req: NextRequest) {
  try {
    const { code } = await req.json() as { code?: string };
    const valid = isValidInviteCode(code);
    return NextResponse.json({ valid });
  } catch {
    return NextResponse.json({ valid: false });
  }
}
