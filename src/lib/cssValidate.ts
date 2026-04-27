// CSS プロパティ名検証: LLM 出力中の style 属性 / <style> ブロック / コードフェンス内の
// CSS プロパティ名を抽出し、辞書（主要 CSS プロパティ）外のものを「未知」としてフラグする
// L3 ハレーション防止 Stage 3-a
//
// 戦略:
// - HTML inline style: style="prop: value; prop2: value2"
// - <style> ブロック内のルール: selector { prop: value }
// - 文字列ベース。完全な CSS パーサーは過剰
// - 辞書外でも warn ではなく info 寄り（false-positive 抑制）

import { isKnownCssProperty } from "./cssDictionary";
import { stripBadSections } from "./ariaValidate";

export type CssValidateResult = {
  total: number;
  valid: string[];
  unknown: string[];
};

// inline style: style="..." または style='...'（ダブル/シングル両対応）
const INLINE_STYLE_RE = /style\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;

// CSS 宣言: prop: value; を property 名のみ抽出
// プロパティ名: 通常 (color)、ベンダープレフィックス (-webkit-foo)、カスタムプロパティ (--my-var) いずれも許容
const DECL_PROP_RE = /(?:^|[;{])\s*(-{0,2}[a-zA-Z][a-zA-Z0-9-]*)\s*:/g;

function extractCssProps(declarations: string): string[] {
  const props: string[] = [];
  let m;
  DECL_PROP_RE.lastIndex = 0;
  while ((m = DECL_PROP_RE.exec(declarations)) !== null) {
    props.push(m[1].toLowerCase());
  }
  return props;
}

// <style>...</style> ブロックを抽出
const STYLE_BLOCK_RE = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;

export function validateCssProps(text: string): CssValidateResult {
  // ## ❌ Bad セクションは除外
  const cleaned = stripBadSections(text);
  const allProps: string[] = [];

  // 1. inline style 属性
  let m;
  INLINE_STYLE_RE.lastIndex = 0;
  while ((m = INLINE_STYLE_RE.exec(cleaned)) !== null) {
    const decl = m[1] ?? m[2] ?? "";
    allProps.push(...extractCssProps(decl));
  }

  // 2. <style> ブロック内のルール（selector { ... } の中身）
  STYLE_BLOCK_RE.lastIndex = 0;
  while ((m = STYLE_BLOCK_RE.exec(cleaned)) !== null) {
    allProps.push(...extractCssProps(m[1]));
  }

  const valid: string[] = [];
  const unknown: string[] = [];
  const seenValid = new Set<string>();
  const seenUnknown = new Set<string>();
  for (const prop of allProps) {
    if (isKnownCssProperty(prop)) {
      if (!seenValid.has(prop)) {
        valid.push(prop);
        seenValid.add(prop);
      }
    } else {
      if (!seenUnknown.has(prop)) {
        unknown.push(prop);
        seenUnknown.add(prop);
      }
    }
  }
  return {
    total: allProps.length,
    valid,
    unknown,
  };
}
