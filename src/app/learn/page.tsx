"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import hljs from "highlight.js/lib/core";
import typescript from "highlight.js/lib/languages/typescript";
import json from "highlight.js/lib/languages/json";
import styles from "./learn.module.css";

hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("json", json);

// ── タブ定義 ──
type TabId = "flow" | "sim" | "code" | "glossary";
const TABS: { id: TabId; label: string }[] = [
  { id: "flow", label: "フロー解説" },
  { id: "sim", label: "シミュレーション" },
  { id: "code", label: "コード逆引き" },
  { id: "glossary", label: "用語辞典" },
];

// ── フローステップ定義 ──
interface FlowStep {
  num: string;
  title: string;
  desc: string;
  color: string;
  body: string;
  code?: { label: string; content: string };
  dataFlow?: { label: string; value: string }[];
}

const INGEST_STEPS: FlowStep[] = [
  {
    num: "01", title: "ファイルアップロード", desc: "PDF / TXT / MD → API /ingest に送信",
    color: "var(--spec)", body: "クライアントが POST /api/ingest でファイルを送信。Next.js API Route がファイルを受け取り、テキスト抽出を開始します。",
    code: { label: "api/ingest/route.ts", content: `// ファイル受信 → テキスト抽出
const file = formData.get("file") as File;
const buffer = Buffer.from(await file.arrayBuffer());

// PDF / TXT / MD を判定してテキスト化
if (file.name.endsWith(".pdf")) {
  const pdf = await pdfParse(buffer);
  text = pdf.text;
} else {
  text = buffer.toString("utf-8");
}` },
  },
  {
    num: "02", title: "チャンク分割", desc: "長文を 500文字 × オーバーラップ 50文字 で切り出す",
    color: "var(--a11y)", body: "LLMのコンテキスト制限と検索精度向上のため、テキストを小さな塊（チャンク）に分割します。オーバーラップにより境界で文脈が途切れるのを防ぎます。",
    code: { label: "チャンク分割ロジック", content: `// テキストをオーバーラップ付きで分割
const CHUNK_SIZE = 500;
const OVERLAP = 50;
const chunks: string[] = [];

for (let i = 0; i < text.length; i += CHUNK_SIZE - OVERLAP) {
  chunks.push(text.slice(i, i + CHUNK_SIZE));
}
// 例: 2000文字 → 約5チャンク` },
    dataFlow: [
      { label: "入力", value: "1ページ 2000文字のテキスト" },
      { label: "出力", value: "チャンク×5個（各〜500文字、境界は50文字重複）" },
    ],
  },
  {
    num: "03", title: "ベクトル化 & DB保存", desc: "OpenAI Embeddings → Upstash Vector に格納",
    color: "var(--aria)", body: "各チャンクを OpenAI text-embedding-3-small API でベクトル化（1536次元）。そのベクトルとテキスト・メタデータを Upstash Vector DB に保存します。",
    code: { label: "Upstash Vector への保存", content: `// OpenAI Embeddings でベクトル化
const embedding = await openai.embeddings.create({
  model: "text-embedding-3-small",
  input: chunk,
});

// Upstash Vector DB に保存
await index.upsert({
  id: chunkId,
  vector: embedding.data[0].embedding,  // [0.02, -0.14, ...×1536]
  metadata: { source, title, section, text: chunk },
});` },
    dataFlow: [
      { label: "テキスト", value: "\"WCAG 2.2 の達成基準 1.4.3 は...\"" },
      { label: "ベクトル", value: "[0.021, -0.143, 0.089, ... × 1536次元]" },
    ],
  },
];

