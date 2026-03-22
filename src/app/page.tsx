"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import styles from "./page.module.css";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// ── 型定義 ────────────────────────────────────────────
type ModelId    = "gpt-5.4-nano" | "gpt-5.4-mini" | "gemini-2.5-flash";
type UserRole   = "designer" | "engineer";
type SourceTag  = "MDN" | "WCAG" | "WAI-ARIA" | "CUSTOM";

type Source = {
  id: string;
  score: number;
  source: SourceTag;
  title: string;
  section: string;
  url: string;
  snippet: string;
};

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  model?: ModelId;
  userRole?: UserRole;
  sources?: Source[];
  tokens?: { input?: number; output?: number };
  error?: boolean;
};

// ── 定数 ─────────────────────────────────────────────
const MODELS: { id: ModelId; label: string; provider: "openai" | "google" }[] = [
  { id: "gpt-5.4-mini",     label: "GPT-5.4 mini",    provider: "openai"  },
  { id: "gpt-5.4-nano",     label: "GPT-5.4 nano",    provider: "openai"  },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", provider: "google" },
];

const SUGGEST: Record<UserRole, string[]> = {
  designer: [
    "disabled と readonly の使い分けを教えて",
    "モーダルはESCで閉じる必要がある？",
    "フォーカスリングのデザイン要件は？",
    "エラーメッセージはどこに置くべき？",
    "アイコンのみのボタンに必要なことは？",
    "コントラスト比 4.5:1 はどのケースに必要？",
  ],
  engineer: [
    "aria-label と aria-labelledby の違いは？",
    "dialog ロールに必要な ARIA 属性は？",
    "tabindex=0 と tabindex=-1 の使い分けは？",
    "スクリーンリーダーへの aria-live の影響は？",
    "input[type=date] のブラウザ対応状況は？",
    ":focus-visible と :focus の使い分けは？",
  ],
};

const SOURCE_META: Record<SourceTag, { label: string; color: string; bg: string }> = {
  MDN:       { label: "MDN",       color: "var(--spec)",   bg: "var(--spec-bg)"   },
  WCAG:      { label: "WCAG 2.2",  color: "var(--a11y)",   bg: "var(--a11y-bg)"   },
  "WAI-ARIA":{ label: "WAI-ARIA",  color: "var(--aria)",   bg: "var(--aria-bg)"   },
  CUSTOM:    { label: "カスタム",  color: "var(--custom)", bg: "var(--custom-bg)" },
};

