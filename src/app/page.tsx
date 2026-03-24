"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import styles from "./page.module.css";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { SUGGEST_GROUPS, SUGGEST_THEMES, RECOMMEND } from "../lib/suggests";

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

// ── SVG アイコン ──────────────────────────────────────
const sz = (n: number) => ({ width: n, height: n, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const });

const ICO = {
  newChat:  <svg {...sz(14)}><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z"/></svg>,
  send:     <svg {...sz(16)}><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9"/></svg>,
  trash:    <svg {...sz(12)}><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>,
  fileIn:   <svg {...sz(12)}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><polyline points="9 15 12 18 15 15"/></svg>,
  fileOut:  <svg {...sz(12)}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="12" x2="12" y2="18"/><polyline points="9 15 12 12 15 15"/></svg>,
  sun:      <svg {...sz(14)}><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>,
  moon:     <svg {...sz(14)}><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>,
  search:   <svg {...sz(14)}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  back:     <svg {...sz(12)}><polyline points="15 18 9 12 15 6"/></svg>,
  copy:     <svg {...sz(13)}><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>,
  check:    <svg {...sz(13)}><polyline points="20 6 9 17 4 12"/></svg>,
  download: <svg {...sz(13)}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  help:     <svg {...sz(12)}><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
};

// ── 定数 ─────────────────────────────────────────────
type ModelTier = "free" | "byok"; // byok = bring your own key
const MODELS: { id: ModelId; label: string; provider: "openai" | "google"; tier: ModelTier }[] = [
  { id: "gpt-5.4-nano",     label: "GPT-5.4 nano",    provider: "openai", tier: "free" },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", provider: "google", tier: "free" },
  { id: "gpt-5.4-mini",     label: "GPT-5.4 mini",    provider: "openai", tier: "byok" },
];


const SOURCE_META: Record<SourceTag, { label: string; color: string; bg: string }> = {
  MDN:       { label: "MDN",       color: "var(--spec)",   bg: "var(--spec-bg)"   },
  WCAG:      { label: "WCAG 2.2",  color: "var(--a11y)",   bg: "var(--a11y-bg)"   },
  "WAI-ARIA":{ label: "WAI-ARIA",  color: "var(--aria)",   bg: "var(--aria-bg)"   },
  CUSTOM:    { label: "カスタム",  color: "var(--custom)", bg: "var(--custom-bg)" },
};

// ── チャット履歴管理 ─────────────────────────────────
type ChatSession = {
  id: string;
  title: string;
  messages: Message[];
  role: UserRole;
  createdAt: string;
};

const STORAGE_KEY = "specbridge-sessions";
const PREFS_KEY = "specbridge-prefs";

function loadSessions(): ChatSession[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch { return []; }
}

function saveSessions(sessions: ChatSession[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}

function loadPrefs(): { role: UserRole; model: ModelId } {
  if (typeof window === "undefined") return { role: "designer", model: "gpt-5.4-nano" };
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}");
    return {
      role: (["designer", "engineer"] as UserRole[]).includes(p.role) ? p.role : "designer",
      model: MODELS.some(m => m.id === p.model) ? p.model : "gemini-2.5-flash",
    };
  } catch { return { role: "designer", model: "gpt-5.4-nano" }; }
}

function savePrefs(role: UserRole, model: ModelId) {
  localStorage.setItem(PREFS_KEY, JSON.stringify({ role, model }));
}

