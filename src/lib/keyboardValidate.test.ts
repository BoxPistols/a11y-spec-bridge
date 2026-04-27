import { describe, expect, it } from "vitest";
import { validateKeyboardCompleteness } from "./keyboardValidate";

describe("validateKeyboardCompleteness", () => {
  it("Space 言及あり + Tab 言及なし → warn", () => {
    const r = validateKeyboardCompleteness("Space で選択/移動できます");
    expect(r.hasOperationKey).toBe(true);
    expect(r.hasTabRef).toBe(false);
    expect(r.warn).toBe(true);
  });

  it("Space + Tab 両方言及あり → 警告なし", () => {
    const r = validateKeyboardCompleteness("Tab でフォーカスし Space で選択");
    expect(r.hasTabRef).toBe(true);
    expect(r.warn).toBe(false);
  });

  it("矢印キー言及あり + Tab なし → warn", () => {
    const r = validateKeyboardCompleteness("↑↓矢印キーで位置調整");
    expect(r.warn).toBe(true);
  });

  it("Enter のみ言及 + Tab なし → warn", () => {
    const r = validateKeyboardCompleteness("Enter で確定");
    expect(r.warn).toBe(true);
  });

  it("操作キー言及なし → 警告なし", () => {
    const r = validateKeyboardCompleteness("ボタンの色を変える");
    expect(r.hasOperationKey).toBe(false);
    expect(r.warn).toBe(false);
  });

  it("「タブキー」表記も Tab として検出", () => {
    const r = validateKeyboardCompleteness("タブキーで移動し Space で選択");
    expect(r.hasTabRef).toBe(true);
    expect(r.warn).toBe(false);
  });

  it("「タブフォーカス」表記も Tab として検出", () => {
    const r = validateKeyboardCompleteness("タブフォーカスを当て Enter で活性化");
    expect(r.hasTabRef).toBe(true);
    expect(r.warn).toBe(false);
  });

  it("Esc のみで Tab なしも warn", () => {
    const r = validateKeyboardCompleteness("Esc でキャンセル");
    expect(r.warn).toBe(true);
  });

  it("Bad セクション内の不完全例は警告対象外", () => {
    const text = `
## ❌ Bad
Space で選択

## ✅ Good
Tab でフォーカスし Space で選択
`;
    const r = validateKeyboardCompleteness(text);
    expect(r.warn).toBe(false);
  });

  it("ArrowUp 英語表記も検出", () => {
    const r = validateKeyboardCompleteness("Press ArrowUp to move");
    expect(r.hasOperationKey).toBe(true);
    expect(r.warn).toBe(true);
  });
});
