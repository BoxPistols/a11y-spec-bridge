// /api/ingest の書き込み許可
// 共有のベクトル DB に書き込み、Embedding の費用も発生するため、誰でも呼べる状態にしない。
// 許可するのは次のどちらかだけ:
//   1. x-ingest-token が環境変数 INGEST_TOKEN と一致（管理者・スクリプト用）
//   2. x-invite-code が有効な招待コード（画面からのアップロード用）
// どちらも無い場合は 403 を返す。INGEST_TOKEN も INVITE_CODES も未設定なら、書き込みは常に拒否される

import { safeEqual } from "./safeEqual";

export type IngestAuthInput = {
  ingestToken: string | null;
  inviteCode: string | null;
};

export type IngestAuthEnv = {
  INGEST_TOKEN?: string;
  INVITE_CODES?: string;
};

export type IngestAuthResult =
  | { allowed: true; by: "token" | "invite" }
  | { allowed: false };

export function authorizeIngest(input: IngestAuthInput, env: IngestAuthEnv): IngestAuthResult {
  const token = env.INGEST_TOKEN?.trim();
  if (token && input.ingestToken && safeEqual(input.ingestToken.trim(), token)) {
    return { allowed: true, by: "token" };
  }
  const codes = (env.INVITE_CODES ?? "").split(",").map(c => c.trim()).filter(Boolean);
  const code = input.inviteCode?.trim();
  if (code && codes.some(c => safeEqual(code, c))) {
    return { allowed: true, by: "invite" };
  }
  return { allowed: false };
}

// 取り込みサイズの上限（Embedding 費用と 30 秒の実行上限を超えないため）
export const MAX_INGEST_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_INGEST_TEXT_CHARS = 200_000;