// ── コンポーネント ────────────────────────────────────
export default function Page() {
  const [role,       setRole]       = useState<UserRole>("designer");
  const [model,      setModel]      = useState<ModelId>("gpt-5.4-mini");
  const [messages,   setMessages]   = useState<Message[]>([]);
  const [input,      setInput]      = useState("");
  const [loading,    setLoading]    = useState(false);
  const [uploading,  setUploading]  = useState(false);
  const [vectorCount,setVectorCount]= useState<number | null>(null);
  const [dragOver,   setDragOver]   = useState(false);
  const [customDocs, setCustomDocs] = useState<string[]>([]);
  const fileRef   = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // ステータス取得
  useEffect(() => {
    fetch("/api/status")
      .then(r => r.json())
      .then(d => setVectorCount(d.vectorCount ?? 0))
      .catch(() => {});
  }, []);

  // ── 質問送信 ──────────────────────────────────────
  async function handleSubmit(q?: string) {
    const question = (q ?? input).trim();
    if (!question || loading) return;
    setMessages(prev => [...prev, { id: Date.now().toString(), role: "user", content: question, userRole: role }]);
    setInput("");
    setLoading(true);
    try {
      const res  = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, model, role, k: 6 }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.answer,
        model: data.model,
        userRole: role,
        sources: data.sources,
        tokens: data.tokens,
      }]);
    } catch (e: unknown) {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: `エラー: ${e instanceof Error ? e.message : String(e)}`,
        error: true,
      }]);
    } finally {
      setLoading(false);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  }

  // ── ファイル取り込み ──────────────────────────────
  const ingestFile = useCallback(async (file: File) => {
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res  = await fetch("/api/ingest", { method: "POST", body: fd });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setCustomDocs(prev => [...prev, data.title]);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: "assistant",
        content: `✓ "${data.title}" を取り込みました（${data.chunks} チャンク）`,
      }]);
    } catch (e: unknown) {
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: "assistant",
        content: `✗ ${e instanceof Error ? e.message : String(e)}`,
        error: true,
      }]);
    } finally {
      setUploading(false);
    }
  }, []);

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) ingestFile(file);
  }

  return (
    <div className={styles.layout}>

      {/* ── サイドバー ── */}
      <aside className={styles.sidebar}>

        {/* ロゴ */}
        <div className={styles.brand}>
          <div className={styles.brandMark}>SB</div>
          <div>
            <div className={styles.brandName}>SpecBridge</div>
            <div className={styles.brandSub}>Design × Spec Q&A</div>
          </div>
        </div>

        {/* ロール選択 */}
        <div className={styles.sideSection}>
          <div className={styles.sideLabel}>あなたの役割</div>
          <div className={styles.roleSwitch}>
            <button
              className={`${styles.roleBtn} ${role === "designer" ? styles.roleBtnActive : ""}`}
              data-role="designer"
              onClick={() => setRole("designer")}
            >
              <span className={styles.roleIcon}>✏</span>
              Designer
            </button>
            <button
              className={`${styles.roleBtn} ${role === "engineer" ? styles.roleBtnActive : ""}`}
              data-role="engineer"
              onClick={() => setRole("engineer")}
            >
              <span className={styles.roleIcon}>⌨</span>
              Engineer
            </button>
          </div>
          <div className={styles.roleDesc}>
            {role === "designer"
              ? "デザイン判断に特化した回答を生成します"
              : "実装詳細・コード例を含む回答を生成します"
            }
          </div>
        </div>

        {/* モデル選択 */}
        <div className={styles.sideSection}>
          <div className={styles.sideLabel}>モデル</div>
          <div className={styles.modelList}>
            {MODELS.map(m => (
              <button
                key={m.id}
                className={`${styles.modelBtn} ${model === m.id ? styles.modelActive : ""}`}
                onClick={() => setModel(m.id)}
              >
                <span className={`${styles.providerPip} ${styles[m.provider]}`} />
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* ドキュメントソース */}
        <div className={styles.sideSection}>
          <div className={styles.sideLabel}>ナレッジソース</div>
          <div className={styles.sourceList}>
            {(["MDN", "WCAG", "WAI-ARIA"] as SourceTag[]).map(s => (
              <div key={s} className={styles.sourceRow} style={{ "--c": SOURCE_META[s].color } as React.CSSProperties}>
                <span className={styles.sourcePip} />
                <span>{SOURCE_META[s].label}</span>
                <span className={styles.sourceSeedBadge}>事前埋込済</span>
              </div>
            ))}
            {customDocs.map(d => (
              <div key={d} className={styles.sourceRow} style={{ "--c": SOURCE_META.CUSTOM.color } as React.CSSProperties}>
                <span className={styles.sourcePip} />
                <span className={styles.sourceCustomLabel}>{d}</span>
              </div>
            ))}
          </div>
        </div>

        {/* カスタム追加 */}
        <div className={styles.sideSection}>
          <div className={styles.sideLabel}>独自ガイドを追加</div>
          <div
            className={`${styles.dropZone} ${dragOver ? styles.dropActive : ""}`}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
          >
            {uploading
              ? <><span className={styles.spin} /> 取り込み中...</>
              : <><span>PDF / TXT / MD</span><span className={styles.dropHint}>ドロップ or クリック</span></>
            }
          </div>
          <input
            ref={fileRef} type="file" accept=".pdf,.txt,.md"
            style={{ display: "none" }}
            onChange={e => { const f = e.target.files?.[0]; if (f) ingestFile(f); }}
          />
        </div>

        {/* ベクトル数 */}
        <div className={styles.sideFooter}>
          {vectorCount !== null && (
            <div className={styles.vectorCount}>
              <span className={styles.vectorDot} />
              {vectorCount.toLocaleString()} vectors
            </div>
          )}
        </div>
      </aside>

      {/* ── メイン ── */}
      <main className={styles.main}>

        {/* ── メッセージエリア ── */}
        <div className={styles.messages}>
          {messages.length === 0 ? (
            <div className={styles.welcome}>
              <div className={styles.welcomeTitle}>
                仕様を根拠に、判断できる
              </div>
              <div className={styles.welcomeDesc}>
                WCAG 2.2 / WAI-ARIA / MDN の仕様を検索して、<br />
                デザインとエンジニアリングの判断を支援します
              </div>
              <div className={styles.suggests}>
                <div className={styles.suggestLabel}>
                  {role === "designer" ? "Designerの質問例" : "Engineerの質問例"}
                </div>
                <div className={styles.suggestGrid}>
                  {SUGGEST[role].map(q => (
                    <button key={q} className={styles.suggestBtn} onClick={() => handleSubmit(q)}>
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            messages.map(msg => (
              <MessageBubble key={msg.id} msg={msg} />
            ))
          )}
          {loading && <ThinkingBubble model={model} />}
          <div ref={bottomRef} />
        </div>

        {/* ── 入力エリア ── */}
        <div className={styles.inputWrap}>
          <div className={styles.inputRow}>
            <div className={`${styles.rolePill} ${styles[role]}`}>
              {role === "designer" ? "✏ Designer" : "⌨ Engineer"}
            </div>
            <textarea
              className={styles.textarea}
              placeholder={role === "designer"
                ? "デザインの判断・仕様の根拠を質問..."
                : "実装・ARIAの使い方を質問..."
              }
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
              }}
              rows={2}
            />
            <button className={styles.sendBtn} onClick={() => handleSubmit()} disabled={loading || !input.trim()}>
              →
            </button>
          </div>
          <div className={styles.inputHint}>Enter で送信 · Shift+Enter で改行 · 出典は仕様書へリンク</div>
        </div>
      </main>
    </div>
  );
}

// ── サブコンポーネント ────────────────────────────────
function MessageBubble({ msg }: { msg: Message }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`${styles.msg} ${styles[msg.role]} ${msg.error ? styles.msgErr : ""}`}>
      {msg.role === "user" ? (
        <div className={styles.userBubble}>
          <div className={`${styles.userTag} ${msg.userRole ? styles[msg.userRole] : ""}`}>
            {msg.userRole === "engineer" ? "ENG" : "DSN"}
          </div>
          <div className={styles.userText}>{msg.content}</div>
        </div>
      ) : (
        <div className={styles.aiBubble}>
          <div className={styles.aiHeader}>
            <span className={styles.aiModel}>{msg.model ?? "SYS"}</span>
            {msg.tokens && (
              <span className={styles.aiTokens}>
                {msg.tokens.input}↑ {msg.tokens.output}↓ tokens
              </span>
            )}
          </div>
          <div className={styles.aiText}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
          </div>
          {msg.sources && msg.sources.length > 0 && (
            <div className={styles.sourcesWrap}>
              <button className={styles.sourcesToggle} onClick={() => setOpen(o => !o)}>
                <span>参照仕様 {msg.sources.length}件</span>
                <span className={styles.chevron}>{open ? "▲" : "▼"}</span>
              </button>
              {open && (
                <div className={styles.sourceCards}>
                  {msg.sources.map(s => (
                    <SourceCard key={s.id} source={s} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SourceCard({ source }: { source: { source: SourceTag; title: string; section: string; url: string; snippet: string; score: number } }) {
  const meta = SOURCE_META[source.source];
  return (
    <div className={styles.sourceCard}>
      <div className={styles.sourceCardHead}>
        <span className={styles.sourceTag} style={{ background: meta.bg, color: meta.color }}>
          {meta.label}
        </span>
        <span className={styles.sourceSection}>{source.section}</span>
        <span className={styles.sourceScore}>{(source.score * 100).toFixed(0)}%</span>
      </div>
      <div className={styles.sourceSnippet}>{source.snippet}</div>
      {source.url && (
        <a href={source.url} target="_blank" rel="noreferrer" className={styles.sourceLink}>
          仕様を読む →
        </a>
      )}
    </div>
  );
}

function ThinkingBubble({ model }: { model: string }) {
  return (
    <div className={`${styles.msg} ${styles.assistant}`}>
      <div className={styles.aiBubble}>
        <div className={styles.aiHeader}>
          <span className={styles.aiModel}>{model}</span>
        </div>
        <div className={styles.thinking}>
          <span /><span /><span />
        </div>
      </div>
    </div>
  );
}
