/**
 * src/lib/ratelimit.ts
 * レート制限 + 招待コード検証
 *
 * ユーザー分類:
 *   自分のAPIキー → 無制限
 *   招待コードあり → RATE_LIMIT_INVITED/日（デフォルト30）
 *   招待コードなし → RATE_LIMIT_PUBLIC/日（デフォルト30）
 */

import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import { NextRequest } from "next/server";

// ── 定数 ─────────────────────────────────────────────
const LIMIT_PUBLIC  = parseInt(process.env.RATE_LIMIT_PUBLIC  ?? "30", 10);
const LIMIT_INVITED = parseInt(process.env.RATE_LIMIT_INVITED ?? "30", 10);

// ── シングルトン ─────────────────────────────────────
let _redis: Redis | null = null;

function getRedis(): Redis | null {
  if (_redis) return _redis;
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  _redis = new Redis({ url, token });
  return _redis;
}

function createRatelimit(limit: number) {
  const redis = getRedis();
  if (!redis) return null;
  return new Ratelimit({
    redis,
    limiter: Ratelimit.fixedWindow(limit, "1 d"),
    prefix: "specbridge:rl",
  });
}

// ── 招待コード検証 ───────────────────────────────────
export function isValidInviteCode(code: string | null | undefined): boolean {
  if (!code) return false;
  const codes = (process.env.INVITE_CODES ?? "").split(",").map(c => c.trim()).filter(Boolean);
  return codes.includes(code);
}

// ── クライアント識別子 ───────────────────────────────
export function getClientId(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "unknown";
  return ip;
}

// ── レート制限チェック ───────────────────────────────
export type RateLimitResult =
  | { allowed: true;  remaining: number; limit: number }
  | { allowed: false; remaining: 0;      limit: number };

export async function checkRateLimit(
  req: NextRequest,
  inviteCode: string | null | undefined,
): Promise<RateLimitResult> {
  const invited = isValidInviteCode(inviteCode);
  const limit   = invited ? LIMIT_INVITED : LIMIT_PUBLIC;
  const rl      = createRatelimit(limit);

  // Redis 未設定の場合は制限なし（ローカル開発用）
  if (!rl) return { allowed: true, remaining: limit, limit };

  const id = `${getClientId(req)}:${invited ? "inv" : "pub"}`;
  const { success, remaining } = await rl.limit(id);

  return success
    ? { allowed: true,  remaining, limit }
    : { allowed: false, remaining: 0, limit };
}

// ── 残り回数の取得（UIに返す用） ─────────────────────
export async function getRemainingQuota(
  req: NextRequest,
  inviteCode: string | null | undefined,
): Promise<{ remaining: number; limit: number }> {
  const invited = isValidInviteCode(inviteCode);
  const limit   = invited ? LIMIT_INVITED : LIMIT_PUBLIC;
  const rl      = createRatelimit(limit);

  if (!rl) return { remaining: limit, limit };

  const id = `${getClientId(req)}:${invited ? "inv" : "pub"}`;
  const { remaining } = await rl.getRemaining(id);

  return { remaining, limit };
}
