// 判定バナー: クイックモード回答の1行目（✅/❌/⚠️ + 理由一文）を検出し、
// コードを読まないデザイナーにも一目で伝わる色付きバナーとして描画するためのパーサ。
// マーカーが見つからない回答は null を返し、従来どおり全文を Markdown 描画する。

export type VerdictTier = "ok" | "ng" | "warn";

export type ParsedVerdict = {
  tier: VerdictTier;
  headline: string; // マーカーを除いた判定行（例: "問題ありません。ネイティブ button を使えば..."）
  body: string;     // 判定行を除いた残りの本文（Markdown）
};

const MARKERS: { re: RegExp; tier: VerdictTier }[] = [
  { re: /^(?:\*\*)?\s*✅/, tier: "ok" },
  { re: /^(?:\*\*)?\s*❌/, tier: "ng" },
  { re: /^(?:\*\*)?\s*⚠️?/, tier: "warn" },
];

export const VERDICT_LABEL: Record<VerdictTier, string> = {
  ok: "OK",
  ng: "NG",
  warn: "条件付き",
};

export function parseVerdict(content: string): ParsedVerdict | null {
  const lines = content.split("\n");
  const firstIdx = lines.findIndex(l => l.trim() !== "");
  if (firstIdx === -1) return null;
  const first = lines[firstIdx].trim();

  for (const { re, tier } of MARKERS) {
    if (re.test(first)) {
      const headline = first
        .replace(re, "")
        .replace(/^[:：\s]+/, "")
        .replace(/\*\*/g, "")
        .trim();
      const body = lines.slice(firstIdx + 1).join("\n").trim();
      return { tier, headline, body };
    }
  }
  return null;
}
