import { describe, it, expect } from "vitest";
import { extractFindings, buildDesignDoc, buildSkillMd, buildAgentMd, buildClaudeMdSnippet } from "./aiExport";
import type { ChatSession } from "./types";

function makeSession(overrides: Partial<ChatSession> = {}): ChatSession {
  return {
    id: "s1",
    title: "モーダルのフォーカス管理",
    role: "engineer",
    createdAt: "2026-07-10T09:00:00.000Z",
    messages: [
      { id: "1", role: "user", content: "モーダルを開いたときフォーカスはどうすべき？" },
      {
        id: "2",
        role: "assistant",
        content: [
          "✅ モーダル内にフォーカスを移動し、`aria-modal=\"true\"` を付与します。",
          "根拠: WCAG 2.2 SC 2.4.3（フォーカス順序）と SC 2.1.2。",
          "```html",
          '<div role="dialog" aria-modal="true" aria-labelledby="t"><h2 id="t">確認</h2></div>',
          "```",
          "## ❌ Bad",
          "`aria-nonexistent` を使う。WCAG 9.9.9 も存在しません。",
          "```html",
          "<div onclick=\"open()\">開く</div>",
          "```",
        ].join("\n"),
        sources: [
          { id: "a", score: 0.9, source: "WCAG", title: "Focus Order", section: "2.4.3", url: "https://www.w3.org/WAI/WCAG22/Understanding/focus-order", snippet: "..." },
          { id: "b", score: 0.8, source: "WAI-ARIA", title: "Dialog (Modal)", section: "dialog", url: "https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/", snippet: "..." },
          // 重複 URL は 1 件に畳まれる
          { id: "c", score: 0.7, source: "WCAG", title: "Focus Order", section: "2.4.3", url: "https://www.w3.org/WAI/WCAG22/Understanding/focus-order", snippet: "..." },
        ],
      },
    ],
    ...overrides,
  };
}

describe("extractFindings", () => {
  it("辞書に実在する WCAG 番号だけを抽出する（Bad セクション内は除外）", () => {
    const f = extractFindings(makeSession());
    const ids = f.wcagCriteria.map(c => c.id);
    expect(ids).toContain("2.4.3");
    expect(ids).toContain("2.1.2");
    expect(ids).not.toContain("9.9.9");
  });

  it("実在する ARIA 属性のみを抽出する", () => {
    const f = extractFindings(makeSession());
    expect(f.ariaAttrs).toContain("aria-modal");
    expect(f.ariaAttrs).toContain("aria-labelledby");
    expect(f.ariaAttrs).not.toContain("aria-nonexistent");
  });

  it("Good の html サンプルだけを回収する", () => {
    const f = extractFindings(makeSession());
    expect(f.htmlSnippets).toHaveLength(1);
    expect(f.htmlSnippets[0]).toContain('aria-modal="true"');
  });

  it("参照仕様リンクを URL で重複排除する", () => {
    const f = extractFindings(makeSession());
    expect(f.specLinks).toHaveLength(2);
  });

  it("Q&A ペアを抽出する", () => {
    const f = extractFindings(makeSession());
    expect(f.qaPairs).toHaveLength(1);
    expect(f.qaPairs[0].question).toContain("モーダル");
  });
});

describe("エクスポート生成", () => {
  const session = makeSession();

  it("DESIGN.md にチェックリスト・判断ログ・根拠リンクが含まれる", () => {
    const doc = buildDesignDoc(session);
    expect(doc).toContain("# DESIGN.md — モーダルのフォーカス管理");
    expect(doc).toContain("SC 2.4.3");
    expect(doc).toContain("- [ ]");
    expect(doc).toContain("https://www.w3.org/WAI/WCAG22/Understanding/focus-order");
    expect(doc).toContain("2026-07-10");
  });

  it("SKILL.md が frontmatter 付きで生成される", () => {
    const doc = buildSkillMd(session);
    expect(doc.startsWith("---\nname: a11y-review\n")).toBe(true);
    expect(doc).toContain("aria-modal");
    expect(doc).toContain("SC 2.4.3");
  });

  it("サブエージェント定義が frontmatter 付きで生成される", () => {
    const doc = buildAgentMd(session);
    expect(doc.startsWith("---\nname: a11y-reviewer\n")).toBe(true);
    expect(doc).toContain("tools: Read, Grep, Glob");
    expect(doc).toContain("SC 2.4.3");
  });

  it("CLAUDE.md スニペットに正確性ルールが含まれる", () => {
    const doc = buildClaudeMdSnippet(session);
    expect(doc).toContain("## アクセシビリティ（SpecBridge 生成）");
    expect(doc).toContain("WCAG 達成基準番号は WCAG 2.0/2.1/2.2 に実在する番号のみ引用する");
  });

  it("空セッションでも壊れない", () => {
    const empty = makeSession({ messages: [] });
    expect(buildDesignDoc(empty)).toContain("特定の達成基準は引用されていません");
    expect(buildSkillMd(empty)).toContain("参照リンクなし");
  });
});