const QUERY_STEPS: FlowStep[] = [
  {
    num: "04", title: "質問のベクトル化", desc: "ユーザーの質問文 → 同じ Embedding モデルでベクトル化",
    color: "var(--custom)", body: "ユーザーの質問を、取り込み時と同じ OpenAI Embeddings モデルでベクトルに変換します。同じモデルを使うことで「意味的に近い」ベクトルが近い距離に配置されます。",
    code: { label: "lib/rag.ts — 質問の Embedding", content: `// 質問文をベクトル化（取り込みと同じモデル）
const queryEmbedding = await openai.embeddings.create({
  model: "text-embedding-3-small",
  input: question,
});` },
  },
  {
    num: "05", title: "類似度検索（Vector Search）", desc: "Upstash Vector から意味的に近いチャンクを Top-K 取得",
    color: "var(--spec)", body: "質問ベクトルと全チャンクベクトルのコサイン類似度を計算し、スコアが高い順に上位 k=6 チャンクを返します。キーワード一致ではなく意味の近さで検索するのがポイントです。",
    dataFlow: [
      { label: "質問ベクトル", value: "[0.031, -0.120, ...] ← \"ボタンのコントラスト比は？\"" },
      { label: "類似度 Top-6", value: "WCAG 1.4.3 (0.92) / WCAG 1.4.11 (0.87) / MDN color (0.84) / ..." },
    ],
  },
  {
    num: "06", title: "プロンプト組み立て", desc: "取得チャンク + 質問 + ロール → LLMへのプロンプト生成",
    color: "var(--a11y)", body: "取得した6チャンクのテキストを結合し「コンテキスト」として、ユーザーの質問・選択ロール（Designer/Engineer）とともにプロンプトに組み込みます。これが RAG の核心 — LLM に根拠情報を与えてから生成させる仕組みです。",
    code: { label: "lib/llm.ts — システムプロンプト", content: `// ロール別プロンプト + コンテキスト注入
const systemPrompt = role === "designer"
  ? "あなたはUIデザインの専門家です..."
  : "あなたはフロントエンドエンジニアです...";

const messages = [
  { role: "system", content: systemPrompt },
  { role: "user", content:
    \`コンテキスト:\\n\${context}\\n\\n質問: \${question}\` },
];` },
  },
  {
    num: "07", title: "LLM 生成 & レスポンス", desc: "コンテキストを根拠に回答生成 → 出典情報付きで返す",
    color: "var(--aria)", body: "GPT-6 LunaまたはGemini 3.5 Flash-Liteがコンテキストを読んで回答を生成。API は answer（回答文）と sources（出典の仕様名・セクション・URL）を返します。コンテキストに情報がなければ「該当情報がありません」と回答します。",
    code: { label: "レスポンス形式", content: `{
  "answer": "WCAG 2.2 達成基準 1.4.3 によると...",
  "sources": [
    {
      "source": "WCAG",
      "title": "1.4.3 コントラスト（最低限）",
      "section": "達成基準",
      "url": "https://www.w3.org/TR/WCAG22/#..."
    }
  ]
}` },
  },
];

// ── シミュレーション定義 ──
const SIM_STEPS = [
  { id: "embed", label: "質問をEmbedding (OpenAI API)", icon: "Aa", runLabel: "処理中...", doneLabel: "完了 (〜120ms)", delay: 600 },
  { id: "search", label: "Upstash ベクトル検索 (Top-6)", icon: "🔍", runLabel: "検索中...", doneLabel: "6件取得 (〜15ms)", delay: 400 },
  { id: "prompt", label: "プロンプト組み立て (ロール別)", icon: "📝", runLabel: "組み立て中...", doneLabel: "完了 (〜1ms)", delay: 300 },
  { id: "llm", label: "GPT-6 Luna 生成", icon: "AI", runLabel: "生成中...", doneLabel: "完了 (〜800ms)", delay: 1400 },
  { id: "parse", label: "回答パース → レスポンス", icon: "✓", runLabel: "パース中...", doneLabel: "完了", delay: 200 },
];

// 質問キーワード → 回答 + 出典 のセット。質問内容と出典がずれないよう紐付ける
type SimSource = { tag: string; section: string };
type SimSample = { keywords: string[]; answer: string; sources: SimSource[] };

