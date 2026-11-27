// 定期実行（Vercel Cron）からの呼び出しの確認
// 環境変数 CRON_SECRET を設定すると、Vercel は定期実行のリクエストに「Authorization: Bearer <CRON_SECRET>」を付ける。
// 設定されていれば一致を必須にし、未設定なら誰でも呼べる（処理は検索 1 件だけで、公開中の /api/spec-search より軽い）

import { safeEqual } from "./safeEqual";

export function isAuthorizedCron(authorization: string | null, secret: string | undefined): boolean {
  const expected = secret?.trim();
  if (!expected) return true;
  if (!authorization) return false;
  // 長さの違いで処理時間が変わらないよう、固定長に揃えて比べる
  return safeEqual(authorization, `Bearer ${expected}`);
}
