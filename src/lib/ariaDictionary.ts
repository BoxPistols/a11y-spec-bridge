// ARIA 属性辞書（WAI-ARIA 1.2 + 1.3 Working Draft）
// L3 検証パイプラインで LLM 出力中の aria-* 属性を照合し、捏造属性を検出する用途
// canonical: https://www.w3.org/TR/wai-aria-1.2/#state_prop_def
// 1.3 追加分: aria-description / aria-braillelabel / aria-brailleroledescription
//
// 注: deprecated（aria-grabbed / aria-dropeffect）は「実在する属性」として VALID 扱い。
// 教育的に正しいかどうかは別の議論で、ハレーション検出の観点では仕様に存在することを優先。

export const ARIA_ATTRIBUTES: ReadonlySet<string> = new Set([
  // Widget Attributes
  "aria-autocomplete",
  "aria-checked",
  "aria-disabled",
  "aria-errormessage",
  "aria-expanded",
  "aria-haspopup",
  "aria-hidden",
  "aria-invalid",
  "aria-label",
  "aria-level",
  "aria-modal",
  "aria-multiline",
  "aria-multiselectable",
  "aria-orientation",
  "aria-placeholder",
  "aria-pressed",
  "aria-readonly",
  "aria-required",
  "aria-selected",
  "aria-sort",
  "aria-valuemax",
  "aria-valuemin",
  "aria-valuenow",
  "aria-valuetext",

  // Live Region Attributes
  "aria-atomic",
  "aria-busy",
  "aria-live",
  "aria-relevant",

  // Drag-and-Drop Attributes (deprecated in 1.1, but exist)
  "aria-dropeffect",
  "aria-grabbed",

  // Relationship Attributes
  "aria-activedescendant",
  "aria-colcount",
  "aria-colindex",
  "aria-colspan",
  "aria-controls",
  "aria-describedby",
  "aria-details",
  "aria-flowto",
  "aria-labelledby",
  "aria-owns",
  "aria-posinset",
  "aria-rowcount",
  "aria-rowindex",
  "aria-rowspan",
  "aria-setsize",

  // Global states/properties
  "aria-current",
  "aria-keyshortcuts",
  "aria-roledescription",

  // ARIA 1.3 additions
  "aria-description",
  "aria-braillelabel",
  "aria-brailleroledescription",
  "aria-colindextext",
  "aria-rowindextext",
]);
