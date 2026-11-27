// ソースタグの許可リスト
// Upstash Vector のメタデータフィルタは文字列で組み立てるため、
// 外部から届いた値はこの一覧と完全一致したものだけを通す（フィルタ注入の防止）

export const SOURCES = ["MDN", "WCAG", "WAI-ARIA", "CUSTOM", "CURATED"] as const;

export type Source = (typeof SOURCES)[number];

export function isSource(value: unknown): value is Source {
  return typeof value === "string" && (SOURCES as readonly string[]).includes(value);
}

// 未指定（undefined / null / 空文字）は「絞り込みなし」として通し、それ以外の不正値は拒否する
export type SourceParam =
  | { ok: true; source: Source | undefined }
  | { ok: false; error: string };

export function parseSourceParam(value: unknown): SourceParam {
  if (value === undefined || value === null || value === "") return { ok: true, source: undefined };
  if (isSource(value)) return { ok: true, source: value };
  return { ok: false, error: `source は ${SOURCES.join(" / ")} のいずれかを指定してください` };
}

// Upstash Vector のフィルタ式。許可リストを通った値だけを埋め込む
export function buildSourceFilter(source: Source | undefined): string | undefined {
  return source && isSource(source) ? `source = '${source}'` : undefined;
}
