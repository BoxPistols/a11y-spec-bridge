import { describe, expect, it } from "vitest";
import { stripBadSections, validateAriaAttrs } from "./ariaValidate";

describe("validateAriaAttrs", () => {
  it("既知の属性のみは unknown が空", () => {
    const r = validateAriaAttrs('<div aria-label="x" aria-hidden="true">');
    expect(r.unknown).toEqual([]);
    expect(r.valid).toContain("aria-label");
    expect(r.valid).toContain("aria-hidden");
    expect(r.total).toBe(2);
  });

  it("捏造属性は unknown に入る", () => {
    const r = validateAriaAttrs('<div aria-foo="x" aria-bar="y">');
    expect(r.unknown).toEqual(["aria-foo", "aria-bar"]);
    expect(r.valid).toEqual([]);
  });

  it("ARIA 1.3 追加の aria-description は valid", () => {
    const r = validateAriaAttrs('<button aria-description="補足">');
    expect(r.valid).toContain("aria-description");
    expect(r.unknown).toEqual([]);
  });

  it("deprecated aria-grabbed / aria-dropeffect は実在するため valid 扱い", () => {
    const r = validateAriaAttrs('<div aria-grabbed="true" aria-dropeffect="move">');
    expect(r.unknown).toEqual([]);
  });

  it("大文字小文字を吸収する（ARIA-LABEL → aria-label）", () => {
    const r = validateAriaAttrs('<div ARIA-LABEL="x">');
    expect(r.valid).toContain("aria-label");
  });

  it("インラインコード ` で囲まれた属性も検出", () => {
    const r = validateAriaAttrs("使う属性: `aria-label` と `aria-fakey`");
    expect(r.valid).toContain("aria-label");
    expect(r.unknown).toContain("aria-fakey");
  });

  it("Bad セクション内の捏造属性は警告対象外", () => {
    const text = `
## ❌ Bad
\`\`\`html
<div aria-fakey="x">
\`\`\`
## ✅ Good
\`\`\`html
<div aria-label="x">
\`\`\`
`;
    const r = validateAriaAttrs(text);
    expect(r.unknown).toEqual([]); // Bad の aria-fakey は除外
    expect(r.valid).toContain("aria-label");
  });

  it("属性名の重複は valid/unknown 共に 1 件にまとめる（total はカウント維持）", () => {
    const r = validateAriaAttrs('<a aria-label="x"><b aria-label="y">');
    expect(r.valid.filter(v => v === "aria-label")).toHaveLength(1);
    expect(r.total).toBe(2);
  });

  it("aria-* がない文字列は total=0", () => {
    const r = validateAriaAttrs("普通の HTML です <button>送信</button>");
    expect(r.total).toBe(0);
    expect(r.valid).toEqual([]);
    expect(r.unknown).toEqual([]);
  });
});

describe("stripBadSections", () => {
  it("## ❌ Bad ブロックを次の ## まで除去", () => {
    const text = "前\n## ❌ Bad\nA\n## ✅ Good\nB";
    expect(stripBadSections(text)).toBe("前\n## ✅ Good\nB");
  });

  it("Bad ブロックが文末まで続く場合も除去", () => {
    const text = "前\n## ❌ Bad\nA\nB\n";
    expect(stripBadSections(text)).toBe("前\n");
  });

  it("Bad ブロックがなければそのまま", () => {
    const text = "## ✅ Good\nA";
    expect(stripBadSections(text)).toBe(text);
  });
});
