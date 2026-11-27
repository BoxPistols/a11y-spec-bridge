// @vitest-environment happy-dom
import { describe as d, it, expect, beforeEach } from "vitest";
import { collectReadable, describe, getAccessibleName, getRole } from "./virtualReader";

function mount(html: string): HTMLElement {
  document.body.innerHTML = `<div id="root">${html}</div>`;
  return document.getElementById("root")!;
}

d("getRole", () => {
  it("ネイティブ要素の暗黙ロールを返す", () => {
    const root = mount(`<button>a</button><a href="#">b</a><h2>c</h2><input type="radio"><img src="x.png">`);
    expect(Array.from(root.children).map(getRole)).toEqual(["button", "link", "heading", "radio", "img"]);
  });

  it("onClick を付けただけの div は役割を持たない", () => {
    const root = mount(`<div class="btn">注文する</div>`);
    expect(getRole(root.firstElementChild!)).toBeNull();
  });
});

d("getAccessibleName", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  it("aria-label を最優先する", () => {
    const root = mount(`<button aria-label="1枚増やす"><svg></svg></button>`);
    expect(getAccessibleName(root.firstElementChild!)).toBe("1枚増やす");
  });

  it("アイコンだけのボタンは名前が空になる", () => {
    const root = mount(`<button><svg><path d="M0 0"/></svg></button>`);
    expect(getAccessibleName(root.firstElementChild!)).toBe("");
  });

  it("alt の無い画像はファイル名になる", () => {
    const root = mount(`<img src="/experience/pizza_0291.svg">`);
    expect(getAccessibleName(root.firstElementChild!)).toBe("pizza_0291.svg");
  });

  it("label で囲まれた入力欄はラベルの文字が名前になる", () => {
    const root = mount(`<label><input type="radio" name="s"> Mサイズ</label>`);
    expect(getAccessibleName(root.querySelector("input")!)).toBe("Mサイズ");
  });

  it("aria-labelledby の参照先の文字を使う", () => {
    const root = mount(`<span id="t">合計</span><output aria-labelledby="t">2枚</output>`);
    expect(getAccessibleName(root.querySelector("output")!)).toBe("合計");
  });
});

d("collectReadable と describe", () => {
  it("対応前の画面: 役割も名前も伝わらない", () => {
    const root = mount(`
      <div class="title">ピザを注文</div>
      <img src="/experience/pizza_0291.svg">
      <div class="chip">M</div>
      <button><svg></svg></button>
    `);
    const lines = collectReadable(root).map(describe);
    expect(lines).toEqual(["ピザを注文", "pizza_0291.svg 画像", "M", "ボタン"]);
  });

  it("対応後の画面: 役割・名前・状態が伝わる", () => {
    const root = mount(`
      <h1>ピザを注文</h1>
      <img src="/x.svg" alt="マルゲリータ">
      <label><input type="radio" name="s" checked> Mサイズ</label>
      <button aria-label="1枚増やす"><svg></svg></button>
    `);
    const lines = collectReadable(root).map(describe);
    expect(lines).toEqual(["ピザを注文 見出し レベル1", "マルゲリータ 画像", "Mサイズ ラジオボタン 選択済み", "1枚増やす ボタン"]);
  });

  it("aria-hidden の要素は読まない", () => {
    const root = mount(`<span aria-hidden="true">飾り</span><p>本文</p>`);
    expect(collectReadable(root).map(i => i.name)).toEqual(["本文"]);
  });
});
