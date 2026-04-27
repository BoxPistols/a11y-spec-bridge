// ARIA 属性検証: LLM 出力（マークダウン + HTML コードブロック）から aria-* 属性を抽出し
// 辞書（WAI-ARIA 1.2 + 1.3）に存在しないものを「未知（捏造の疑い）」としてフラグする
// L3 ハレーション防止パイプラインの Stage 1
//
// 検出の方針:
// - HTML 風の属性記法 `aria-foo="..."` または `aria-foo='...'` または `aria-foo` 単体を捕捉
// - インラインコード（`...`）と html コードブロック内も検査対象
// - Bad コードブロック内（## ❌ Bad の直下）は意図的に誤りを含めるため除外
// - 検出は文字列ベースで、DOM 化しない（depth/role 検証は別 Stage）

import { ARIA_ATTRIBUTES } from "./ariaDictionary";

export type AriaValidateResult = {
  total: number;
  valid: string[];
  unknown: string[];
};

const ARIA_ATTR_RE = /\baria-[a-z][a-z-]*/gi;

// ## ❌ Bad（…）または ## ❌ Bad の見出し直下のセクションを抽出するための正規表現
// 次の見出し（## または #）または文末までを Bad ブロックとみなす
const BAD_SECTION_RE = /##\s*[❌]?\s*Bad[\s\S]*?(?=##\s|$)/g;

export function stripBadSections(text: string): string {
  return text.replace(BAD_SECTION_RE, "");
}

export function validateAriaAttrs(text: string): AriaValidateResult {
  // Bad セクションを除外して検証（教育的な誤りを警告対象から外す）
  const cleaned = stripBadSections(text);
  const matches = cleaned.match(ARIA_ATTR_RE) ?? [];
  const valid: string[] = [];
  const unknown: string[] = [];
  const seenValid = new Set<string>();
  const seenUnknown = new Set<string>();
  for (const raw of matches) {
    const attr = raw.toLowerCase();
    if (ARIA_ATTRIBUTES.has(attr)) {
      if (!seenValid.has(attr)) {
        valid.push(attr);
        seenValid.add(attr);
      }
    } else {
      if (!seenUnknown.has(attr)) {
        unknown.push(attr);
        seenUnknown.add(attr);
      }
    }
  }
  return {
    total: matches.length,
    valid,
    unknown,
  };
}
