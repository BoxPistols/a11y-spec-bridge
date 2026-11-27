import { describe, it, expect } from "vitest";
import { isSource, parseSourceParam, buildSourceFilter, SOURCES } from "./sources";

describe("isSource", () => {
  it("許可リストの値を受け付ける", () => {
    for (const s of SOURCES) expect(isSource(s)).toBe(true);
  });

  it("大文字小文字の違い・前後の空白・文字列以外を拒否する", () => {
    expect(isSource("wcag")).toBe(false);
    expect(isSource(" WCAG")).toBe(false);
    expect(isSource(1)).toBe(false);
    expect(isSource(null)).toBe(false);
  });
});

describe("parseSourceParam", () => {
  it("未指定は絞り込みなしとして通す", () => {
    expect(parseSourceParam(undefined)).toEqual({ ok: true, source: undefined });
    expect(parseSourceParam(null)).toEqual({ ok: true, source: undefined });
    expect(parseSourceParam("")).toEqual({ ok: true, source: undefined });
  });

  it("フィルタ式を壊す値を拒否する", () => {
    expect(parseSourceParam("WCAG' OR '1'='1").ok).toBe(false);
    expect(parseSourceParam("MDN' OR source != '").ok).toBe(false);
  });

  it("正しい値はそのまま返す", () => {
    expect(parseSourceParam("WAI-ARIA")).toEqual({ ok: true, source: "WAI-ARIA" });
  });
});

describe("buildSourceFilter", () => {
  it("許可リストの値だけをフィルタ式にする", () => {
    expect(buildSourceFilter("WCAG")).toBe("source = 'WCAG'");
    expect(buildSourceFilter(undefined)).toBeUndefined();
  });

  it("型を迂回して不正値が届いてもフィルタ式を作らない", () => {
    // 型チェックを経ない呼び出し（JS からの利用など）を想定
    const injected = "WCAG' OR '1'='1" as unknown as Parameters<typeof buildSourceFilter>[0];
    expect(buildSourceFilter(injected)).toBeUndefined();
  });
});
