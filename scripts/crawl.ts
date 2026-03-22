/**
 * scripts/crawl.ts
 * ─────────────────────────────────────────────────────
 * 公開仕様サイトをクロールして docs/*.jsonl に保存する
 *
 * 実行: npm run crawl
 * 出力: docs/mdn.jsonl, docs/wcag.jsonl, docs/aria.jsonl
 *
 * 各行は { id, url, title, section, text } の JSON
 */

import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import * as http from "http";

// ── 型定義 ────────────────────────────────────────────
type DocEntry = {
  id: string;
  url: string;
  title: string;
  section: string;
  source: "MDN" | "WCAG" | "WAI-ARIA";
  text: string;
};

// ── クロール対象 ──────────────────────────────────────
//
// MDN: HTML / ARIA / Accessibility の主要ページ
// WCAG: 達成基準ごとのページ
// WAI-ARIA: ロール・プロパティ定義
//
const TARGETS: { source: DocEntry["source"]; urls: string[] }[] = [
  {
    source: "MDN",
    urls: [
      // HTML フォーム要素
      "https://developer.mozilla.org/en-US/docs/Web/HTML/Element/button",
      "https://developer.mozilla.org/en-US/docs/Web/HTML/Element/input",
      "https://developer.mozilla.org/en-US/docs/Web/HTML/Element/select",
      "https://developer.mozilla.org/en-US/docs/Web/HTML/Element/textarea",
      "https://developer.mozilla.org/en-US/docs/Web/HTML/Element/form",
      "https://developer.mozilla.org/en-US/docs/Web/HTML/Element/label",
      "https://developer.mozilla.org/en-US/docs/Web/HTML/Element/fieldset",
      "https://developer.mozilla.org/en-US/docs/Web/HTML/Element/dialog",
      "https://developer.mozilla.org/en-US/docs/Web/HTML/Element/details",
      // ARIA
      "https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA",
      "https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Roles",
      "https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Roles/button_role",
      "https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Roles/dialog_role",
      "https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Roles/alertdialog_role",
      "https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Roles/combobox_role",
      "https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Roles/listbox_role",
      "https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Roles/menu_role",
      "https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Roles/menuitem_role",
      "https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Roles/tab_role",
      "https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Roles/tabpanel_role",
      "https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Roles/tooltip_role",
      "https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Roles/checkbox_role",
      "https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Roles/radio_role",
      "https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Roles/switch_role",
      "https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Attributes/aria-label",
      "https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Attributes/aria-labelledby",
      "https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Attributes/aria-describedby",
      "https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Attributes/aria-expanded",
      "https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Attributes/aria-hidden",
      "https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Attributes/aria-disabled",
      "https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Attributes/aria-live",
      "https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Attributes/aria-required",
      "https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Attributes/aria-invalid",
      // Keyboard / Focus
      "https://developer.mozilla.org/en-US/docs/Web/Accessibility/Understanding_WCAG/Keyboard",
      "https://developer.mozilla.org/en-US/docs/Web/HTML/Global_attributes/tabindex",
      "https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/focus",
      // CSS / Visual
      "https://developer.mozilla.org/en-US/docs/Web/CSS/:focus-visible",
      "https://developer.mozilla.org/en-US/docs/Web/CSS/:focus-within",
      "https://developer.mozilla.org/en-US/docs/Web/CSS/color-contrast",
      "https://developer.mozilla.org/en-US/docs/Web/CSS/color_value",
      // disabled / readonly
      "https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/disabled",
      "https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/readonly",
    ],
  },
  {
    source: "WCAG",
    urls: [
      // WCAG 2.2 達成基準（Understanding ドキュメント）
      "https://www.w3.org/WAI/WCAG22/Understanding/non-text-content.html",
      "https://www.w3.org/WAI/WCAG22/Understanding/captions-prerecorded.html",
      "https://www.w3.org/WAI/WCAG22/Understanding/info-and-relationships.html",
      "https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html",
      "https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html",
      "https://www.w3.org/WAI/WCAG22/Understanding/contrast-enhanced.html",
      "https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html",
      "https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html",
      "https://www.w3.org/WAI/WCAG22/Understanding/no-keyboard-trap.html",
      "https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html",
      "https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html",
      "https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html",
      "https://www.w3.org/WAI/WCAG22/Understanding/language-of-page.html",
      "https://www.w3.org/WAI/WCAG22/Understanding/on-focus.html",
      "https://www.w3.org/WAI/WCAG22/Understanding/on-input.html",
      "https://www.w3.org/WAI/WCAG22/Understanding/error-identification.html",
      "https://www.w3.org/WAI/WCAG22/Understanding/labels-or-instructions.html",
      "https://www.w3.org/WAI/WCAG22/Understanding/error-suggestion.html",
      "https://www.w3.org/WAI/WCAG22/Understanding/error-prevention-legal-financial-data.html",
      "https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html",
      "https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html",
      "https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html",
    ],
  },
  {
    source: "WAI-ARIA",
    urls: [
      "https://www.w3.org/TR/wai-aria-1.2/",
      "https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/",
      "https://www.w3.org/WAI/ARIA/apg/patterns/button/",
      "https://www.w3.org/WAI/ARIA/apg/patterns/combobox/",
      "https://www.w3.org/WAI/ARIA/apg/patterns/menu/",
      "https://www.w3.org/WAI/ARIA/apg/patterns/menubar/",
      "https://www.w3.org/WAI/ARIA/apg/patterns/tabs/",
      "https://www.w3.org/WAI/ARIA/apg/patterns/tooltip/",
      "https://www.w3.org/WAI/ARIA/apg/patterns/accordion/",
      "https://www.w3.org/WAI/ARIA/apg/patterns/checkbox/",
      "https://www.w3.org/WAI/ARIA/apg/patterns/radio/",
      "https://www.w3.org/WAI/ARIA/apg/patterns/switch/",
      "https://www.w3.org/WAI/ARIA/apg/patterns/breadcrumb/",
      "https://www.w3.org/WAI/ARIA/apg/patterns/landmarks/",
    ],
  },
];