const SIM_SAMPLES: SimSample[] = [
  {
    keywords: ["コントラスト", "contrast", "4.5", "視認"],
    answer: "WCAG 2.2 達成基準 1.4.3「コントラスト（最低限）」では、テキストおよび文字画像のコントラスト比は 4.5:1 以上を要求しています。大きなテキスト（18pt以上 or 14pt太字以上）では 3:1 以上で可です。",
    sources: [
      { tag: "WCAG 2.2", section: "1.4.3 コントラスト" },
      { tag: "WCAG 2.2", section: "1.4.11 非テキストコントラスト" },
      { tag: "MDN", section: "color-contrast()" },
    ],
  },
  {
    keywords: ["role", "ボタン", "button", "aria", "tabindex"],
    answer: "WAI-ARIA の role=\"button\" は、非インタラクティブ要素（divやspan）をボタンとして振る舞わせるために使用します。tabindex=\"0\" と keydown ハンドラ（Enter/Space）の追加も必要です。",
    sources: [
      { tag: "WAI-ARIA", section: "role=button" },
      { tag: "MDN", section: "ARIA: button role" },
      { tag: "WCAG 2.2", section: "4.1.2 名前・役割・値" },
    ],
  },
  {
    keywords: ["motion", "アニメ", "reduced", "動き"],
    answer: "MDN によると、CSS の prefers-reduced-motion メディアクエリを使えば、アニメーション不要のユーザー設定を検出できます。WCAG 2.3.3 ではアニメーション無効化の手段提供を推奨しています。",
    sources: [
      { tag: "MDN", section: "@media (prefers-reduced-motion)" },
      { tag: "WCAG 2.2", section: "2.3.3 アニメーション（操作による）" },
    ],
  },
  {
    keywords: ["フォーカス", "focus", "outline"],
    answer: "WCAG 2.2 達成基準 2.4.7「フォーカスの可視」では、キーボード操作可能な要素にフォーカスインジケーターが視覚的に提示されることを要求しています。outline:none で消すのは原則 NG で、:focus-visible で代替スタイルを当てる方法が推奨されます。",
    sources: [
      { tag: "WCAG 2.2", section: "2.4.7 フォーカスの可視" },
      { tag: "WCAG 2.2", section: "2.4.11 フォーカスの外観" },
      { tag: "MDN", section: ":focus-visible" },
    ],
  },
];

function findSample(question: string): SimSample {
  const q = question.toLowerCase();
  return SIM_SAMPLES.find(s => s.keywords.some(k => q.includes(k.toLowerCase()))) ?? SIM_SAMPLES[0];
}

// ── コード逆引き定義 ──
const CODE_REFS = [
  {
    fn: "searchSimilar()", file: "lib/rag.ts", color: "var(--spec)",
    desc: "質問をEmbeddingし、Upstash Vectorで類似検索。topK=6のチャンクを返す。",
    code: `async function searchSimilar(question: string, topK = 6) {
  const embedding = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: question,
  });
  const results = await index.query({
    vector: embedding.data[0].embedding,
    topK,
    includeMetadata: true,
  });
  return results;
}`,
  },
  {
    fn: "generateAnswer()", file: "lib/llm.ts", color: "var(--a11y)",
    desc: "コンテキスト + 質問 + ロールを組み合わせてLLMで回答生成。",
    code: `async function generateAnswer(
  question: string,
  context: string,
  role: "designer" | "engineer",
  model: ModelId
) {
  const systemPrompt = ROLE_PROMPTS[role];
  const response = await openai.chat.completions.create({
    model: modelMap[model],
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: \`コンテキスト:\\n\${context}\\n\\n質問: \${question}\` },
    ],
  });
  return response.choices[0].message.content;
}`,
  },
  {
    fn: "POST /api/query", file: "api/query/route.ts", color: "var(--aria)",
    desc: "RAGパイプライン統合エンドポイント。検索 → プロンプト組立 → LLM生成を一連実行。",
    code: `export async function POST(req: Request) {
  const { question, role, model } = await req.json();

  // 1. ベクトル検索
  const chunks = await searchSimilar(question);

  // 2. コンテキスト組み立て
  const context = chunks
    .map(c => c.metadata?.text)
    .join("\\n\\n");

  // 3. LLM 生成
  const answer = await generateAnswer(question, context, role, model);

  // 4. ソース情報を付与して返却
  return Response.json({ answer, sources: chunks.map(formatSource) });
}`,
  },
  {
    fn: "POST /api/ingest", file: "api/ingest/route.ts", color: "var(--custom)",
    desc: "カスタムドキュメントの取り込み。PDF/TXT/MD → テキスト抽出 → チャンク → Embedding → 保存。",
    code: `export async function POST(req: Request) {
  const formData = await req.formData();
  const file = formData.get("file") as File;

  // テキスト抽出
  const text = await extractText(file);

  // チャンク分割 → ベクトル化 → Upstash保存
  const chunks = splitIntoChunks(text, 500, 50);
  for (const chunk of chunks) {
    await embedAndStore(chunk, { source: "CUSTOM", title: file.name });
  }

  return Response.json({ ok: true, chunks: chunks.length });
}`,
  },
];

