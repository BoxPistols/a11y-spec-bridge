// 主要 CSS プロパティ辞書（CSS Level 2.1 / 3 / Working Drafts の主要プロパティ）
// L3 Stage 3-a 検証で LLM 出力中の CSS プロパティ名を照合する用途
// canonical: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference
//
// 戦略:
// - ベンダープレフィックス (-webkit-/-moz-/-ms-/-o-) はプレフィックス除去後に照合（valid 扱い）
// - CSS Custom Properties (--*) は常に valid（ユーザー定義変数）
// - 辞書外でも warn ではなく info 寄り（false-positive 抑制）

export const CSS_PROPERTIES: ReadonlySet<string> = new Set([
  // Layout
  "display", "position", "top", "left", "right", "bottom", "z-index",
  "float", "clear", "overflow", "overflow-x", "overflow-y",
  "visibility", "vertical-align", "inset", "inset-inline", "inset-block",
  "inset-inline-start", "inset-inline-end", "inset-block-start", "inset-block-end",

  // Box Model
  "width", "height", "min-width", "max-width", "min-height", "max-height",
  "margin", "margin-top", "margin-right", "margin-bottom", "margin-left",
  "margin-inline", "margin-block", "margin-inline-start", "margin-inline-end",
  "margin-block-start", "margin-block-end",
  "padding", "padding-top", "padding-right", "padding-bottom", "padding-left",
  "padding-inline", "padding-block", "padding-inline-start", "padding-inline-end",
  "padding-block-start", "padding-block-end",
  "box-sizing", "box-shadow", "outline", "outline-color", "outline-style",
  "outline-width", "outline-offset",

  // Border
  "border", "border-width", "border-style", "border-color",
  "border-top", "border-right", "border-bottom", "border-left",
  "border-top-width", "border-top-style", "border-top-color",
  "border-right-width", "border-right-style", "border-right-color",
  "border-bottom-width", "border-bottom-style", "border-bottom-color",
  "border-left-width", "border-left-style", "border-left-color",
  "border-radius", "border-top-left-radius", "border-top-right-radius",
  "border-bottom-left-radius", "border-bottom-right-radius",
  "border-image", "border-image-source", "border-image-slice",
  "border-image-width", "border-image-outset", "border-image-repeat",
  "border-collapse", "border-spacing",
  "border-inline", "border-block", "border-inline-start", "border-inline-end",
  "border-block-start", "border-block-end",

  // Background
  "background", "background-color", "background-image", "background-position",
  "background-size", "background-repeat", "background-attachment",
  "background-clip", "background-origin", "background-blend-mode",

  // Color
  "color", "opacity", "accent-color", "color-scheme", "caret-color",
  "forced-color-adjust", "print-color-adjust",

  // Typography
  "font", "font-family", "font-size", "font-weight", "font-style",
  "font-variant", "font-stretch", "font-feature-settings", "font-kerning",
  "font-variant-caps", "font-variant-east-asian", "font-variant-ligatures",
  "font-variant-numeric", "font-display", "font-size-adjust",
  "line-height", "letter-spacing", "word-spacing",
  "text-align", "text-align-last", "text-decoration", "text-decoration-line",
  "text-decoration-style", "text-decoration-color", "text-decoration-thickness",
  "text-decoration-skip-ink", "text-underline-offset", "text-underline-position",
  "text-transform", "text-indent", "text-shadow", "text-overflow", "text-justify",
  "text-orientation", "text-rendering", "text-emphasis", "text-emphasis-style",
  "text-emphasis-color", "text-emphasis-position",
  "white-space", "word-break", "word-wrap", "overflow-wrap", "hyphens",
  "tab-size", "writing-mode", "direction", "unicode-bidi",

  // List
  "list-style", "list-style-type", "list-style-image", "list-style-position",

  // Table
  "table-layout", "caption-side", "empty-cells",

  // Flexbox
  "flex", "flex-direction", "flex-wrap", "flex-flow",
  "justify-content", "justify-items", "justify-self",
  "align-items", "align-content", "align-self",
  "order", "flex-grow", "flex-shrink", "flex-basis",
  "gap", "row-gap", "column-gap",
  "place-content", "place-items", "place-self",

  // Grid
  "grid", "grid-template", "grid-template-columns", "grid-template-rows",
  "grid-template-areas", "grid-area", "grid-column", "grid-row",
  "grid-column-start", "grid-column-end", "grid-row-start", "grid-row-end",
  "grid-auto-flow", "grid-auto-columns", "grid-auto-rows",
  "grid-gap", "grid-row-gap", "grid-column-gap",

  // Animation & Transition
  "animation", "animation-name", "animation-duration", "animation-timing-function",
  "animation-delay", "animation-iteration-count", "animation-direction",
  "animation-fill-mode", "animation-play-state",
  "transition", "transition-property", "transition-duration",
  "transition-timing-function", "transition-delay",
  "will-change",

  // Transform
  "transform", "transform-origin", "transform-style", "transform-box",
  "perspective", "perspective-origin", "backface-visibility",

  // Effects
  "filter", "backdrop-filter", "mix-blend-mode", "isolation",
  "clip-path", "mask", "mask-image", "mask-mode", "mask-position",
  "mask-repeat", "mask-size", "mask-clip", "mask-origin", "mask-composite",

  // Interaction
  "cursor", "pointer-events", "user-select", "touch-action", "resize",
  "scroll-behavior", "scroll-margin", "scroll-padding", "scroll-snap-type",
  "scroll-snap-align", "scroll-snap-stop", "overscroll-behavior",
  "scrollbar-color", "scrollbar-width", "scrollbar-gutter",

  // Counters
  "content", "counter-reset", "counter-increment", "counter-set", "quotes",

  // SVG
  "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin",
  "stroke-dasharray", "stroke-dashoffset", "fill-rule", "fill-opacity",
  "stroke-opacity", "vector-effect",

  // Print / Page
  "page-break-before", "page-break-after", "page-break-inside",
  "break-before", "break-after", "break-inside", "orphans", "widows",

  // Logical Properties
  "block-size", "inline-size", "min-block-size", "max-block-size",
  "min-inline-size", "max-inline-size",

  // Misc
  "appearance", "all", "contain", "container", "container-type", "container-name",
  "object-fit", "object-position", "image-rendering", "image-orientation",
  "aspect-ratio", "columns", "column-count", "column-width", "column-gap",
  "column-rule", "column-rule-width", "column-rule-style", "column-rule-color",
  "column-fill", "column-span",
]);

const VENDOR_PREFIX_RE = /^-(?:webkit|moz|ms|o)-/;
const CUSTOM_PROPERTY_RE = /^--/;

export function isKnownCssProperty(name: string): boolean {
  const lower = name.toLowerCase();
  // CSS Custom Properties は常に valid
  if (CUSTOM_PROPERTY_RE.test(lower)) return true;
  // ベンダープレフィックスを剥がして辞書照合
  const stripped = lower.replace(VENDOR_PREFIX_RE, "");
  return CSS_PROPERTIES.has(stripped);
}
