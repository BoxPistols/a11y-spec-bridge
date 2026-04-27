// キーボード操作整合性検証: LLM 出力中で Space/Enter/矢印キー等を言及しているのに
// 前提となる Tab フォーカスへの言及が欠けている場合に警告する
// L3 ハレーション防止 Stage 3-b
//
// 設計上の限界: 自然言語処理ではないため heuristics ベース。false-positive はあり得るが、
// 「Tab フォーカス手順抜け」は典型的なハレーション類型なので簡易チェックでも実効性がある

import { stripBadSections } from "./ariaValidate";

export type KeyboardValidateResult = {
  /** Space/Enter/矢印キー等への言及があるか */
  hasOperationKey: boolean;
  /** Tab への言及があるか */
  hasTabRef: boolean;
  /** 警告: 操作キー言及あり + Tab 言及なし */
  warn: boolean;
};

// 操作キーの言及（Space, Enter, 矢印, Esc 等のいずれか）
// 英語キーは \b で語境界、非ASCII（日本語・記号）は語境界が効かないため括弧外に並べる
const OPERATION_KEY_RE = /\b(?:Space|Spacebar|Enter|Arrow(?:Up|Down|Left|Right)?|Esc(?:ape)?)\b|スペース|エンター|矢印キー|[↑↓←→]/i;
// Tab 言及（"Tab" 単体 / "tab キー" / "Tab フォーカス" 等）
const TAB_RE = /\bTab\b|タブ\s*(?:キー|フォーカス|順)/i;

export function validateKeyboardCompleteness(text: string): KeyboardValidateResult {
  // ## ❌ Bad セクションは除外（教育的な誤りを警告対象から外す）
  const cleaned = stripBadSections(text);
  const hasOperationKey = OPERATION_KEY_RE.test(cleaned);
  const hasTabRef = TAB_RE.test(cleaned);
  const warn = hasOperationKey && !hasTabRef;
  return {
    hasOperationKey,
    hasTabRef,
    warn,
  };
}
