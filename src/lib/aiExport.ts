// AI 連携エクスポート: チャットセッションから開発組織の AI ワークフローに
// そのまま組み込めるファイル（DESIGN.md / Claude Code Skill / サブエージェント定義 /
// CLAUDE.md 追記）を生成する。
//
// 設計方針:
// - LLM を呼ばない決定論的生成（無料・即時・オフライン動作・テスト可能）
// - 会話に登場した WCAG 達成基準 / ARIA 属性を L3 検証辞書で照合済みのものだけ採用
//   （捏造番号がチームのルールファイルに混入するのを防ぐ）
// - 生成物は「アクセシビリティに興味がない人」の手元の AI エージェントが読む前提。
//   人が読む説明より、エージェントが従える具体的ルールを優先する

import { WCAG_SC, type WcagSC } from "./wcagDictionary";
import { validateWcagRefs } from "./wcagValidate";
import { validateAriaAttrs, stripBadSections } from "./ariaValidate";
import type { ChatSession } from "./types";

export type SessionFindings = {
  wcagCriteria: WcagSC[];              // 会話で引用された実在の達成基準（辞書照合済み）
  ariaAttrs: string[];                 // 会話で使われた実在の ARIA 属性
  htmlSnippets: string[];              // Good 例の html コードブロック（Bad セクション除外）
  specLinks: { source: string; title: string; url: string }[];
  qaPairs: { question: string; answer: string }[];
};

const HTML_BLOCK_RE = /```html\n([\s\S]*?)```/g;

// ── 会話からの知見抽出 ────────────────────────────────
export function extractFindings(session: ChatSession): SessionFindings {
  const assistantMsgs = session.messages.filter(m => m.role === "assistant" && !m.error);
  const allText = assistantMsgs.map(m => m.content).join("\n\n");

  const wcagIds = validateWcagRefs(allText).valid;
  const wcagCriteria = WCAG_SC.filter(sc => wcagIds.includes(sc.id));
  const ariaAttrs = validateAriaAttrs(allText).valid;

  // Bad 見出し配下を除いた本文から Good サンプルのみ回収
  const htmlSnippets: string[] = [];
  for (const m of assistantMsgs) {
    const goodOnly = stripBadSections(m.content);
    let match;
    HTML_BLOCK_RE.lastIndex = 0;
    while ((match = HTML_BLOCK_RE.exec(goodOnly)) !== null) {
      const code = match[1].trim();
      if (code) htmlSnippets.push(code);
    }
  }

  // 参照仕様リンク（URL で重複排除）
  const seen = new Set<string>();
  const specLinks: SessionFindings["specLinks"] = [];
  for (const m of assistantMsgs) {
    for (const s of m.sources ?? []) {
      if (!s.url || seen.has(s.url)) continue;
      seen.add(s.url);
      specLinks.push({ source: s.source, title: s.title, url: s.url });
    }
  }

  // Q&A ペア（user 発話と直後の assistant 回答）
  const qaPairs: SessionFindings["qaPairs"] = [];
  const msgs = session.messages;
  for (let i = 0; i < msgs.length - 1; i++) {
    if (msgs[i].role === "user" && msgs[i + 1].role === "assistant" && !msgs[i + 1].error) {
      qaPairs.push({ question: msgs[i].content, answer: msgs[i + 1].content });
    }
  }

  return { wcagCriteria, ariaAttrs, htmlSnippets, specLinks, qaPairs };
}

// ── 共通パーツ ────────────────────────────────────────
function wcagChecklist(criteria: WcagSC[]): string {
  if (criteria.length === 0) return "（この会話では特定の達成基準は引用されていません）";
  return criteria
    .map(sc => `- [ ] WCAG 2.2 SC ${sc.id}（${sc.title} / Level ${sc.level}）を満たしている`)
    .join("\n");
}

function specLinkList(links: SessionFindings["specLinks"]): string {
  if (links.length === 0) return "（参照リンクなし）";
  return links.map(l => `- [${l.source}] ${l.title}: ${l.url}`).join("\n");
}

// エージェント向けの普遍ルール。SpecBridge 本体のハレーション防止規則と揃える
const ACCURACY_RULES = `- WCAG 達成基準番号は WCAG 2.0/2.1/2.2 に実在する番号のみ引用する。記憶や類推で番号を作らない
- ARIA 属性・ロールは WAI-ARIA 1.2 以降に実在するもののみ使う
- ネイティブ HTML 要素（button, a, select, dialog 等）で足りる場面で ARIA を後付けしない
- キーボード操作は Tab でのフォーカス到達手順から省略せずに記述する
- コントラスト比を暗算しない。色は #hex で指定し、ツールで実測する
- インタラクティブ要素の最小ターゲットは 24x24 CSS px（WCAG 2.2 SC 2.5.8）、モバイルは 44pt (iOS) / 48dp (Android) を推奨`;

