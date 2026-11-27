/**
 * src/lib/rag.ts — SpecBridge
 * Upstash Vector + OpenAI Embedding
 * メタデータに source / title / section / url を持つ
 */

import OpenAI from "openai";
import { Index } from "@upstash/vector";
import { buildSourceFilter, type Source } from "./sources";

export type { Source };

export type SearchResult = {
  id: string;
  score: number;
  source: Source;
  title: string;
  section: string;
  url: string;
  snippet: string;
};

export type StoreStats = {
  vectorCount: number;
  pendingVectorCount?: number;
};

// ── シングルトン ──────────────────────────────────────
let _openai: OpenAI | null = null;
let _index: Index | null = null;

function getOpenAI() {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

function getIndex() {
  if (!_index) {
    _index = new Index({
      url: process.env.UPSTASH_VECTOR_REST_URL!,
      token: process.env.UPSTASH_VECTOR_REST_TOKEN!,
    });
  }
  return _index;
}

// ── Embedding（OpenAI text-embedding-3-small / 1536次元）
export async function embed(texts: string[]): Promise<number[][]> {
  const res = await getOpenAI().embeddings.create({
    model: "text-embedding-3-small",
    input: texts,
  });
  return res.data.map(d => d.embedding);
}

// ── 類似検索 ─────────────────────────────────────────
export async function search(
  query: string,
  k = 6,
  filterSource?: Source
): Promise<SearchResult[]> {
  const [qv] = await embed([query]);
  const index = getIndex();

  const res = await index.query({
    vector: qv,
    topK: k,
    includeMetadata: true,
    // 許可リストを通った値だけをフィルタ式に埋め込む（外部入力によるフィルタ注入を防ぐ）
    filter: buildSourceFilter(filterSource),
  });

  return res.map(r => {
    const m = (r.metadata ?? {}) as Record<string, string>;
    return {
      id: String(r.id),
      score: r.score,
      source: (m.source ?? "MDN") as Source,
      title: m.title ?? "",
      section: m.section ?? "",
      url: m.url ?? "",
      snippet: m.text ?? "",
    };
  });
}

// ── カスタムドキュメント取り込み（Layer 2） ────────────
export type Chunk = {
  id: string;
  text: string;
  metadata: { source: Source; title: string; section: string; url: string };
};

export function splitText(text: string, title: string, chunkSize = 600, overlap = 60, source: Source = "CUSTOM"): Chunk[] {
  const chunks: Chunk[] = [];
  const cleaned = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  const prefix = source.toLowerCase();
  let start = 0, idx = 0;
  while (start < cleaned.length) {
    const slice = cleaned.slice(start, Math.min(start + chunkSize, cleaned.length)).trim();
    if (slice.length > 30) {
      chunks.push({
        id: `${prefix}-${Date.now()}-${idx++}`,
        text: `[${source}] ${title}\n\n${slice}`,
        metadata: { source, title, section: `chunk-${idx}`, url: "" },
      });
    }
    start += chunkSize - overlap;
  }
  return chunks;
}

export async function ingestChunks(chunks: Chunk[]): Promise<void> {
  const index = getIndex();
  const BATCH = 100;
  for (let i = 0; i < chunks.length; i += BATCH) {
    const batch = chunks.slice(i, i + BATCH);
    const vectors = await embed(batch.map(c => c.text));
    await index.upsert(
      batch.map((c, j) => ({
        id: c.id,
        vector: vectors[j],
        metadata: { ...c.metadata, text: c.text.slice(0, 300) },
      }))
    );
  }
}

// ── ストア統計 ────────────────────────────────────────
export async function getStoreStats(): Promise<StoreStats> {
  const info = await getIndex().info();
  return {
    vectorCount: info.vectorCount ?? 0,
    pendingVectorCount: info.pendingVectorCount ?? 0,
  };
}

// ── 休止の防止（定期実行から呼ぶ） ─────────────────────
// Upstash の無料プランは長くアクセスが無いとインデックスを休止する。
// 利用実績として数えられる検索を 1 件だけ実行する。Embedding は使わず固定のベクトルで検索するため OpenAI の費用はかからない
export const EMBEDDING_DIMENSIONS = 1536;

export async function touchIndex(): Promise<{ vectorCount: number; matched: number }> {
  const index = getIndex();
  const probe = Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => (i === 0 ? 1 : 0));
  const res = await index.query({ vector: probe, topK: 1 });
  const info = await index.info();
  return { vectorCount: info.vectorCount ?? 0, matched: res.length };
}
