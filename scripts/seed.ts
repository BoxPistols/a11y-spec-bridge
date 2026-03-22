/**
 * scripts/seed.ts
 * ─────────────────────────────────────────────────────
 * docs/*.jsonl を読み込み、OpenAI Embedding → Upstash Vector に upsert
 *
 * 実行: npm run seed
 * 前提: OPENAI_API_KEY / UPSTASH_VECTOR_REST_URL / UPSTASH_VECTOR_REST_TOKEN
 *       が .env.local に設定されていること
 *
 * 冪等: 同じ id で upsert するので何度実行しても安全
 */

import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import OpenAI from "openai";
import { Index } from "@upstash/vector";
import * as dotenv from "dotenv";

// .env.local を読み込む
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

// ── 設定 ─────────────────────────────────────────────
const BATCH_EMBED = 100;   // OpenAI Embedding バッチサイズ
const BATCH_UPSERT = 100;  // Upstash upsert バッチサイズ
const CHUNK_SIZE = 800;    // 1チャンク最大文字数（セクションをさらに分割）
const CHUNK_OVERLAP = 80;

type DocEntry = {
  id: string;
  url: string;
  title: string;
  section: string;
  source: "MDN" | "WCAG" | "WAI-ARIA";
  text: string;
};

type VectorRecord = {
  id: string;
  vector: number[];
  metadata: {
    source: string;
    title: string;
    section: string;
    url: string;
    text: string;       // 検索結果表示用スニペット（先頭300文字）
  };
};

// ── チャンク分割（長いセクションをさらに分割） ────────
function chunkText(entry: DocEntry): Array<{ id: string; text: string; entry: DocEntry }> {
  const text = entry.text;
  if (text.length <= CHUNK_SIZE) {
    return [{ id: entry.id, text, entry }];
  }
  const chunks: Array<{ id: string; text: string; entry: DocEntry }> = [];
  let start = 0;
  let idx = 0;
  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    const slice = text.slice(start, end).trim();
    if (slice.length > 40) {
      chunks.push({ id: `${entry.id}-c${idx++}`, text: slice, entry });
    }
    start += CHUNK_SIZE - CHUNK_OVERLAP;
  }
  return chunks;
}

// ── JSONL 読み込み ────────────────────────────────────
async function readJsonl(file: string): Promise<DocEntry[]> {
  const entries: DocEntry[] = [];
  const rl = readline.createInterface({ input: fs.createReadStream(file) });
  for await (const line of rl) {
    if (line.trim()) {
      try { entries.push(JSON.parse(line)); } catch { /* skip */ }
    }
  }
  return entries;
}

// ── バッチ処理ユーティリティ ─────────────────────────
function batches<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ── sleep ─────────────────────────────────────────────
function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ── メイン ────────────────────────────────────────────
async function main() {
  // 環境変数チェック
  const missing = ["OPENAI_API_KEY", "UPSTASH_VECTOR_REST_URL", "UPSTASH_VECTOR_REST_TOKEN"]
    .filter(k => !process.env[k]);
  if (missing.length) {
    console.error(`❌ 未設定の環境変数: ${missing.join(", ")}`);
    console.error("   .env.local を確認してください");
    process.exit(1);
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const index = new Index({
    url: process.env.UPSTASH_VECTOR_REST_URL!,
    token: process.env.UPSTASH_VECTOR_REST_TOKEN!,
  });

  const docsDir = path.join(process.cwd(), "docs");
  const jsonlFiles = fs.readdirSync(docsDir).filter(f => f.endsWith(".jsonl"));

  if (jsonlFiles.length === 0) {
    console.error("❌ docs/*.jsonl が見つかりません。先に npm run crawl を実行してください");
    process.exit(1);
  }

  // 全エントリ収集
  let allChunks: Array<{ id: string; text: string; entry: DocEntry }> = [];
  for (const file of jsonlFiles) {
    const entries = await readJsonl(path.join(docsDir, file));
    const chunked = entries.flatMap(chunkText);
    console.log(`📄 ${file}: ${entries.length} entries → ${chunked.length} chunks`);
    allChunks = allChunks.concat(chunked);
  }
  console.log(`\n🔢 総チャンク数: ${allChunks.length}`);

  // Embedding → Upsert
  let upserted = 0;
  let errors = 0;
  const embedBatches = batches(allChunks, BATCH_EMBED);

  console.log(`\n⚙️  Embedding + Upsert 開始 (${embedBatches.length} バッチ)\n`);

  for (let bi = 0; bi < embedBatches.length; bi++) {
    const batch = embedBatches[bi];
    process.stdout.write(`  batch ${bi + 1}/${embedBatches.length} ... `);

    try {
      // Embedding（OpenAI text-embedding-3-small）
      const embRes = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: batch.map(c => c.text),
      });

      // VectorRecord 作成
      const records: VectorRecord[] = batch.map((chunk, i) => ({
        id: chunk.id,
        vector: embRes.data[i].embedding,
        metadata: {
          source: chunk.entry.source,
          title: chunk.entry.title,
          section: chunk.entry.section,
          url: chunk.entry.url,
          text: chunk.text.slice(0, 300),
        },
      }));

      // Upsert（100件ずつ）
      for (const uBatch of batches(records, BATCH_UPSERT)) {
        await index.upsert(uBatch);
        upserted += uBatch.length;
      }

      console.log(`✓ (${batch.length} chunks)`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`✗ ${msg}`);
      errors += batch.length;
    }
    await sleep(200);
  }

  // 結果確認
  const info = await index.info();
  console.log(`\n✅ 完了`);
  console.log(`   upserted: ${upserted}`);
  console.log(`   errors:   ${errors}`);
  console.log(`   Upstash vector count: ${info.vectorCount}`);
}

main().catch(console.error);