// ── 用語辞典 ──
const GLOSSARY = [
  { term: "RAG", color: "var(--spec)", desc: "Retrieval-Augmented Generation。「検索して補強してから生成する」手法。LLMの知識に外部文書を動的に追加できる。ハルシネーションを抑制できる。" },
  { term: "Embedding（埋め込み）", color: "var(--a11y)", desc: "テキストを多次元ベクトル（数値の配列）に変換すること。意味が近い文ほど近いベクトルになる。RAGでは取り込み時と検索時の両方で使う。" },
  { term: "Upstash Vector", color: "var(--aria)", desc: "サーバーレスで動くベクトルデータベース。REST API経由でアクセスでき、Vercel等のサーバーレス環境と相性が良い。SpecBridgeのベクトル検索基盤。" },
  { term: "チャンク（Chunk）", color: "var(--custom)", desc: "長い文書を小さく切り出した断片。500文字程度が一般的。小さすぎると文脈が失われ、大きすぎるとLLMのトークン制限に引っかかる。" },
  { term: "コサイン類似度", color: "var(--spec)", desc: "2つのベクトルの向きの近さを -1〜1 のスコアで表す指標。RAGの検索では質問ベクトルとチャンクベクトルのコサイン類似度でランキングする。" },
  { term: "text-embedding-3-small", color: "var(--a11y)", desc: "OpenAIの埋め込みモデル。1536次元のベクトルを生成。コスト効率が高く、日本語にも対応。SpecBridgeで使用中。" },
  { term: "Retriever", color: "var(--aria)", desc: "質問を受け取り、関連チャンクを返す仕組み。SpecBridgeではUpstash Vectorのquery APIがこの役割を担う。topK=6で上位6件を取得。" },
  { term: "ハルシネーション", color: "var(--custom)", desc: "LLMが事実でない情報を自信満々に生成してしまう現象。RAGはコンテキストに根拠を与えることでこれを抑制するが、完全には防げない。" },
  { term: "ロール別プロンプト", color: "var(--designer)", desc: "SpecBridge独自の機能。Designer/Engineerの2ロールでシステムプロンプトを切替え、同じ仕様でもデザイン視点/実装視点の回答を生成する。" },
];

// ── ハイライト済みコード表示 ──
function HighlightedCode({ code }: { code: string }) {
  const html = useMemo(() => {
    const trimmed = code.trim();
    // JSON 判定
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      return hljs.highlight(trimmed, { language: "json" }).value;
    }
    return hljs.highlight(trimmed, { language: "typescript" }).value;
  }, [code]);
  return <pre className={styles.codePre} dangerouslySetInnerHTML={{ __html: html }} />;
}

