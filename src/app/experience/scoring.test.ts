import { describe, it, expect } from "vitest";
import { heardRows, isUnclear, starsOf, HEARD_ROWS_MAX, type PlayResult } from "./scoring";
import type { PathPoint } from "./useReaderSession";

const pt = (label: string, seen: string, kind: PathPoint["kind"] = "control"): PathPoint => ({ x: 0, y: 0, kind, label, seen });
const result = (success: boolean, moves: number): PlayResult => ({ success, ms: 1000, moves, path: [] });

describe("starsOf", () => {
  it("注文できなければ 0", () => expect(starsOf(result(false, 5))).toBe(0));
  it("12 回以内は 3、20 回以内は 2、それより多いと 1", () => {
    expect(starsOf(result(true, 9))).toBe(3);
    expect(starsOf(result(true, 12))).toBe(3);
    expect(starsOf(result(true, 13))).toBe(2);
    expect(starsOf(result(true, 20))).toBe(2);
    expect(starsOf(result(true, 21))).toBe(1);
  });
});

describe("isUnclear", () => {
  it("名前の無いボタン・ファイル名だけの画像・1 文字・反応なしを「分からない」とする", () => {
    expect(isUnclear(pt("ボタン", "ー（へらす）ボタン"))).toBe(true);
    expect(isUnclear(pt("pizza_0291.svg 画像", "ピザの写真", "content"))).toBe(true);
    expect(isUnclear(pt("M", "Mサイズの ボタン", "content"))).toBe(true);
    expect(isUnclear(pt("Mサイズ ¥1,200 ラジオボタン 未選択", "Mサイズの ボタン", "miss"))).toBe(true);
  });
  it("役割と名前が伝わる読み上げは「分かる」とする", () => {
    expect(isUnclear(pt("1枚増やす ボタン", "＋（ふやす）ボタン"))).toBe(false);
    expect(isUnclear(pt("マルゲリータ 画像", "ピザの写真", "content"))).toBe(false);
  });
});

describe("heardRows", () => {
  it("同じ部品が続いたら 1 行にまとめる", () => {
    const rows = heardRows([pt("ボタン", "a"), pt("ボタン", "a"), pt("ボタン", "b")]);
    expect(rows.map(r => r.seen)).toEqual(["a", "b"]);
  });

  it("多いときは、分からない言葉と最後の 3 行を残す", () => {
    const path = Array.from({ length: 12 }, (_, i) => pt(`項目${i} ボタン`, `s${i}`));
    path[5] = pt("ボタン", "s5");
    const rows = heardRows(path);
    expect(rows.length).toBeLessThanOrEqual(HEARD_ROWS_MAX);
    const seen = rows.map(r => r.seen);
    expect(seen).toContain("s5");
    expect(seen.slice(-3)).toEqual(["s9", "s10", "s11"]);
  });
});
