// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { buildAriaSnapshot, formatAriaSnapshot } from "./ariaSnapshot";

describe("buildAriaSnapshot", () => {
  it("button に内部テキストの accessible name を割り当てる", () => {
    const nodes = buildAriaSnapshot('<button>送信</button>');
    expect(nodes).toEqual([
      { role: "button", name: "送信", level: undefined, children: [] },
    ]);
  });

  it("aria-label が内部テキストより優先される", () => {
    const nodes = buildAriaSnapshot('<button aria-label="閉じる">×</button>');
    expect(nodes[0].name).toBe("閉じる");
  });

  it("a[href] は link、href なしは generic 扱い（スキップされる）", () => {
    const linked = buildAriaSnapshot('<a href="/x">ホーム</a>');
    expect(linked).toEqual([
      { role: "link", name: "ホーム", level: undefined, children: [] },
    ]);
    const noHref = buildAriaSnapshot('<a>テキスト</a>');
    expect(noHref).toEqual([]);
  });

  it("h1〜h3 は heading + level", () => {
    const nodes = buildAriaSnapshot('<h1>章</h1><h3>節</h3>');
    expect(nodes.map(n => ({ role: n.role, level: n.level, name: n.name })))
      .toEqual([
        { role: "heading", level: 1, name: "章" },
        { role: "heading", level: 3, name: "節" },
      ]);
  });

  it("input[type=checkbox] は checkbox role", () => {
    const nodes = buildAriaSnapshot('<input type="checkbox" aria-label="同意">');
    expect(nodes[0].role).toBe("checkbox");
    expect(nodes[0].name).toBe("同意");
  });

  it("img は alt を accessible name に使う", () => {
    const nodes = buildAriaSnapshot('<img src="/x.png" alt="アバター">');
    expect(nodes[0]).toEqual({ role: "img", name: "アバター", level: undefined, children: [] });
  });

  it("ul > li は list / listitem の階層を保つ", () => {
    const nodes = buildAriaSnapshot('<ul><li>A</li><li>B</li></ul>');
    expect(nodes).toHaveLength(1);
    expect(nodes[0].role).toBe("list");
    expect(nodes[0].children.map(c => ({ role: c.role, name: c.name })))
      .toEqual([
        { role: "listitem", name: "A" },
        { role: "listitem", name: "B" },
      ]);
  });

  it("role 属性は暗黙 role より優先される", () => {
    const nodes = buildAriaSnapshot('<div role="button" aria-label="メニュー">≡</div>');
    expect(nodes[0].role).toBe("button");
    expect(nodes[0].name).toBe("メニュー");
  });

  it("aria-labelledby の参照解決（同 fragment 内）", () => {
    const html = '<div><label id="l1">名前</label><input aria-labelledby="l1"></div>';
    const nodes = buildAriaSnapshot(html);
    const input = nodes.flatMap(n => n.children.length ? n.children : [n]).find(n => n.role === "textbox");
    expect(input?.name).toBe("名前");
  });

  it("空 HTML は空配列", () => {
    expect(buildAriaSnapshot("")).toEqual([]);
  });
});

describe("formatAriaSnapshot", () => {
  it("単純な平坦リストを整形", () => {
    const text = formatAriaSnapshot([
      { role: "button", name: "送信", children: [] },
      { role: "link", name: "ホーム", children: [] },
    ]);
    expect(text).toBe('button "送信"\nlink "ホーム"');
  });

  it("heading に level を含める", () => {
    const text = formatAriaSnapshot([
      { role: "heading", name: "章", level: 1, children: [] },
    ]);
    expect(text).toBe('heading level=1 "章"');
  });

  it("ネストはインデント 2 スペース", () => {
    const text = formatAriaSnapshot([
      {
        role: "list",
        children: [
          { role: "listitem", name: "A", children: [] },
          { role: "listitem", name: "B", children: [] },
        ],
      },
    ]);
    expect(text).toBe('list\n  listitem "A"\n  listitem "B"');
  });

  it("name なしは role のみ表示", () => {
    const text = formatAriaSnapshot([
      { role: "navigation", children: [] },
    ]);
    expect(text).toBe("navigation");
  });
});
