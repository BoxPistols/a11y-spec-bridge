// Tab フォーカス順を抽出してテキスト整形
// 簡易実装: 正の tabindex は昇順優先、それ以外は DOM 順。disabled / tabindex=-1 / hidden は除外
// 入力 HTML は信頼境界外。innerHTML 等の DOM 注入は行わず属性 / textContent のみ参照する

export type TabOrderItem = {
  index: number;
  role: string;
  name?: string;
  tabindex?: number;
};

const TABBABLE_SELECTOR = [
  "a[href]",
  "button",
  "input",
  "select",
  "textarea",
  "[tabindex]",
].join(",");

function getRoleSimple(el: Element): string {
  const explicit = el.getAttribute("role");
  if (explicit) return explicit;
  const tag = el.tagName.toLowerCase();
  if (tag === "a") return "link";
  if (tag === "button") return "button";
  if (tag === "select") return "combobox";
  if (tag === "textarea") return "textbox";
  if (tag === "input") {
    const type = (el.getAttribute("type") ?? "text").toLowerCase();
    if (type === "checkbox") return "checkbox";
    if (type === "radio") return "radio";
    if (type === "submit" || type === "button" || type === "reset") return "button";
    if (type === "range") return "slider";
    return "textbox";
  }
  return "generic";
}

function getName(el: Element): string | undefined {
  const labelledby = el.getAttribute("aria-labelledby");
  if (labelledby) {
    const doc = el.ownerDocument;
    const names = labelledby
      .split(/\s+/)
      .map(id => doc.getElementById(id)?.textContent?.trim())
      .filter((s): s is string => Boolean(s));
    if (names.length) return names.join(" ");
  }
  const ariaLabel = el.getAttribute("aria-label");
  if (ariaLabel) return ariaLabel.trim();
  if (el.tagName.toLowerCase() === "img") {
    const alt = el.getAttribute("alt");
    if (alt !== null) return alt.trim();
  }
  const value = el.getAttribute("value");
  if (value && el.tagName.toLowerCase() === "input") return value.trim();
  const text = el.textContent?.replace(/\s+/g, " ").trim();
  return text || undefined;
}

function isFocusable(el: Element): boolean {
  if (el.hasAttribute("disabled")) return false;
  if (el.getAttribute("aria-hidden") === "true") return false;
  const tag = el.tagName.toLowerCase();
  if (tag === "input" && el.getAttribute("type") === "hidden") return false;
  const tabindex = el.getAttribute("tabindex");
  if (tabindex !== null && Number(tabindex) < 0) return false;
  // a[href] は href 必須
  if (tag === "a" && !el.hasAttribute("href")) return false;
  // [tabindex] のみで来た要素のうち上記以外は要素がフォーカス可能でないと意味がないが
  // 教育目的の表示なので tabindex 指定があれば候補に含める
  return true;
}

export function extractTabOrder(html: string): TabOrderItem[] {
  if (typeof DOMParser === "undefined") return [];
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  if (!root) return [];
  const candidates = Array.from(root.querySelectorAll(TABBABLE_SELECTOR))
    .filter(isFocusable);
  // tabindex 正の値は昇順優先、それ以外（未指定 / 0）は元の DOM 順
  const positive: { el: Element; ti: number; pos: number }[] = [];
  const natural: { el: Element; pos: number }[] = [];
  candidates.forEach((el, pos) => {
    const ti = el.getAttribute("tabindex");
    const num = ti !== null ? Number(ti) : NaN;
    if (Number.isFinite(num) && num > 0) {
      positive.push({ el, ti: num, pos });
    } else {
      natural.push({ el, pos });
    }
  });
  positive.sort((a, b) => a.ti - b.ti || a.pos - b.pos);
  natural.sort((a, b) => a.pos - b.pos);
  const ordered = [...positive.map(p => p.el), ...natural.map(n => n.el)];
  return ordered.map((el, i) => {
    const ti = el.getAttribute("tabindex");
    return {
      index: i + 1,
      role: getRoleSimple(el),
      name: getName(el),
      tabindex: ti !== null ? Number(ti) : undefined,
    };
  });
}

export function formatTabOrder(items: TabOrderItem[]): string {
  if (!items.length) return "";
  return items.map(item => {
    const name = item.name ? ` "${item.name}"` : "";
    const ti = item.tabindex !== undefined ? ` [tabindex=${item.tabindex}]` : "";
    return `${item.index}. ${item.role}${name}${ti}`;
  }).join("\n");
}