// ── HTTP フェッチ ─────────────────────────────────────
function fetchHtml(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    const req = client.get(
      url,
      {
        headers: {
          "User-Agent": "SpecBridge-Crawler/1.0 (accessibility knowledge base)",
          "Accept": "text/html",
        },
      },
      (res) => {
        // リダイレクト追跡（1段階）
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fetchHtml(res.headers.location).then(resolve).catch(reject);
          return;
        }
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
        res.on("error", reject);
      }
    );
    req.on("error", reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error(`Timeout: ${url}`)); });
  });
}

// ── HTML → テキスト変換（cheerio不要の軽量版） ────────
function htmlToText(html: string): { title: string; text: string } {
  // タイトル抽出
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].replace(/\s*[-|].*$/, "").trim() : "Untitled";

  // main / article コンテンツのみ抽出
  let content = html;
  const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  if (mainMatch) content = mainMatch[1];
  else if (articleMatch) content = articleMatch[1];

  // nav / aside / header / footer / script / style を除去
  content = content
    .replace(/<(nav|aside|header|footer|script|style|figure|noscript)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (_, c) => `\`${c.replace(/<[^>]+>/g, "")}\``)
    .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, l, t) => `\n${"#".repeat(Number(l))} ${t.replace(/<[^>]+>/g, "").trim()}\n`)
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, t) => `\n- ${t.replace(/<[^>]+>/g, "").trim()}`)
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_, t) => `\n${t.replace(/<[^>]+>/g, "").trim()}\n`)
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s{3,}/g, "\n\n")
    .trim();

  return { title, text: content };
}

// ── セクション分割（見出し単位） ─────────────────────
function splitSections(text: string, title: string, url: string, source: DocEntry["source"]): DocEntry[] {
  const lines = text.split("\n");
  const entries: DocEntry[] = [];
  let currentSection = title;
  let buffer: string[] = [];
  let idx = 0;

  function flush() {
    const content = buffer.join("\n").trim();
    if (content.length > 80) {
      entries.push({
        id: `${source.toLowerCase()}-${idx++}-${Date.now()}`,
        url,
        title,
        section: currentSection,
        source,
        text: `[${source}] ${title} — ${currentSection}\n\n${content}`,
      });
    }
    buffer = [];
  }

  for (const line of lines) {
    if (/^#{1,3} /.test(line)) {
      flush();
      currentSection = line.replace(/^#+\s*/, "").trim();
    } else {
      buffer.push(line);
    }
  }
  flush();
  return entries;
}

// ── sleep ─────────────────────────────────────────────
function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ── メイン ────────────────────────────────────────────
async function main() {
  const docsDir = path.join(process.cwd(), "docs");
  if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });

  let totalEntries = 0;
  let totalErrors = 0;

  for (const target of TARGETS) {
    const outFile = path.join(docsDir, `${target.source.toLowerCase()}.jsonl`);
    const ws = fs.createWriteStream(outFile, { flags: "w" });
    let sourceEntries = 0;

    console.log(`\n📚 ${target.source} (${target.urls.length} pages)`);

    for (const url of target.urls) {
      try {
        process.stdout.write(`  fetching ${url.split("/").slice(-2).join("/")} ... `);
        const html = await fetchHtml(url);
        const { title, text } = htmlToText(html);
        const entries = splitSections(text, title, url, target.source);

        for (const entry of entries) {
          ws.write(JSON.stringify(entry) + "\n");
        }
        sourceEntries += entries.length;
        console.log(`✓ (${entries.length} sections)`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.log(`✗ ${msg}`);
        totalErrors++;
      }
      await sleep(300); // rate limit
    }

    ws.end();
    console.log(`  → ${outFile} (${sourceEntries} entries)`);
    totalEntries += sourceEntries;
  }

  console.log(`\n✅ Done: ${totalEntries} entries, ${totalErrors} errors`);
  console.log(`   次のステップ: npm run seed`);
}

main().catch(console.error);
