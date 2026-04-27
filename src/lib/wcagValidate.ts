// WCAG 達成基準番号の検証: LLM 出力中の "WCAG 2.X.X" や "達成基準 X.X.X" を抽出し
// WCAG_SC_IDS 辞書（2.0/2.1/2.2 全 SC）に存在しないものを「未知（捏造の疑い）」としてフラグする
// L3 ハレーション防止パイプラインの Stage 2

import { WCAG_SC_IDS } from "./wcagDictionary";
import { stripBadSections } from "./ariaValidate";

export type WcagValidateResult = {
  total: number;
  valid: string[];
  unknown: string[];
};

// "WCAG 2.X.X" / "達成基準 X.X.X" / "SC X.X.X" のパターン
// X.X.X は 1-4 桁を許容（4.1.13 のような将来拡張も）
// 番号のみのテキスト（"X.X.X" 単独）は誤検出が多いため拾わない
const WCAG_NUM_RE = /(?:WCAG\s*(?:2\.[0-2]\s*)?|(?:達成基準|SC|success\s+criterion)\s*)([0-9]\.[0-9]+\.[0-9]+)/gi;

export function validateWcagRefs(text: string): WcagValidateResult {
  // ## ❌ Bad セクションは除外（教育的な誤りを警告対象から外す）
  const cleaned = stripBadSections(text);
  const matches: string[] = [];
  let m;
  WCAG_NUM_RE.lastIndex = 0;
  while ((m = WCAG_NUM_RE.exec(cleaned)) !== null) {
    matches.push(m[1]);
  }
  const valid: string[] = [];
  const unknown: string[] = [];
  const seenValid = new Set<string>();
  const seenUnknown = new Set<string>();
  for (const id of matches) {
    if (WCAG_SC_IDS.has(id)) {
      if (!seenValid.has(id)) {
        valid.push(id);
        seenValid.add(id);
      }
    } else {
      if (!seenUnknown.has(id)) {
        unknown.push(id);
        seenUnknown.add(id);
      }
    }
  }
  return {
    total: matches.length,
    valid,
    unknown,
  };
}
