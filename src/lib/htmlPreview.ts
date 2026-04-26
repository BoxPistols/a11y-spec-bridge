// HtmlPreview の純粋関数群を切り出し（テスト容易化）
// React コンポーネント（HtmlPreview / PreviewThemeSwitch / ContrastBadge）は src/app/page.tsx に残置

import { wcagJudge, type WCAGResult } from "./a11yUtils";

// インラインstyleの最初の color と background(-color) を抽出。hex形式のみ対応
export const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export function extractFirstColorPair(html: string): { fg: string; bg: string } | null {
  const styleMatch = html.match(/style=(?:"([^"]*)"|'([^']*)')/);
  if (!styleMatch) return null;
  const style = styleMatch[1] ?? styleMatch[2] ?? "";
  const fg = style.match(/(?:^|[;\s])color\s*:\s*([^;]+)/i)?.[1].trim();
  const bg = style.match(/(?:^|[;\s])background(?:-color)?\s*:\s*([^;\s]+)/i)?.[1].trim();
  if (!fg || !bg || !HEX_RE.test(fg) || !HEX_RE.test(bg)) return null;
  return { fg, bg };
}

export function judgeContrast(html: string): WCAGResult | null {
  const pair = extractFirstColorPair(html);
  return pair ? wcagJudge(pair.fg, pair.bg) : null;
}

export type PreviewTheme = "light" | "dark" | "forced-colors";

// テーマ別ルックアップ。forced-colors は CSS system colors で色情報を強制剥離（WCAG 1.4.11 準拠）
export const THEME_STYLES: Record<PreviewTheme, {
  label: string;
  titleSuffix: string;
  colorScheme: string;
  bodyBg: string;
  bodyFg: string;
  extraCss: string;
}> = {
  light: {
    label: "Light",
    titleSuffix: "ライト",
    colorScheme: "light",
    bodyBg: "#ffffff",
    bodyFg: "#222222",
    extraCss: "",
  },
  dark: {
    label: "Dark",
    titleSuffix: "ダーク",
    colorScheme: "dark",
    bodyBg: "#1a1a1a",
    bodyFg: "#e0e0e0",
    extraCss: "",
  },
  "forced-colors": {
    label: "Forced",
    titleSuffix: "強制色",
    colorScheme: "light dark",
    bodyBg: "Canvas",
    bodyFg: "CanvasText",
    // 全要素の背景画像・影を剥がし system color に置換、操作要素は ButtonFace/ButtonText + 1px border
    extraCss: "*{background-image:none!important;box-shadow:none!important;text-shadow:none!important;background-color:Canvas!important;color:CanvasText!important;border-color:CanvasText!important;}button,[role=button],a,input,select,textarea{background-color:ButtonFace!important;color:ButtonText!important;border:1px solid ButtonText!important;}",
  },
};

// iframe body のデフォルト bg/fg のみを切替。HTML 内の明示色は基本上書きしない
// （forced-colors のみ * セレクタで強制剥離して Windows ハイコントラスト相当を擬似再現）
export function buildPreviewSrcDoc(code: string, theme: PreviewTheme): string {
  const t = THEME_STYLES[theme];
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:"><style>:root{color-scheme:${t.colorScheme};}body{font-family:-apple-system,BlinkMacSystemFont,"Hiragino Sans","Noto Sans JP",sans-serif;margin:16px;font-size:14px;color:${t.bodyFg};background:${t.bodyBg};}${t.extraCss}</style></head><body>${code}</body></html>`;
}

export const PREVIEW_THEMES: readonly PreviewTheme[] = ["light", "dark", "forced-colors"] as const;