// ── コンポーネント ──
function StepCard({ step }: { step: FlowStep }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`${styles.stepCard} ${open ? styles.stepCardOpen : ""}`} style={{ "--step-color": step.color } as React.CSSProperties} onClick={() => setOpen(!open)}>
      <div className={styles.stepHeader}>
        <div className={styles.stepNum}>{step.num}</div>
        <div className={styles.stepMeta}>
          <div className={styles.stepTitle}>{step.title}</div>
          <div className={styles.stepDesc}>{step.desc}</div>
        </div>
        <div className={`${styles.stepArrow} ${open ? styles.stepArrowOpen : ""}`}>▶</div>
      </div>
      {open && (
        <div className={styles.stepBody}>
          <p>{step.body}</p>
          {step.code && (
            <div className={styles.codeBlock}>
              <div className={styles.codeLabel}><span>{step.code.label}</span><span className={styles.codeDot} /></div>
              <HighlightedCode code={step.code.content} />
            </div>
          )}
          {step.dataFlow && (
            <div className={styles.dataFlow}>
              {step.dataFlow.map(d => (
                <div key={d.label} className={styles.flowRow}>
                  <div className={styles.flowLabel}><span className={styles.flowDot} />{d.label}</div>
                  <div className={styles.flowVal}>{d.value}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SimPanel() {
  const [question, setQuestion] = useState("ボタンのコントラスト比はいくつ必要？");
  const [running, setRunning] = useState(false);
  const [stepStates, setStepStates] = useState<Record<string, "idle" | "running" | "done">>({});
  const [stepLabels, setStepLabels] = useState<Record<string, string>>({});
  // 質問内容にマッチした回答と出典をセットで保持。OUTPUT表示と SOURCES表示で同じ sample を参照する
  const [output, setOutput] = useState<SimSample | null>(null);

  const runSim = async () => {
    if (!question.trim()) return;
    setRunning(true);
    setOutput(null);
    const newStates: Record<string, "idle" | "running" | "done"> = {};
    const newLabels: Record<string, string> = {};
    SIM_STEPS.forEach(s => { newStates[s.id] = "idle"; newLabels[s.id] = "待機中"; });
    setStepStates({ ...newStates });
    setStepLabels({ ...newLabels });

    for (const step of SIM_STEPS) {
      newStates[step.id] = "running";
      newLabels[step.id] = step.runLabel;
      setStepStates({ ...newStates });
      setStepLabels({ ...newLabels });
      await new Promise(r => setTimeout(r, step.delay));
      newStates[step.id] = "done";
      newLabels[step.id] = "✓ " + step.doneLabel;
      setStepStates({ ...newStates });
      setStepLabels({ ...newLabels });
    }

    setOutput(findSample(question));
    setRunning(false);
  };

  return (
    <div>
      <p className={styles.sectionNote}>質問を入力してシミュレートすると、RAGの各ステップがどの順序・どのくらいの時間で動くか体感できます。</p>
      <div className={styles.simContainer}>
        <div className={styles.simHeader}>
          <span className={styles.simDot} />
          <span>RAG PIPELINE SIMULATOR</span>
        </div>
        <div className={styles.simBody}>
          <div className={styles.simInput}>
            <input
              type="text"
              placeholder="質問を入力（例: ボタンのコントラスト比は？）"
              value={question}
              onChange={e => setQuestion(e.target.value)}
              disabled={running}
            />
            <button className={styles.simBtn} onClick={runSim} disabled={running || !question.trim()}>▶ 実行</button>
          </div>
          <div className={styles.pipeline}>
            {SIM_STEPS.map((step, i) => (
              <div key={step.id}>
                {i > 0 && <div className={styles.pipeArrow}>│</div>}
                <div className={`${styles.pipeStep} ${stepStates[step.id] === "running" ? styles.pipeRunning : ""} ${stepStates[step.id] === "done" ? styles.pipeDone : ""}`}>
                  <div className={styles.pipeIcon}>{step.icon}</div>
                  <div className={styles.pipeName}>{step.label}</div>
                  <div className={styles.pipeStatus}>{stepLabels[step.id] ?? "待機中"}</div>
                </div>
              </div>
            ))}
          </div>
          {output && (
            <div className={styles.simOutput}>
              <div className={styles.simOutputLabel}>// OUTPUT</div>
              <div className={styles.simOutputAnswer}>{output.answer}</div>
              <div className={styles.simOutputSources}>
                <div className={styles.simSourceLabel}>// SOURCES ({output.sources.length}件)</div>
                {output.sources.map((s, i) => (
                  <div key={i} className={styles.simSource}>
                    <span className={styles.srcFile}>{s.tag}</span>
                    <span>{s.section}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── メインページ ──
export default function LearnPage() {
  const [tab, setTab] = useState<TabId>("flow");

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <Link href="/" className={styles.backLink}>
          ← SpecBridge に戻る
        </Link>
        <div className={styles.badge}>RAG — Retrieval-Augmented Generation</div>
        <h1 className={styles.title}>SpecBridge のしくみ</h1>
        <p className={styles.subtitle}>Upstash Vector + OpenAI Embeddings + GPT / GeminiのRAGパイプライン解説</p>
      </header>

      {/* タブ */}
      <div className={styles.tabs}>
        {TABS.map(t => (
          <button key={t.id} className={`${styles.tab} ${tab === t.id ? styles.tabActive : ""}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* TAB 1: フロー解説 */}
      {tab === "flow" && (
        <div>
          <div className={styles.phaseGrid}>
            <div className={styles.phaseCard}>
              <div className={styles.phaseLabel} style={{ color: "var(--spec)" }}>PHASE 1 — INGEST</div>
              <div className={styles.phaseDesc}>ドキュメントを事前にベクトル化してDBに蓄積する。<code>POST /api/ingest</code> が担当。</div>
            </div>
            <div className={styles.phaseCard}>
              <div className={styles.phaseLabel} style={{ color: "var(--aria)" }}>PHASE 2 — QUERY</div>
              <div className={styles.phaseDesc}>質問を受けて関連チャンクを検索し、LLMで回答生成する。<code>POST /api/query</code> が担当。</div>
            </div>
          </div>

          <div className={styles.sectionTitle}>// PHASE 1: ドキュメント取り込み</div>
          <div className={styles.flow}>
            {INGEST_STEPS.map(s => <StepCard key={s.num} step={s} />)}
          </div>

          <div className={styles.sectionTitle} style={{ marginTop: 28 }}>// PHASE 2: 質問応答</div>
          <div className={styles.flow}>
            {QUERY_STEPS.map(s => <StepCard key={s.num} step={s} />)}
          </div>
        </div>
      )}

      {/* TAB 2: シミュレーション */}
      {tab === "sim" && <SimPanel />}

      {/* TAB 3: コード逆引き */}
      {tab === "code" && (
        <div className={styles.codeRefList}>
          <div className={styles.sectionTitle}>// SpecBridge 関数別の役割</div>
          {CODE_REFS.map(ref => (
            <div key={ref.fn} className={styles.codeRefCard}>
              <div className={styles.codeRefHeader}>
                <span className={styles.codeRefFn} style={{ color: ref.color }}>{ref.fn}</span>
                <span className={styles.codeRefFile}>{ref.file}</span>
              </div>
              <div className={styles.codeRefBody}>
                <p className={styles.codeRefDesc}>{ref.desc}</p>
                <div className={styles.codeBlock}>
                  <HighlightedCode code={ref.code} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB 4: 用語辞典 */}
      {tab === "glossary" && (
        <div>
          <div className={styles.sectionTitle}>// 用語辞典</div>
          <div className={styles.glossaryGrid}>
            {GLOSSARY.map(g => (
              <div key={g.term} className={styles.termCard}>
                <div className={styles.termName} style={{ color: g.color }}>{g.term}</div>
                <div className={styles.termDesc}>{g.desc}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
