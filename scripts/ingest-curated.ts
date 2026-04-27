/**
 * scripts/ingest-curated.ts
 * ─────────────────────────────────────────────────────
 * curated-snippets.json を CURATED ソースとして Upstash Vector に投入
 *
 * 実行: npm run ingest:curated
 * 引数: npm run ingest:curated -- --file path/to/snippets.json
 *
 * 冪等: 同じ id で upsert するので何度実行しても安全
 */

import * as fs from "fs";
import * as path from "path";
import OpenAI from "openai";
import { Index } from "@upstash/vector";
import * as dotenv from "dotenv";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

// ── 型定義 ───────────────────────────────────────────
// Phase 4 で導入した assets フィールド: 録画系の静的アセット参照
// type: "gif" | "webm" | "img"、src は data: URL を推奨（HTTPS は将来 CSP 拡張時に許可）
type CuratedAsset = {
  type: "gif" | "webm" | "img";
  src: string;
  alt: string;
  caption?: string;
};

type CuratedSnippet = {
  id: string;
  mode?: "ia" | "visual" | "system" | "handoff" | "interactive";
  title: string;
  category: "flow-goal" | "spec-handoff" | "ui-quality";
  tags: string[];
  question?: string;
  text: string;
  rationale: string;
  severity: "error" | "warning";
  goal: string;
  assets?: CuratedAsset[];
};

type VectorRecord = {
  id: string;
  vector: number[];
  metadata: {
    source: "CURATED";
    title: string;
    section: string;
    url: string;
    text: string;
    category: string;
    severity: string;
    mode: string;
  };
};

// ── 設定 ─────────────────────────────────────────────
const BATCH_EMBED = 50;
const BATCH_UPSERT = 100;
const DEFAULT_FILE = path.join(process.cwd(), "docs", "curated-snippets.json");

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function batches<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ── Embedding 用テキスト生成 ─────────────────────────
// question + text + tags + rationale を結合して Embedding 精度を上げる
// question はユーザーのクエリ文体に近いため、検索ヒット率を向上させる
function buildEmbeddingText(s: CuratedSnippet): string {
  const tagStr = s.tags.join(", ");
  const questionLine = s.question ? `\n問い: ${s.question}` : "";
  const modeLine = s.mode ? ` | モード: ${s.mode}` : "";
  // assets の alt / caption も検索ヒット率向上のため Embedding 入力に含める
  const assetsLine = s.assets?.length
    ? `\n録画/画像: ${s.assets.map(a => `[${a.type}] ${a.alt}${a.caption ? ` - ${a.caption}` : ""}`).join("; ")}`
    : "";
  return `[CURATED] ${s.title}\nカテゴリ: ${s.category}${modeLine} | タグ: ${tagStr}${questionLine}${assetsLine}\n\n${s.text}\n\n理由: ${s.rationale}`;
}

// ── メイン ────────────────────────────────────────────
async function main() {
  const missing = ["OPENAI_API_KEY", "UPSTASH_VECTOR_REST_URL", "UPSTASH_VECTOR_REST_TOKEN"]
    .filter(k => !process.env[k]);
  if (missing.length) {
    console.error(`未設定の環境変数: ${missing.join(", ")}`);
    process.exit(1);
  }

  // --file 引数の解析
  const fileArgIdx = process.argv.indexOf("--file");
  const filePath = fileArgIdx !== -1 && process.argv[fileArgIdx + 1]
    ? path.resolve(process.argv[fileArgIdx + 1])
    : DEFAULT_FILE;

  if (!fs.existsSync(filePath)) {
    console.error(`ファイルが見つかりません: ${filePath}`);
    console.error(`デフォルト: docs/curated-snippets.json`);
    process.exit(1);
  }

  const snippets: CuratedSnippet[] = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  console.log(`読み込み: ${filePath} (${snippets.length} 件)`);

  // ID 重複チェック
  const ids = snippets.map(s => s.id);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupes.length) {
    console.error(`ID 重複: ${[...new Set(dupes)].join(", ")}`);
    process.exit(1);
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const index = new Index({
    url: process.env.UPSTASH_VECTOR_REST_URL!,
    token: process.env.UPSTASH_VECTOR_REST_TOKEN!,
  });

  // Embedding + Upsert
  let upserted = 0;
  const embedBatches = batches(snippets, BATCH_EMBED);

  console.log(`\nEmbedding + Upsert 開始 (${embedBatches.length} バッチ)\n`);

  for (let bi = 0; bi < embedBatches.length; bi++) {
    const batch = embedBatches[bi];
    process.stdout.write(`  batch ${bi + 1}/${embedBatches.length} ... `);

    const texts = batch.map(buildEmbeddingText);

    const embRes = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: texts,
    });

    const records: VectorRecord[] = batch.map((snippet, i) => ({
      id: snippet.id,
      vector: embRes.data[i].embedding,
      metadata: {
        source: "CURATED" as const,
        title: snippet.title,
        section: snippet.category,
        url: "",
        text: buildEmbeddingText(snippet).slice(0, 300),
        category: snippet.category,
        severity: snippet.severity,
        mode: snippet.mode ?? "",
      },
    }));

    for (const uBatch of batches(records, BATCH_UPSERT)) {
      await index.upsert(uBatch);
      upserted += uBatch.length;
    }

    console.log(`ok (${batch.length} 件)`);
    await sleep(200);
  }

  const info = await index.info();
  console.log(`\n完了`);
  console.log(`  投入: ${upserted} 件`);
  console.log(`  Upstash 総ベクトル数: ${info.vectorCount}`);
}

main().catch(console.error);
