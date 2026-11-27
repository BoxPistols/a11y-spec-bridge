// 暗転チャレンジの結果の判定（星の数・分からない言葉・結果画面に並べる行）。画面から切り離してテストする

import type { PathPoint } from "./useReaderSession";

export type PlayResult = {
  success: boolean;
  ms: number;
  moves: number;
  path: PathPoint[];
};

// 星の数の目安（操作の回数）。最短は 9 回前後
export const STAR_MOVES = { three: 12, two: 20 } as const;
// 「きこえたこと／ほんとうは」に並べる最大の行数
export const HEARD_ROWS_MAX = 8;

// 星の数（注文できたときだけ 1〜3）
export function starsOf(r: PlayResult): number {
  if (!r.success) return 0;
  if (r.moves <= STAR_MOVES.three) return 3;
  if (r.moves <= STAR_MOVES.two) return 2;
  return 1;
}

// 聞いても中身が分からない読み上げか（名前の無いボタン、ファイル名だけの画像、1 文字だけ、押しても何も起きない）
export function isUnclear(p: PathPoint): boolean {
  if (p.kind === "miss") return true;
  const t = p.label.trim();
  if (t === "ボタン" || t === "空白") return true;
  if (/\.(svg|png|jpe?g|gif|webp) 画像$/.test(t)) return true;
  if (t.length <= 1) return true;
  return false;
}

// 同じ部品が続いたら 1 行にまとめる。行が多いときは、最初の 2 行と最後の 3 行（数の変化や注文ボタンなど、
// 結果に効いた部分）を必ず残し、残りの枠に分からない言葉を入れる。順番は保つ
export function heardRows(path: PathPoint[]): PathPoint[] {
  const rows: PathPoint[] = [];
  for (const p of path) {
    const prev = rows[rows.length - 1];
    if (prev && prev.seen === p.seen && prev.label === p.label && prev.kind === p.kind) continue;
    rows.push(p);
  }
  if (rows.length <= HEARD_ROWS_MAX) return rows;
  // 最初の 2 行と最後の 3 行は必ず残し、残りの枠を分からない言葉で（前から順に）埋める
  const keep = new Set<number>([0, 1, rows.length - 3, rows.length - 2, rows.length - 1]);
  for (let i = 0; i < rows.length && keep.size < HEARD_ROWS_MAX; i++) {
    if (isUnclear(rows[i])) keep.add(i);
  }
  return rows.filter((_, i) => keep.has(i));
}

