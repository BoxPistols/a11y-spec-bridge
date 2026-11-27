// 文字列の比較を、一致する位置や長さの違いで処理時間が変わらないように行う（トークン比較用）
// 長さが違っても固定長に揃えてから timingSafeEqual で比べ、長さの一致は最後に確認する

import { timingSafeEqual } from "crypto";

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  const len = Math.max(ab.length, bb.length, 1);
  const pa = Buffer.alloc(len);
  const pb = Buffer.alloc(len);
  ab.copy(pa);
  bb.copy(pb);
  const same = timingSafeEqual(pa, pb);
  return same && ab.length === bb.length;
}
