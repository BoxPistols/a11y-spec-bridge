import { describe, it, expect } from "vitest";
import { relativeLuminance, contrastRatio, wcagJudge } from "./a11yUtils";

describe("relativeLuminance", () => {
  it("白 #ffffff は 1.0", () => {
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1.0, 4);
  });

  it("黒 #000000 は 0", () => {
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 4);
  });

  it("3桁hex #fff も6桁と同じ結果", () => {
    expect(relativeLuminance("#fff")).toBeCloseTo(relativeLuminance("#ffffff"), 4);
  });

  it("# プレフィックスなしも受け付ける", () => {
    expect(relativeLuminance("ffffff")).toBeCloseTo(1.0, 4);
  });

  it("中間グレー #808080 は 0.21〜0.22 付近", () => {
    const l = relativeLuminance("#808080");
    expect(l).toBeGreaterThan(0.2);
    expect(l).toBeLessThan(0.23);
  });

  it("不正なhex (#zzz) は throw する（NaN伝播防止）", () => {
    expect(() => relativeLuminance("#zzz")).toThrow(/Invalid hex/);
  });

  it("空文字も throw する", () => {
    expect(() => relativeLuminance("")).toThrow(/Invalid hex/);
  });

  it("rgb()形式 など hex 以外も throw する", () => {
    expect(() => relativeLuminance("rgb(255,0,0)")).toThrow(/Invalid hex/);
  });
});

describe("contrastRatio", () => {
  it("白 vs 黒 は 21:1（最大値）", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 0);
  });

  it("同色は 1:1（最小値）", () => {
    expect(contrastRatio("#2563eb", "#2563eb")).toBeCloseTo(1, 4);
  });

  it("引数順を入れ替えても結果は同じ", () => {
    const a = contrastRatio("#2563eb", "#ffffff");
    const b = contrastRatio("#ffffff", "#2563eb");
    expect(a).toBeCloseTo(b, 4);
  });

  it("青 #2563eb on 白 は 5.17:1 付近（AA pass / AAA fail）", () => {
    const ratio = contrastRatio("#2563eb", "#ffffff");
    expect(ratio).toBeGreaterThan(5);
    expect(ratio).toBeLessThan(5.5);
  });
});

describe("wcagJudge", () => {
  it("白 vs 黒 は全レベル pass", () => {
    const r = wcagJudge("#ffffff", "#000000");
    expect(r.AA_normal).toBe(true);
    expect(r.AA_large).toBe(true);
    expect(r.AAA_normal).toBe(true);
    expect(r.AAA_large).toBe(true);
  });

  it("同色は全レベル fail", () => {
    const r = wcagJudge("#2563eb", "#2563eb");
    expect(r.AA_normal).toBe(false);
    expect(r.AA_large).toBe(false);
    expect(r.AAA_normal).toBe(false);
    expect(r.AAA_large).toBe(false);
  });

  it("ratio は小数1桁に丸められる", () => {
    const r = wcagJudge("#ffffff", "#000000");
    expect(r.ratio).toBe(21);
    const r2 = wcagJudge("#2563eb", "#ffffff");
    expect(r2.ratio * 10).toBe(Math.round(r2.ratio * 10));
  });

  it("AA normal 境界: 4.5:1 ちょうどは pass", () => {
    const r = wcagJudge("#767676", "#ffffff");
    expect(r.AA_normal).toBe(true);
    expect(r.AA_large).toBe(true);
  });

  it("AA normal 境界: 4.5:1 未満は fail", () => {
    const r = wcagJudge("#888888", "#ffffff");
    expect(r.AA_normal).toBe(false);
    expect(r.AA_large).toBe(true);
  });

  it("AAA normal: 7:1 未満は fail", () => {
    const r = wcagJudge("#666666", "#ffffff");
    expect(r.AA_normal).toBe(true);
    expect(r.AAA_normal).toBe(false);
  });
});
