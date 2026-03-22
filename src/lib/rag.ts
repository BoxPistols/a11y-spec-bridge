/**
 * src/lib/rag.ts — SpecBridge
 * Upstash Vector + OpenAI Embedding
 * メタデータに source / title / section / url を持つ
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { Index } from "@upstash/vector";

export type Source = "MDN" | "WCAG" | "WAI-ARIA" | "CUSTOM";

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
let _genAI: GoogleGenerativeAI | null = null;
let _index: Index | null = null;

function getGenAI() {
  if (!_genAI) _genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY ?? "");
  return _genAI;
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

// ── Embedding（gemini-embedding-001 / 768次元） ───────
export async function embed(texts: string[]): Promise<number[][]> {
  const model = getGenAI().getGenerativeModel({ model: "gemini-embedding-001" });
  const res = await model.batchEmbedContents({
    requests: texts.map(t => ({
      content: { role: "user", parts: [{ text: t }] },
      outputDimensionality: 768,
    })),
  });
  return res.embeddings.map(e => e.values);
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
    filter: filterSource ? `source = '${filterSource}'` : undefined,
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
  metadata: { source: "CUSTOM"; title: string; section: string; url: string };
};

export function splitText(text: string, title: string, chunkSize = 600, overlap = 60): Chunk[] {
  const chunks: Chunk[] = [];
  const cleaned = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  let start = 0, idx = 0;
  while (start < cleaned.length) {
    const slice = cleaned.slice(start, Math.min(start + chunkSize, cleaned.length)).trim();
    if (slice.length > 30) {
      chunks.push({
        id: `custom-${Date.now()}-${idx++}`,
        text: `[CUSTOM] ${title}\n\n${slice}`,
        metadata: { source: "CUSTOM", title, section: `chunk-${idx}`, url: "" },
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
