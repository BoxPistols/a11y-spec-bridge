// 仮想スクリーンリーダー: DOM から「読み上げる項目」の並びと、各項目の読み上げ文を作る
// 暗転チャレンジ（/experience）で使う簡易版。実際のスクリーンリーダーの挙動を完全には再現しない。
// - 読み上げ順は DOM 順（スクリーンリーダーの「次の項目へ」に相当）
// - アクセシブルネームは aria-label → aria-labelledby → <label> → alt → 中身の文字の順で求める
// - div に onClick を付けただけの要素は「操作できる部品」として扱わない（支援技術に役割が伝わらないため）

export type ReaderRole =
  | "button"
  | "link"
  | "radio"
  | "checkbox"
  | "textbox"
  | "img"
  | "heading"
  | "status"
  | "text";

export type ReaderItem = {
  el: Element;
  role: ReaderRole;
  name: string;
};

const ROLE_LABEL: Record<ReaderRole, string> = {
  button: "ボタン",
  link: "リンク",
  radio: "ラジオボタン",
  checkbox: "チェックボックス",
  textbox: "編集テキスト",
  img: "画像",
  heading: "見出し",
  status: "",
  text: "",
};

export const INTERACTIVE_ROLES: ReadonlySet<ReaderRole> = new Set(["button", "link", "radio", "checkbox", "textbox"]);

const EXPLICIT_ROLES: Record<string, ReaderRole> = {
  button: "button",
  link: "link",
  radio: "radio",
  checkbox: "checkbox",
  textbox: "textbox",
  img: "img",
  heading: "heading",
  status: "status",
};

function isHidden(el: Element): boolean {
  if (el.closest("[aria-hidden='true']")) return true;
  if (el.closest("[hidden]")) return true;
  return false;
}

export function getRole(el: Element): ReaderRole | null {
  const explicit = el.getAttribute("role");
  if (explicit && Object.hasOwn(EXPLICIT_ROLES, explicit)) return EXPLICIT_ROLES[explicit];
  const tag = el.tagName.toLowerCase();
  if (tag === "button") return "button";
  if (tag === "a" && el.hasAttribute("href")) return "link";
  if (tag === "img") return "img";
  if (/^h[1-6]$/.test(tag)) return "heading";
  if (tag === "output") return "status";
  if (tag === "input") {
    const type = (el.getAttribute("type") ?? "text").toLowerCase();
    if (type === "radio") return "radio";
    if (type === "checkbox") return "checkbox";
    if (type === "button" || type === "submit") return "button";
    return "textbox";
  }
  if (tag === "textarea") return "textbox";
  return null;
}

function textOf(el: Element): string {
  return (el.textContent ?? "").replace(/\s+/g, " ").trim();
}

// 画像の alt が無いとき、スクリーンリーダーはファイル名を読むことが多い
function fileNameOf(src: string): string {
  const clean = src.split(/[?#]/)[0];
  return clean.slice(clean.lastIndexOf("/") + 1) || "名前のない画像";
}

export function getAccessibleName(el: Element): string {
  const label = el.getAttribute("aria-label")?.trim();
  if (label) return label;

  const labelledby = el.getAttribute("aria-labelledby");
  if (labelledby) {
    const doc = el.ownerDocument;
    const text = labelledby
      .split(/\s+/)
      .map(id => doc.getElementById(id))
      .filter((n): n is HTMLElement => n !== null)
      .map(textOf)
      .join(" ")
      .trim();
    if (text) return text;
  }

  const tag = el.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea") {
    const id = el.getAttribute("id");
    const doc = el.ownerDocument;
    const forLabel = id ? Array.from(doc.querySelectorAll("label")).find(l => l.getAttribute("for") === id) ?? null : null;
    const wrapLabel = el.closest("label");
    const lbl = forLabel ?? wrapLabel;
    if (lbl) return textOf(lbl);
    return "";
  }

  if (tag === "img") {
    const alt = el.getAttribute("alt");
    if (alt !== null) return alt.trim();
    return fileNameOf(el.getAttribute("src") ?? "");
  }

  // svg だけを含むボタンは中身の文字が無く、名前が空になる
  return textOf(el);
}

function stateOf(el: Element, role: ReaderRole): string {
  if (role === "radio" || role === "checkbox") {
    const checked = el instanceof HTMLInputElement ? el.checked : el.getAttribute("aria-checked") === "true";
    return checked ? "選択済み" : "未選択";
  }
  if (el.getAttribute("aria-disabled") === "true" || (el as HTMLButtonElement).disabled) return "使用不可";
  return "";
}

// 1 項目の読み上げ文（例: 「1枚増やす ボタン」「ボタン」「画像 pizza_0291.svg」）
export function describe(item: ReaderItem): string {
  const { el, role, name } = item;
  const roleLabel = ROLE_LABEL[role];
  const level = role === "heading" ? `レベル${el.tagName.slice(1)}` : "";
  const state = stateOf(el, role);
  return [name, roleLabel, level, state].filter(Boolean).join(" ").trim() || "空白";
}

// 読み上げ対象を DOM 順に集める。
// 役割のある要素はその要素ごと 1 項目にし、子孫は読まない。
// 役割の無い要素は、直下に文字を持つ場合だけ「テキスト」として 1 項目にする。
export function collectReadable(root: Element): ReaderItem[] {
  const items: ReaderItem[] = [];
  const walk = (el: Element) => {
    if (isHidden(el)) return;
    const role = getRole(el);
    if (role) {
      items.push({ el, role, name: getAccessibleName(el) });
      return;
    }
    // label の中は、操作部品だけを読む（文字は部品の名前として読まれるため二重に読まない）
    if (el.tagName.toLowerCase() === "label") {
      el.querySelectorAll("input, textarea, button").forEach(c => {
        const r = getRole(c);
        if (r && !isHidden(c)) items.push({ el: c, role: r, name: getAccessibleName(c) });
      });
      return;
    }
    const ownText = Array.from(el.childNodes)
      .filter(n => n.nodeType === 3)
      .map(n => n.textContent ?? "")
      .join("")
      .replace(/\s+/g, " ")
      .trim();
    if (ownText) {
      items.push({ el, role: "text", name: textOf(el) });
      return;
    }
    for (const child of Array.from(el.children)) walk(child);
  };
  for (const child of Array.from(root.children)) walk(child);
  return items;
}