// ── テキスト変換ヘルパー ──────────────────────────────
function mdToPlain(md: string): string {
  return md
    .replace(/^#{1,6}\s+/gm, "")         // 見出し
    .replace(/\*\*(.+?)\*\*/g, "$1")      // 太字
    .replace(/\*(.+?)\*/g, "$1")          // 斜体
    .replace(/`{3}[\s\S]*?`{3}/g, m =>    // コードブロック
      m.replace(/^`{3}\w*\n?/, "").replace(/`{3}$/, ""))
    .replace(/`(.+?)`/g, "$1")            // インラインコード
    .replace(/\[(.+?)\]\(.+?\)/g, "$1")   // リンク
    .replace(/^[-*+]\s+/gm, "- ")         // リスト
    .replace(/^\d+\.\s+/gm, m => m)       // 番号リスト
    .replace(/^>\s+/gm, "")               // 引用
    .replace(/---/g, "")                   // 水平線
    .replace(/\n{3,}/g, "\n\n")           // 余分な空行
    .trim();
}

function downloadText(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── エクスポート / インポート ─────────────────────────
function exportToFile(data: object, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function buildExportPayload(sessions: ChatSession[]) {
  return { app: "specbridge", version: 1, exportedAt: new Date().toISOString(), sessions };
}

function validateImport(data: unknown): ChatSession[] | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (d.app !== "specbridge" || !Array.isArray(d.sessions)) return null;
  // 各セッションの最低限の構造チェック
  for (const s of d.sessions) {
    if (!s.id || !Array.isArray(s.messages)) return null;
  }
  return d.sessions as ChatSession[];
}

// ── コンポーネント ────────────────────────────────────
export default function Page() {
  const [role,       setRole]       = useState<UserRole>("designer");
  const [model,      setModel]      = useState<ModelId>("gpt-5.4-nano");
  const [messages,   setMessages]   = useState<Message[]>([]);
  const [input,      setInput]      = useState("");
  const [loading,    setLoading]    = useState(false);
  const [uploading,  setUploading]  = useState(false);
  const [vectorCount,setVectorCount]= useState<number | null>(null);
  const [dragOver,   setDragOver]   = useState(false);
  const [customDocs, setCustomDocs] = useState<string[]>([]);
  const [hasOpenAI,  setHasOpenAI]  = useState(false);
  const [userApiKey, setUserApiKey] = useState("");
  const [sessions,   setSessions]   = useState<ChatSession[]>([]);
  const [currentId,  setCurrentId]  = useState<string | null>(null);
  const [theme,      setTheme]      = useState<"light" | "dark">("light");
  const [suggestQ,     setSuggestQ]     = useState("");
  const [suggestCat,   setSuggestCat]   = useState<string | null>(null);
  const [suggestTheme, setSuggestTheme] = useState<string | null>(null);
  const [showHelp,     setShowHelp]     = useState(false);
  const fileRef     = useRef<HTMLInputElement>(null);
  const importRef   = useRef<HTMLInputElement>(null);
  const bottomRef   = useRef<HTMLDivElement>(null);

  // 設定・セッション読み込み
  useEffect(() => {
    setSessions(loadSessions());
    const prefs = loadPrefs();
    setRole(prefs.role);
    setModel(prefs.model);
    // ユーザー API キー読み込み
    setUserApiKey(localStorage.getItem("specbridge-user-apikey") ?? "");
    // テーマ初期化
    const saved = localStorage.getItem("specbridge-theme");
    if (saved === "light" || saved === "dark") {
      setTheme(saved);
    } else {
      setTheme(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    }
  }, []);

  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("specbridge-theme", next);
  }

  // 設定変更時に保存
  useEffect(() => { savePrefs(role, model); }, [role, model]);

  // メッセージ変更時に自動保存
  useEffect(() => {
    if (messages.length === 0) return;
    setSessions(prev => {
      const id = currentId ?? Date.now().toString();
      if (!currentId) setCurrentId(id);
      const firstUserMsg = messages.find(m => m.role === "user");
      const title = firstUserMsg?.content.slice(0, 40) ?? "新しい会話";
      const updated = prev.filter(s => s.id !== id);
      updated.unshift({ id, title, messages, role, createdAt: new Date().toISOString() });
      const capped = updated.slice(0, 30);
      saveSessions(capped);
      return capped;
    });
  }, [messages, currentId, role]);

  // ステータス取得
  useEffect(() => {
    fetch("/api/status")
      .then(r => r.json())
      .then(d => {
        setVectorCount(d.vectorCount ?? 0);
        setHasOpenAI(!!d.hasOpenAI);
      })
      .catch(() => {});
  }, []);

  // ── 質問送信 ──────────────────────────────────────
  async function handleSubmit(q?: string) {
    const question = (q ?? input).trim();
    if (!question || loading) return;
    const newMsg: Message = { id: Date.now().toString(), role: "user", content: question, userRole: role };
    const updatedMessages = [...messages, newMsg];
    setMessages(updatedMessages);
    setInput("");
    setLoading(true);
    // 直近の会話履歴（最大10件）をAPIに送信
    const history = updatedMessages
      .filter(m => !m.error)
      .slice(-10)
      .map(m => ({ role: m.role, content: m.content }));
    try {
      const res  = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, model, role, k: 6, history, ...(model === "gpt-5.4-mini" && userApiKey ? { userApiKey } : {}) }),
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
          {messages.length > 0 && (
            <button
              className={styles.newChatBtn}
              onClick={() => { setCurrentId(null); setMessages([]); }}
              title="新しい会話を開始"
              aria-label="新しい会話を開始"
            >
              {ICO.newChat}
            </button>
          )}
        </div>

        {/* ロール選択 */}
        <div className={styles.sideSection}>
          <div className={styles.sideLabel}>あなたの役割 <HelpTip text="Designer: デザイン判断に特化した回答。Engineer: 実装コード例を含む回答。回答のトーンが変わります。" /></div>
          <div className={styles.roleSwitch}>
            <button
              className={`${styles.roleBtn} ${role === "designer" ? styles.roleBtnActive : ""}`}
              data-role="designer"
              onClick={() => setRole("designer")}
              title="デザイン判断に特化した回答を生成"
            >
              <svg {...sz(13)}><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z"/></svg>
              Designer
            </button>
            <button
              className={`${styles.roleBtn} ${role === "engineer" ? styles.roleBtnActive : ""}`}
              data-role="engineer"
              onClick={() => setRole("engineer")}
              title="実装詳細・コード例を含む回答を生成"
            >
              <svg {...sz(13)}><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
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
            {MODELS.map(m => {
              const isByok = m.tier === "byok";
              const disabled = isByok && !userApiKey;
              return (
                <button
                  key={m.id}
                  className={`${styles.modelBtn} ${model === m.id ? styles.modelActive : ""} ${disabled ? styles.modelDisabled : ""}`}
                  onClick={() => !disabled && setModel(m.id)}
                  disabled={disabled}
                  title={disabled ? "API キーを入力すると使えます" : `${m.label} を使用`}
                >
                  <span className={`${styles.providerPip} ${styles[m.provider]}`} />
                  {m.label}
                  {m.tier === "free" && <span className={styles.freeBadge}>Free</span>}
                  {isByok && <span className={styles.byokBadge}>API Key</span>}
                </button>
              );
            })}
          </div>
          <div className={styles.apiKeySection}>
            <div className={styles.apiKeyLabel}>OpenAI API Key（任意）</div>
            <input
              className={styles.apiKeyInput}
              type="password"
              placeholder="sk-..."
              value={userApiKey}
              onChange={e => {
                const v = e.target.value;
                setUserApiKey(v);
                localStorage.setItem("specbridge-user-apikey", v);
                if (!v && model === "gpt-5.4-mini") setModel("gpt-5.4-nano");
              }}
            />
            <div className={styles.apiKeyHint}>入力すると GPT-5.4 mini が有効になります</div>
          </div>
        </div>

        {/* ドキュメントソース */}
        <div className={styles.sideSection}>
          <div className={styles.sideLabel}>ナレッジソース <HelpTip text="回答の根拠となる仕様データベースです。MDN / WCAG / WAI-ARIA の仕様が事前に埋め込まれています。" /></div>
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
          <div className={styles.sideLabel}>独自ガイドを追加 <HelpTip text="自社のデザインガイドやコーディング規約（PDF / TXT / MD）をアップロードすると、回答の根拠に加わります。" /></div>
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

        {/* 履歴 */}
        <div className={styles.sideSection}>
          <div className={styles.historyHeader}>
            <div className={styles.sideLabel}>履歴</div>
            <div className={styles.historyActions}>
              <button
                className={styles.historyActionBtn}
                onClick={() => importRef.current?.click()}
                title="JSONファイルから履歴をインポート"
                aria-label="履歴をインポート"
              >
                {ICO.fileIn}
              </button>
              {sessions.length > 0 && (
                <button
                  className={styles.historyActionBtn}
                  onClick={() => exportToFile(buildExportPayload(sessions), `specbridge-${new Date().toISOString().slice(0, 10)}.json`)}
                  title="全履歴をJSONでエクスポート"
                  aria-label="全履歴をエクスポート"
                >
                  {ICO.fileOut}
                </button>
              )}
            </div>
          </div>
          <input
            ref={importRef}
            type="file"
            accept=".json"
            style={{ display: "none" }}
            onChange={e => {
              const f = e.target.files?.[0];
              if (!f) return;
              const reader = new FileReader();
              reader.onload = () => {
                try {
                  const parsed = JSON.parse(reader.result as string);
                  const imported = validateImport(parsed);
                  if (!imported) {
                    alert("無効なファイル形式です。SpecBridge のエクスポートファイルを選択してください。");
                    return;
                  }
                  setSessions(prev => {
                    const ids = new Set(prev.map(s => s.id));
                    const merged = [...prev];
                    let added = 0;
                    for (const s of imported) {
                      if (!ids.has(s.id)) {
                        merged.push(s);
                        added++;
                      }
                    }
                    merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                    const capped = merged.slice(0, 100);
                    saveSessions(capped);
                    alert(`${imported.length} 件中 ${added} 件の新規セッションをインポートしました。`);
                    return capped;
                  });
                } catch {
                  alert("JSONの読み込みに失敗しました。");
                }
                e.target.value = "";
              };
              reader.readAsText(f);
            }}
          />
          {sessions.length > 0 ? (
            <div className={styles.historyList}>
              {sessions.map(s => (
                <div
                  key={s.id}
                  className={`${styles.historyItem} ${s.id === currentId ? styles.historyActive : ""}`}
                  onClick={() => {
                    setCurrentId(s.id);
                    setMessages(s.messages);
                    setRole(s.role);
                  }}
                >
                  <span className={styles.historyTitle}>{s.title}</span>
                  <button
                    className={styles.historyExport}
                    onClick={(e) => {
                      e.stopPropagation();
                      exportToFile(buildExportPayload([s]), `specbridge-${s.title.slice(0, 20)}.json`);
                    }}
                    title="この会話をエクスポート"
                    aria-label="この会話をエクスポート"
                  >
                    {ICO.fileOut}
                  </button>
                  <button
                    className={styles.historyDelete}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSessions(prev => {
                        const next = prev.filter(x => x.id !== s.id);
                        saveSessions(next);
                        return next;
                      });
                      if (s.id === currentId) {
                        setCurrentId(null);
                        setMessages([]);
                      }
                    }}
                    title="この会話を削除"
                    aria-label="この会話を削除"
                  >
                    {ICO.trash}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.historyEmpty}>履歴はまだありません</div>
          )}
        </div>

        {/* フッター */}
        <div className={styles.sideFooter}>
          {vectorCount !== null && (
            <div className={styles.vectorCount}>
              <span className={styles.vectorDot} />
              {vectorCount.toLocaleString()} vectors
            </div>
          )}
          <button
            className={styles.themeToggle}
            onClick={toggleTheme}
            title={theme === "light" ? "ダークモードに切替" : "ライトモードに切替"}
            aria-label={theme === "light" ? "ダークモードに切替" : "ライトモードに切替"}
          >
            {theme === "light" ? ICO.moon : ICO.sun}
            <span>{theme === "light" ? "Dark" : "Light"}</span>
          </button>
          <button
            className={styles.themeToggle}
            onClick={() => setShowHelp(true)}
            title="使い方ヘルプ"
            aria-label="使い方ヘルプ"
          >
            {ICO.help}
          </button>
        </div>
      </aside>

      {/* ── ヘルプモーダル ── */}
      {showHelp && (
        <div className={styles.helpOverlay} onClick={() => setShowHelp(false)}>
          <div className={styles.helpModal} onClick={e => e.stopPropagation()}>
            <div className={styles.helpHeader}>
              <h2>SpecBridge の使い方</h2>
              <button className={styles.helpClose} onClick={() => setShowHelp(false)} aria-label="閉じる">&times;</button>
            </div>
            <div className={styles.helpBody}>
              <section>
                <h3>SpecBridge とは？</h3>
                <p>WCAG 2.2 / WAI-ARIA / MDN の仕様を根拠に、デザインや実装の判断を支援する RAG チャットボットです。質問すると、関連する仕様を検索し、根拠付きで回答します。</p>
              </section>
              <section>
                <h3>基本の使い方</h3>
                <ol>
                  <li><strong>役割を選ぶ</strong> — Designer（デザイン判断中心）or Engineer（実装コード例中心）</li>
                  <li><strong>質問する</strong> — カテゴリから選ぶか、自由に入力（⌘+Enter で送信）</li>
                  <li><strong>参照仕様を確認</strong> — 回答下部の「参照仕様」で根拠を確認</li>
                  <li><strong>追加質問</strong> — 同じ会話で深掘り可能。別の話題は「新しい話題」をクリック</li>
                </ol>
              </section>
              <section>
                <h3>独自ガイドの追加</h3>
                <p>自社のデザインガイドやコーディング規約（PDF / TXT / MD）をドロップすると、回答の根拠に加わります。アップロードしたデータはベクトルDBに格納され、以降の質問で検索対象になります。</p>
              </section>
              <section>
                <h3>モデルについて</h3>
                <ul>
                  <li><strong>GPT-5.4 nano</strong>（デフォルト・無料） — 高速で軽量</li>
                  <li><strong>Gemini 2.5 Flash</strong>（無料） — Google の高速モデル</li>
                  <li><strong>GPT-5.4 mini</strong>（API Key 必要） — より高精度。ご自身の OpenAI API キーを入力すると有効化</li>
                </ul>
              </section>
              <section>
                <h3>履歴の管理</h3>
                <p>会話は自動保存されます。JSON形式でエクスポート/インポートも可能です。</p>
              </section>
            </div>
          </div>
        </div>
      )}

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

              {/* 検索 */}
              <div className={styles.suggestSearch}>
                <span className={styles.suggestSearchIcon}>{ICO.search}</span>
                <input
                  className={styles.suggestSearchInput}
                  placeholder="質問やキーワードで検索..."
                  value={suggestQ}
                  onChange={e => { setSuggestQ(e.target.value); setSuggestCat(null); setSuggestTheme(null); }}
                />
                {suggestQ && (
                  <button className={styles.suggestSearchClear} onClick={() => setSuggestQ("")}>
                    {ICO.trash}
                  </button>
                )}
              </div>

              {/* コンテンツ切替 */}
              {suggestQ ? (
                // ── 検索結果 ──
                (() => {
                  const q = suggestQ.toLowerCase();
                  const results = SUGGEST_GROUPS.flatMap(g =>
                    g.items.filter(item => item.toLowerCase().includes(q)).map(item => ({ cat: g.label, item }))
                  );
                  return results.length > 0 ? (
                    <div className={styles.suggestResults}>
                      <div className={styles.suggestResultCount}>{results.length} 件の質問が見つかりました</div>
                      <div className={styles.suggestGrid}>
                        {results.map(r => (
                          <button key={r.item} className={styles.suggestBtn} onClick={() => { handleSubmit(r.item); setSuggestQ(""); }}>
                            <span className={styles.suggestBtnCat}>{r.cat}</span>
                            {r.item}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className={styles.suggestEmpty}>該当する質問がありません。自由に質問を入力してください。</div>
                  );
                })()
              ) : suggestCat ? (
                // ── カテゴリ内の質問一覧 ──
                (() => {
                  const group = SUGGEST_GROUPS.find(g => g.id === suggestCat);
                  if (!group) return null;
                  return (
                    <div className={styles.suggestResults}>
                      <button className={styles.suggestCatBack} onClick={() => { setSuggestCat(null); }}>
                        {ICO.back} {suggestTheme ? SUGGEST_THEMES.find(t => t.id === suggestTheme)?.label ?? "戻る" : "戻る"}
                      </button>
                      <div className={styles.suggestResultCount}>{group.label} — {group.items.length} 件</div>
                      <div className={styles.suggestGrid}>
                        {group.items.map(item => (
                          <button key={item} className={styles.suggestBtn} onClick={() => handleSubmit(item)}>
                            {item}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })()
              ) : suggestTheme ? (
                // ── テーマ内のカテゴリ一覧 ──
                (() => {
                  const theme = SUGGEST_THEMES.find(t => t.id === suggestTheme);
                  if (!theme) return null;
                  const groups = SUGGEST_GROUPS.filter(g => theme.categories.includes(g.id));
                  return (
                    <div className={styles.suggestResults}>
                      <button className={styles.suggestCatBack} onClick={() => setSuggestTheme(null)}>
                        {ICO.back} トップに戻る
                      </button>
                      <div className={styles.suggestCatGrid}>
                        {groups.map(g => (
                          <button key={g.id} className={styles.suggestCatCard} onClick={() => setSuggestCat(g.id)}>
                            <div className={styles.suggestCatCardName}>{g.label}</div>
                            <div className={styles.suggestCatCardPreview}>
                              {g.items.slice(0, 2).map(item => (
                                <div key={item} className={styles.suggestCatCardItem}>{item}</div>
                              ))}
                            </div>
                            <div className={styles.suggestCatCardMore}>他 {g.items.length - 2} 件</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })()
              ) : (
                // ── ホーム: おすすめ + テーマ ──
                <>
                  <div className={styles.suggestSection}>
                    <div className={styles.suggestSectionLabel}>おすすめの質問</div>
                    <div className={styles.suggestGrid}>
                      {RECOMMEND.map(q => (
                        <button key={q} className={styles.suggestBtn} onClick={() => handleSubmit(q)}>
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className={styles.suggestSection}>
                    <div className={styles.suggestSectionLabel}>カテゴリから探す</div>
                    <div className={styles.suggestThemeGrid}>
                      {SUGGEST_THEMES.map(t => {
                        const count = SUGGEST_GROUPS.filter(g => t.categories.includes(g.id)).reduce((a, g) => a + g.items.length, 0);
                        return (
                          <button key={t.id} className={styles.suggestThemeCard} onClick={() => setSuggestTheme(t.id)}>
                            <div className={styles.suggestThemeLabel}>{t.label}</div>
                            <div className={styles.suggestThemeCount}>{count} 件</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
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
            <div className={`${styles.rolePill} ${styles[role]}`} title={role === "designer" ? "デザイナーモードで質問中" : "エンジニアモードで質問中"}>
              {role === "designer" ? (
                <><svg {...sz(12)}><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z"/></svg> Designer</>
              ) : (
                <><svg {...sz(12)}><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg> Engineer</>
              )}
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
                if (e.key === "Enter" && !e.nativeEvent.isComposing && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault(); handleSubmit();
                }
              }}
              rows={2}
            />
            <button className={styles.sendBtn} onClick={() => handleSubmit()} disabled={loading || !input.trim()} title="送信 (⌘+Enter)" aria-label="送信">
              {ICO.send}
            </button>
          </div>
          <div className={styles.inputHintRow}>
            <div className={styles.inputHint}>⌘+Enter で送信 · Enter で改行 · 出典は仕様書へリンク</div>
            {messages.length > 0 && (
              <button
                className={styles.newTopicBtn}
                onClick={() => { setCurrentId(null); setMessages([]); }}
                title="現在の会話を終了して新しい話題を開始"
              >
                {ICO.newChat}
                <span>新しい話題</span>
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

// ── ヘルプツールチップ ────────────────────────────────
function HelpTip({ text }: { text: string }) {
  return (
    <span className={styles.helpTip} aria-label={text}>
      {ICO.help}
      <span className={styles.helpTipText}>{text}</span>
    </span>
  );
}

// ── サブコンポーネント ────────────────────────────────
function MessageBubble({ msg }: { msg: Message }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState<"copy" | "dl" | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function close(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(null);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  function handleCopy(asMd: boolean) {
    const text = asMd ? msg.content : mdToPlain(msg.content);
    navigator.clipboard.writeText(text);
    setCopied(true);
    setMenuOpen(null);
    setTimeout(() => setCopied(false), 1500);
  }

  function handleDownload(asMd: boolean) {
    const text = asMd ? msg.content : mdToPlain(msg.content);
    const ext = asMd ? "md" : "txt";
    const title = msg.content.slice(0, 30).replace(/[^\w\u3000-\u9fff]/g, "_");
    downloadText(text, `specbridge-${title}.${ext}`);
    setMenuOpen(null);
  }

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
            {!msg.error && (
              <div className={styles.aiActions} ref={menuRef}>
                {/* コピー */}
                <div className={styles.aiActionWrap}>
                  <button
                    className={`${styles.aiActionBtn} ${copied ? styles.aiActionDone : ""}`}
                    onClick={() => setMenuOpen(menuOpen === "copy" ? null : "copy")}
                    title="コピー"
                    aria-label="コピー"
                  >
                    {copied ? ICO.check : ICO.copy}
                  </button>
                  {menuOpen === "copy" && (
                    <div className={styles.aiActionMenu}>
                      <button onClick={() => handleCopy(false)}>テキスト</button>
                      <button onClick={() => handleCopy(true)}>Markdown</button>
                    </div>
                  )}
                </div>
                {/* ダウンロード */}
                <div className={styles.aiActionWrap}>
                  <button
                    className={styles.aiActionBtn}
                    onClick={() => setMenuOpen(menuOpen === "dl" ? null : "dl")}
                    title="ダウンロード"
                    aria-label="ダウンロード"
                  >
                    {ICO.download}
                  </button>
                  {menuOpen === "dl" && (
                    <div className={styles.aiActionMenu}>
                      <button onClick={() => handleDownload(false)}>テキスト (.txt)</button>
                      <button onClick={() => handleDownload(true)}>Markdown (.md)</button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className={styles.aiText}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
          </div>
          {msg.sources && msg.sources.length > 0 && (
            <div className={styles.sourcesWrap}>
              <button className={styles.sourcesToggle} onClick={() => setOpen(o => !o)} title={open ? "参照仕様を閉じる" : "参照仕様を展開"}>
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
