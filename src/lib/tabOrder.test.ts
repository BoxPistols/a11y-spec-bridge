// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { extractTabOrder, formatTabOrder } from "./tabOrder";

describe("extractTabOrder", () => {
  it("button / a[href] / input が DOM 順で並ぶ", () => {
    const html = '<button>送信</button><a href="/x">ホーム</a><input type="text" aria-label="名前">';
    const items = extractTabOrder(html);
    expect(items.map(i => ({ index: i.index, role: i.role, name: i.name })))
      .toEqual([
        { index: 1, role: "button", name: "送信" },
        { index: 2, role: "link", name: "ホーム" },
        { index: 3, role: "textbox", name: "名前" },
      ]);
  });

  it("a (href なし) は除外", () => {
    const items = extractTabOrder('<a>テキスト</a><a href="/x">リンク</a>');
    expect(items).toHaveLength(1);
    expect(items[0].role).toBe("link");
    expect(items[0].name).toBe("リンク");
  });

  it("disabled は除外", () => {
    const items = extractTabOrder('<button disabled>NG</button><button>OK</button>');
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("OK");
  });

  it("tabindex=-1 は除外", () => {
    const items = extractTabOrder('<button tabindex="-1">A</button><button>B</button>');
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("B");
  });

  it("aria-hidden=true は除外", () => {
    const items = extractTabOrder('<button aria-hidden="true">隠</button><button>表示</button>');
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("表示");
  });

  it("input[type=hidden] は除外", () => {
    const items = extractTabOrder('<input type="hidden" value="x"><input type="text">');
    expect(items).toHaveLength(1);
    expect(items[0].role).toBe("textbox");
  });

  it("正の tabindex は昇順優先、それ以外は後続で DOM 順", () => {
    const html = '<button>A</button><button tabindex="2">B</button><button tabindex="1">C</button><button>D</button>';
    const items = extractTabOrder(html);
    expect(items.map(i => i.name)).toEqual(["C", "B", "A", "D"]);
    expect(items.map(i => i.tabindex)).toEqual([1, 2, undefined, undefined]);
  });

  it("input[type=submit] は button role", () => {
    const items = extractTabOrder('<input type="submit" value="送信">');
    expect(items[0].role).toBe("button");
    expect(items[0].name).toBe("送信");
  });

  it("空 HTML は空配列", () => {
    expect(extractTabOrder("")).toEqual([]);
  });
});

describe("formatTabOrder", () => {
  it("番号付きリストに整形", () => {
    const text = formatTabOrder([
      { index: 1, role: "button", name: "送信" },
      { index: 2, role: "link", name: "ホーム" },
    ]);
    expect(text).toBe('1. button "送信"\n2. link "ホーム"');
  });

  it("tabindex 正の値は併記", () => {
    const text = formatTabOrder([
      { index: 1, role: "button", name: "C", tabindex: 1 },
      { index: 2, role: "button", name: "B", tabindex: 2 },
    ]);
    expect(text).toContain("[tabindex=1]");
    expect(text).toContain("[tabindex=2]");
  });

  it("空配列は空文字", () => {
    expect(formatTabOrder([])).toBe("");
  });
});
