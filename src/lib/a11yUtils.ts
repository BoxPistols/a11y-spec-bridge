// canonical: github.com/BoxPistols/local-ui-builder/src/lib/a11yUtils.ts
// copied: 2026-04-27
// 配布方針: モノレポ化せず単一ファイルコピペ。コピー時は canonical URL + コピー日付をヘッダに残し、canonical を更新したら同テストケースで再検証して同期。
// 依存ゼロ・純粋関数のみ。SpecBridge / ux-review-plugin で同テストケース通せば一致担保。

/** WCAG 2.1 相対輝度（hex → 0..1）。不正なhexは throw する（NaN伝播による無音バグ防止） */
export function relativeLuminance(hex: string): number {
  const normalized = normalizeHex(hex);
  if (!/^[0-9a-f]{6}$/.test(normalized)) {
    throw new Error(`Invalid hex color: ${hex}`);
  }
  const rgb = normalized.match(/.{2}/g)!.map((h) => {
    const c = parseInt(h, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

/** 2色のコントラスト比（WCAG 2.1）。引数順は問わない（常に 1:1〜21:1） */
export function contrastRatio(fg: string, bg: string): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

export interface WCAGResult {
  /** コントラスト比（小数1桁丸め） */
  ratio: number;
  /** AA 通常テキスト基準 4.5:1 */
  AA_normal: boolean;
  /** AA 大きいテキスト基準 3:1（18pt以上 or 14pt太字以上） */
  AA_large: boolean;
  /** AAA 通常テキスト基準 7:1 */
  AAA_normal: boolean;
  /** AAA 大きいテキスト基準 4.5:1 */
  AAA_large: boolean;
}

/** WCAG準拠レベルを deterministic に判定 */
export function wcagJudge(fg: string, bg: string): WCAGResult {
  const ratio = contrastRatio(fg, bg);
  return {
    ratio: Math.round(ratio * 10) / 10,
    AA_normal: ratio >= 4.5,
    AA_large: ratio >= 3,
    AAA_normal: ratio >= 7,
    AAA_large: ratio >= 4.5,
  };
}

// 3桁hex (#fff) → 6桁、# プレフィックス除去
function normalizeHex(hex: string): string {
  let h = hex.replace(/^#/, "").toLowerCase();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return h;
}