// ── DESIGN.md ─────────────────────────────────────────
// デザイン判断の記録。仕様根拠つきでチームにそのまま共有できる
export function buildDesignDoc(session: ChatSession): string {
  const f = extractFindings(session);
  const date = session.createdAt.slice(0, 10);

  const decisions = f.qaPairs
    .map((qa, i) => `### ${i + 1}. ${qa.question.trim()}\n\n${qa.answer.trim()}`)
    .join("\n\n---\n\n");

  const samples = f.htmlSnippets.length > 0
    ? f.htmlSnippets.map(s => "```html\n" + s + "\n```").join("\n\n")
    : "（この会話にコードサンプルはありません）";

  return `# DESIGN.md — ${session.title}

> SpecBridge の会話から自動生成（${date} / ロール: ${session.role}）
> 各判断は WCAG 2.2 / WAI-ARIA / MDN の仕様検索結果を根拠としています。

## アクセシビリティ要件チェックリスト

${wcagChecklist(f.wcagCriteria)}

## 設計判断ログ

${decisions || "（判断ログなし）"}

## 実装リファレンス（Good 例）

${samples}

## 根拠仕様

${specLinkList(f.specLinks)}
`;
}

// ── Claude Code Skill（.claude/skills/a11y-review/SKILL.md） ──
// チームのリポジトリに置くと、AI コーディング時に a11y レビューが自動で効く
export function buildSkillMd(session: ChatSession): string {
  const f = extractFindings(session);
  const ariaLine = f.ariaAttrs.length > 0
    ? `このプロジェクトで登場実績のある ARIA 属性: ${f.ariaAttrs.join(", ")}`
    : "";

  return `---
name: a11y-review
description: UI コンポーネントの実装・変更時にアクセシビリティを自動レビューする。button/link/form/dialog/画像/色/フォーカスに触れる diff で必ず使用。
---

# アクセシビリティレビュー Skill

UI に触れるコード変更をレビューし、修正案を diff で提示する。
アクセシビリティの知識を開発者に要求しない。指摘は「何を・どう直すか」のコード付きで示す。

## 正確性ルール（違反したら指摘しない側に倒す）

${ACCURACY_RULES}

## このプロジェクトの必須チェック

${wcagChecklist(f.wcagCriteria)}

${ariaLine}

## レビュー手順

1. diff 中のインタラクティブ要素（クリック/入力/フォーカス対象）を列挙する
2. 各要素について: ネイティブ要素か → アクセシブルネームがあるか → キーボードで到達・操作できるか → フォーカスが視認できるか の順に確認
3. 色に関する変更は前景/背景の #hex を抽出し、コントラスト比 4.5:1（通常テキスト）/ 3:1（大きなテキスト・UI 部品）を確認
4. 問題は「修正版コード + 根拠となる WCAG SC 番号1行」の形式で報告する。長い解説は書かない

## 参照仕様

${specLinkList(f.specLinks)}
`;
}

// ── サブエージェント定義（.claude/agents/a11y-reviewer.md） ──
export function buildAgentMd(session: ChatSession): string {
  const f = extractFindings(session);

  return `---
name: a11y-reviewer
description: UI コード（コンポーネント・スタイル・テンプレート）の変更をアクセシビリティ観点でレビューする専門エージェント。PR レビューや実装完了時に自動起動する。
tools: Read, Grep, Glob
---

あなたはアクセシビリティ専門のコードレビュアーです。
開発者はアクセシビリティに詳しくない前提で、修正コードをそのまま渡してください。

# 正確性ルール（最重要）

${ACCURACY_RULES}

# レビュー出力フォーマット（厳守）

指摘ごとに以下の3行のみ。前置き・総評・褒め言葉は書かない:

1. **場所**: ファイルパス:行番号
2. **修正**: 修正後のコード（diff またはスニペット）
3. **根拠**: WCAG 2.2 SC 番号 + 基準名を1行

指摘ゼロの場合は「a11y 指摘なし」とだけ返す。

# このプロジェクトで特に確認する基準

${wcagChecklist(f.wcagCriteria)}
`;
}

// ── CLAUDE.md 追記スニペット ──────────────────────────
export function buildClaudeMdSnippet(session: ChatSession): string {
  const f = extractFindings(session);

  return `## アクセシビリティ（SpecBridge 生成）

UI コードを書く・変更するとき、以下を暗黙の要件として扱う（ユーザーからの指示は不要）:

${ACCURACY_RULES}

### このプロジェクトの必須達成基準

${wcagChecklist(f.wcagCriteria)}

### 根拠仕様（判断に迷ったら参照）

${specLinkList(f.specLinks)}
`;
}

// ── エクスポートメニュー用メタ ────────────────────────
export type ExportKind = "design-doc" | "skill" | "agent" | "claude-md";

export const EXPORT_META: { kind: ExportKind; label: string; filename: string; desc: string; build: (s: ChatSession) => string }[] = [
  { kind: "design-doc", label: "DESIGN.md", filename: "DESIGN.md", desc: "設計判断ログ + WCAG チェックリスト。チーム共有・PR 添付用", build: buildDesignDoc },
  { kind: "skill", label: "Claude Code Skill", filename: "SKILL.md", desc: ".claude/skills/a11y-review/ に置くと AI コーディング時に a11y レビューが自動で効く", build: buildSkillMd },
  { kind: "agent", label: "サブエージェント定義", filename: "a11y-reviewer.md", desc: ".claude/agents/ に置くと a11y 専門レビュアーが使える", build: buildAgentMd },
  { kind: "claude-md", label: "CLAUDE.md 追記", filename: "claude-md-a11y-snippet.md", desc: "プロジェクトの CLAUDE.md に貼ると全 AI 作業に a11y 要件が乗る", build: buildClaudeMdSnippet },
];
