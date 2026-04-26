// ARIA snapshot: HTML サンプルがスクリーンリーダーでどう読み上げられるかをテキスト整形
// 簡易実装: 主要要素の暗黙 role + accessible name のみ対応（完全な ARIA accname 算出は WAI-ARIA 仕様参照）
// 入力 HTML は信頼境界外。innerHTML 等の DOM 注入は行わず textContent のみ参照する

export type AriaNode = {
  role: string;
  name?: string;
  level?: number;
  children: AriaNode[];
};

// タグ → 暗黙 role の最小マッピング（role 属性が指定されていればそちらが優先）
const IMPLICIT_ROLES: Record<string, string> = {
  button: "button",
  a: "link",
  nav: "navigation",
  main: "main",
  header: "banner",
  footer: "contentinfo",
  aside: "complementary",
  article: "article",
  section: "region",
  ul: "list",
  ol: "list",
  li: "listitem",
  table: "table",
  tr: "row",
  td: "cell",
  th: "columnheader",
  form: "form",
  img: "img",
  p: "paragraph",
};

const HEADING_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);

function getRole(el: Element): string {
  const explicit = el.getAttribute("role");
  if (explicit) return explicit;
  const tag = el.tagName.toLowerCase();
  if (HEADING_TAGS.has(tag)) return "heading";
  if (tag === "a") return el.hasAttribute("href") ? "link" : "generic";
  if (tag === "input") {
    const type = (el.getAttribute("type") ?? "text").toLowerCase();
    if (type === "checkbox") return "checkbox";
    if (type === "radio") return "radio";
    if (type === "submit" || type === "button" || type === "reset") return "button";
    if (type === "range") return "slider";
    return "textbox";
  }
  if (tag === "select") return "combobox";
  if (tag === "textarea") return "textbox";
  return IMPLICIT_ROLES[tag] ?? "generic";
}

function getAccessibleName(el: Element): string | undefined {
  // 簡易優先順: aria-labelledby → aria-label → alt → title → 内部テキスト
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
  const title = el.getAttribute("title");
  if (title) return title.trim();
  const text = el.textContent?.replace(/\s+/g, " ").trim();
  return text || undefined;
}

// heading の level（h1〜h6 / role=heading aria-level）
function getHeadingLevel(el: Element): number | undefined {
  const tag = el.tagName.toLowerCase();
  if (HEADING_TAGS.has(tag)) return Number(tag.slice(1));
  if (el.getAttribute("role") === "heading") {
    const lv = el.getAttribute("aria-level");
    if (lv) return Number(lv);
  }
  return undefined;
}

// 子要素のうち role を持つもの（generic は構造保持のためスキップ）を再帰的に集める
function walk(el: Element): AriaNode[] {
  const out: AriaNode[] = [];
  for (const child of Array.from(el.children)) {
    const role = getRole(child);
    const subtree = walk(child);
    if (role === "generic") {
      out.push(...subtree);
      continue;
    }
    out.push({
      role,
      name: getAccessibleName(child),
      level: getHeadingLevel(child),
      children: subtree,
    });
  }
  return out;
}

export function buildAriaSnapshot(html: string): AriaNode[] {
  // ブラウザ環境前提（DOMParser 使用）
  if (typeof DOMParser === "undefined") return [];
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  if (!root) return [];
  return walk(root);
}

export function formatAriaSnapshot(nodes: AriaNode[], depth = 0): string {
  const lines: string[] = [];
  const indent = "  ".repeat(depth);
  for (const node of nodes) {
    const levelStr = node.level !== undefined ? ` level=${node.level}` : "";
    const nameStr = node.name ? ` "${node.name}"` : "";
    lines.push(`${indent}${node.role}${levelStr}${nameStr}`);
    if (node.children.length) {
      lines.push(formatAriaSnapshot(node.children, depth + 1));
    }
  }
  return lines.join("\n");
}
