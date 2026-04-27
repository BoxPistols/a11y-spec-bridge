import { describe, expect, it } from "vitest";
import { validateCssProps } from "./cssValidate";
import { isKnownCssProperty } from "./cssDictionary";

describe("validateCssProps", () => {
  it("inline style から既知プロパティを抽出", () => {
    const r = validateCssProps('<button style="color:#fff;background:#000;padding:8px">x</button>');
    expect(r.valid).toEqual(expect.arrayContaining(["color", "background", "padding"]));
    expect(r.unknown).toEqual([]);
  });

  it("捏造プロパティ（text-decoation typo）は unknown", () => {
    const r = validateCssProps('<a style="text-decoation:underline;color:blue">x</a>');
    expect(r.unknown).toContain("text-decoation");
    expect(r.valid).toContain("color");
  });

  it("シングルクォート style 属性も抽出", () => {
    const r = validateCssProps("<a style='color:red;display:block'>x</a>");
    expect(r.valid).toEqual(expect.arrayContaining(["color", "display"]));
  });

  it("<style> ブロックからも抽出", () => {
    const html = '<style>.x { color: red; padding: 4px; }</style>';
    const r = validateCssProps(html);
    expect(r.valid).toEqual(expect.arrayContaining(["color", "padding"]));
  });

  it("ベンダープレフィックスは valid 扱い", () => {
    const r = validateCssProps('<a style="-webkit-appearance:none;-moz-user-select:text">');
    expect(r.unknown).toEqual([]);
    expect(r.valid).toEqual(expect.arrayContaining(["-webkit-appearance", "-moz-user-select"]));
  });

  it("CSS Custom Properties は valid 扱い", () => {
    const r = validateCssProps('<a style="--my-color:red;color:var(--my-color)">');
    expect(r.unknown).toEqual([]);
    expect(r.valid).toContain("--my-color");
  });

  it("Bad セクション内の捏造は警告対象外", () => {
    const text = `
## ❌ Bad
\`\`\`html
<a style="text-decoation:underline">x</a>
\`\`\`
## ✅ Good
\`\`\`html
<a style="text-decoration:underline">x</a>
\`\`\`
`;
    const r = validateCssProps(text);
    expect(r.unknown).toEqual([]);
    expect(r.valid).toContain("text-decoration");
  });

  it("style 属性なしは total=0", () => {
    const r = validateCssProps("<button>plain</button>");
    expect(r.total).toBe(0);
  });

  it("Flex / Grid 系プロパティを認識", () => {
    const r = validateCssProps('<div style="display:flex;gap:8px;grid-template-columns:1fr 1fr">');
    expect(r.unknown).toEqual([]);
    expect(r.valid).toEqual(expect.arrayContaining(["display", "gap", "grid-template-columns"]));
  });

  it("a11y 関連プロパティを認識", () => {
    const r = validateCssProps('<a style="accent-color:blue;color-scheme:light dark;forced-color-adjust:none">');
    expect(r.unknown).toEqual([]);
    expect(r.valid).toEqual(expect.arrayContaining(["accent-color", "color-scheme", "forced-color-adjust"]));
  });

  it("重複プロパティは1件、total はカウント維持", () => {
    const r = validateCssProps('<a style="color:red;color:blue">');
    expect(r.valid.filter(v => v === "color")).toHaveLength(1);
    expect(r.total).toBe(2);
  });
});

describe("isKnownCssProperty", () => {
  it("既知プロパティは true", () => {
    expect(isKnownCssProperty("color")).toBe(true);
    expect(isKnownCssProperty("text-decoration")).toBe(true);
  });

  it("大文字でも吸収", () => {
    expect(isKnownCssProperty("COLOR")).toBe(true);
  });

  it("ベンダープレフィックスを剥がして照合", () => {
    expect(isKnownCssProperty("-webkit-transform")).toBe(true);
    expect(isKnownCssProperty("-moz-appearance")).toBe(true);
  });

  it("CSS Custom Properties は true", () => {
    expect(isKnownCssProperty("--my-var")).toBe(true);
  });

  it("捏造名は false", () => {
    expect(isKnownCssProperty("text-decoation")).toBe(false);
    expect(isKnownCssProperty("not-a-real-prop")).toBe(false);
  });
});
