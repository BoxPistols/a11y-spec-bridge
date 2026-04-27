import { describe, expect, it } from "vitest";
import { validateWcagRefs } from "./wcagValidate";

describe("validateWcagRefs", () => {
  it("WCAG 2.1.1 はキーボード（valid）", () => {
    const r = validateWcagRefs("WCAG 2.1.1 を満たすこと");
    expect(r.valid).toContain("2.1.1");
    expect(r.unknown).toEqual([]);
  });

  it("達成基準 2.4.7 形式も拾う", () => {
    const r = validateWcagRefs("達成基準 2.4.7 でフォーカスの可視化を");
    expect(r.valid).toContain("2.4.7");
  });

  it("SC 1.4.3 形式も拾う（英語表記）", () => {
    const r = validateWcagRefs("SC 1.4.3 contrast minimum");
    expect(r.valid).toContain("1.4.3");
  });

  it("捏造番号 9.9.9 は unknown", () => {
    const r = validateWcagRefs("WCAG 9.9.9 を参照");
    expect(r.unknown).toEqual(["9.9.9"]);
  });

  it("WCAG 2.2 で追加された 2.5.8 も valid", () => {
    const r = validateWcagRefs("WCAG 2.5.8 ターゲットサイズ");
    expect(r.valid).toContain("2.5.8");
  });

  it("WCAG 2.2 で追加された 3.3.8 も valid", () => {
    const r = validateWcagRefs("WCAG 3.3.8 アクセシブルな認証");
    expect(r.valid).toContain("3.3.8");
  });

  it("WCAG プレフィックス含む数値表記のみ拾う（裸の X.X.X は誤検出回避）", () => {
    const r = validateWcagRefs("バージョン 1.2.3 は無関係です");
    expect(r.total).toBe(0);
  });

  it("Bad セクション内の捏造番号は除外", () => {
    const text = `
## ❌ Bad
WCAG 9.9.9 と書かれている誤りの例

## ✅ Good
WCAG 2.4.7 を引用
`;
    const r = validateWcagRefs(text);
    expect(r.unknown).toEqual([]);
    expect(r.valid).toContain("2.4.7");
  });

  it("重複は1件にまとめる、total はカウント維持", () => {
    const r = validateWcagRefs("WCAG 2.1.1 と 達成基準 2.1.1 を同時に");
    expect(r.valid.filter(v => v === "2.1.1")).toHaveLength(1);
    expect(r.total).toBe(2);
  });

  it("番号がない文字列は total=0", () => {
    const r = validateWcagRefs("普通の文章です");
    expect(r.total).toBe(0);
    expect(r.valid).toEqual([]);
    expect(r.unknown).toEqual([]);
  });

  it("WCAG 2.0 系（2.0.0 のような未存在）は unknown", () => {
    const r = validateWcagRefs("WCAG 2.0.0");
    expect(r.unknown).toEqual(["2.0.0"]);
  });
});
