"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import styles from "./page.module.css";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import Link from "next/link";
import { SUGGEST_GROUPS, SUGGEST_THEMES, RECOMMEND } from "../lib/suggests";
import { ICO, sz } from "../lib/icons";
import { mdToPlain, downloadText, exportToFile, buildExportPayload, validateImport, headerSafe, MAX_SESSIONS } from "../lib/helpers";
import { type WCAGResult } from "../lib/a11yUtils";
import {
  buildPreviewSrcDoc,
  judgeContrast,
  PREVIEW_THEMES,
  PREVIEW_VIEWPORTS,
  THEME_STYLES,
  VIEWPORT_STYLES,
  type PreviewTheme,
  type PreviewViewport,
} from "../lib/htmlPreview";
import { buildAriaSnapshot, formatAriaSnapshot } from "../lib/ariaSnapshot";
import { extractTabOrder, formatTabOrder } from "../lib/tabOrder";
import { validateAriaAttrs } from "../lib/ariaValidate";
import { validateWcagRefs } from "../lib/wcagValidate";
import { validateKeyboardCompleteness } from "../lib/keyboardValidate";
import { validateCssProps } from "../lib/cssValidate";
import { EXPORT_META } from "../lib/aiExport";
import { parseVerdict, VERDICT_LABEL } from "../lib/verdict";
import type { ModelId, UserRole, AnswerMode, SourceTag, Source, Message, ChatSession } from "../lib/types";

// ── 定数 ─────────────────────────────────────────────
type ModelTier = "free" | "byok"; // byok = bring your own key
const MODELS: { id: ModelId; label: string; provider: "openai" | "google"; tier: ModelTier }[] = [
  // gpt-5.4系（nano / mini）は提供終了し gpt-5.6-luna に統合された。
  // byok 枠は Gemini Pro が担う（Pro は Gemini の無料枠対象外のため自前キーが要る）
  { id: "gpt-5.6-luna",     label: "GPT-5.6 Luna",    provider: "openai", tier: "free" },
  { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash", provider: "google", tier: "free" },
  { id: "gemini-2.5-pro",   label: "Gemini 2.5 Pro",  provider: "google", tier: "byok" },
];


const SOURCE_META: Record<SourceTag, { label: string; color: string; bg: string }> = {
  MDN:       { label: "MDN",       color: "var(--spec)",   bg: "var(--spec-bg)"   },
  WCAG:      { label: "WCAG 2.2",  color: "var(--a11y)",   bg: "var(--a11y-bg)"   },
  "WAI-ARIA":{ label: "WAI-ARIA",  color: "var(--aria)",   bg: "var(--aria-bg)"   },
  CUSTOM:    { label: "カスタム",  color: "var(--custom)", bg: "var(--custom-bg)" },
  CURATED:   { label: "内部精査",   color: "var(--curated)", bg: "var(--curated-bg)" },
};

// ── チャット履歴管理 ─────────────────────────────────
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

function loadPrefs(): { role: UserRole; model: ModelId; mode: AnswerMode } {
  if (typeof window === "undefined") return { role: "designer", model: "gpt-5.6-luna", mode: "concise" };
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}");
    return {
      role: (["designer", "engineer"] as UserRole[]).includes(p.role) ? p.role : "designer",
      model: MODELS.some(m => m.id === p.model) ? p.model : "gpt-5.6-luna",
      mode: p.mode === "detailed" ? "detailed" : "concise",
    };
  } catch { return { role: "designer", model: "gpt-5.6-luna", mode: "concise" }; }
}

function savePrefs(role: UserRole, model: ModelId, mode: AnswerMode) {
  localStorage.setItem(PREFS_KEY, JSON.stringify({ role, model, mode }));
}

// ── コンポーネント ────────────────────────────────────
export default function Page() {
  const [role,       setRole]       = useState<UserRole>("designer");
  const [model,      setModel]      = useState<ModelId>("gpt-5.6-luna");
  const [answerMode, setAnswerMode] = useState<AnswerMode>("concise");
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
  const [sidebarOpen,  setSidebarOpen]  = useState(false); // モバイル: サイドバードロワー
  const [isMobile,     setIsMobile]     = useState(false); // 768px 以下判定（入力欄の高さ制御に使用）
  const [inviteCode,   setInviteCode]   = useState("");
  const [inviteValid,  setInviteValid]  = useState<boolean | null>(null);
  const [quota,        setQuota]        = useState<{ remaining: number; limit: number } | null>(null);
  const [inputHeight, setInputHeight]  = useState(() => {
    if (typeof window === "undefined") return 60;
    const v = parseInt(localStorage.getItem("specbridge-input-height") ?? "", 10);
    return v >= 40 && v <= 400 ? v : 60;
  });
  const fileRef     = useRef<HTMLInputElement>(null);
  const importRef   = useRef<HTMLInputElement>(null);
  const bottomRef   = useRef<HTMLDivElement>(null);
  const dragRef     = useRef<{ startY: number; startH: number } | null>(null);

  // 設定・セッション読み込み
  useEffect(() => {
    setSessions(loadSessions());
    const prefs = loadPrefs();
    setRole(prefs.role);
    setModel(prefs.model);
    setAnswerMode(prefs.mode);
    // ユーザー API キー読み込み
    setUserApiKey(localStorage.getItem("specbridge-user-apikey") ?? "");
    // 招待コード読み込み
    const savedInvite = localStorage.getItem("specbridge-invite-code") ?? "";
    if (savedInvite) {
      setInviteCode(savedInvite);
      setInviteValid(true);
    }
    // テーマ初期化
    const saved = localStorage.getItem("specbridge-theme");
    if (saved === "light" || saved === "dark") {
      setTheme(saved);
    } else {
      setTheme(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    }
  }, []);

  // 残り回数を取得
  const fetchQuota = useCallback(async (code?: string) => {
    if (userApiKey) { setQuota(null); return; }
    try {
      const safeCode = code ? headerSafe(code) : "";
      const res = await fetch("/api/quota", {
        headers: safeCode ? { "x-invite-code": safeCode } : {},
      });
      const data = await res.json();
      setQuota(data);
    } catch { /* ignore */ }
  }, [userApiKey]);

  useEffect(() => { fetchQuota(inviteCode || undefined); }, [fetchQuota, inviteCode]);

  // モバイル判定（リサイズにも追従）
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // 初期画面（ウェルカム）に戻る
  const goHome = useCallback(() => {
    setCurrentId(null);
    setMessages([]);
    setSidebarOpen(false);
    setSuggestQ("");
    setSuggestCat(null);
    setSuggestTheme(null);
  }, []);

  // モバイル: ドロワー展開中は Esc で閉じ、背面スクロールをロック
  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSidebarOpen(false); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [sidebarOpen]);

  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("specbridge-theme", next);
  }

  // リサイズハンドル：ドラッグで入力エリアの高さを変更
  const handleResizeStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    dragRef.current = { startY: clientY, startH: inputHeight };
    const onMove = (ev: MouseEvent | TouchEvent) => {
      if (!dragRef.current) return;
      const y = "touches" in ev ? ev.touches[0].clientY : ev.clientY;
      const delta = dragRef.current.startY - y;           // 上にドラッグ→高さ増加
      setInputHeight(Math.max(40, Math.min(400, dragRef.current.startH + delta)));
    };
    const onUp = (ev: MouseEvent | TouchEvent) => {
      if (dragRef.current) {
        const y = "changedTouches" in ev ? ev.changedTouches[0].clientY : ev.clientY;
        const h = Math.max(40, Math.min(400, dragRef.current.startH + (dragRef.current.startY - y)));
        localStorage.setItem("specbridge-input-height", String(h));
      }
      dragRef.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.addEventListener("touchmove", onMove);
    document.addEventListener("touchend", onUp);
  }, [inputHeight]);

  // 設定変更時に保存
  useEffect(() => { savePrefs(role, model, answerMode); }, [role, model, answerMode]);

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
      const capped = updated.slice(0, MAX_SESSIONS);
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
  async function handleSubmit(q?: string, forceMode?: AnswerMode) {
    const question = (q ?? input).trim();
    const mode = forceMode ?? answerMode;
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
      // ヘッダー値は ASCII のみ許容（全角・改行・空白混入で Safari の fetch が
      // "The string did not match the expected pattern" を投げるのを防ぐ）
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const safeKey = headerSafe(userApiKey);
      const safeInvite = headerSafe(inviteCode);
      if (safeKey) headers["X-User-Api-Key"] = safeKey;
      if (safeInvite) headers["x-invite-code"] = safeInvite;

      const res  = await fetch("/api/query", {
        method: "POST",
        headers,
        body: JSON.stringify({ question, model, role, mode, k: 6, history }),
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
        grounded: data.grounded,
      }]);
    } catch (e: unknown) {
      let msg = e instanceof Error ? e.message : String(e);
      // ブラウザ由来の分かりにくいエラーを行動できる日本語に翻訳
      if (/did not match the expected pattern/i.test(msg)) {
        msg = "リクエストの組み立てに失敗しました。APIキーまたは招待コードに全角文字・空白・改行が含まれていないか確認してください。";
      } else if (/failed to fetch|load failed|network/i.test(msg)) {
        msg = "ネットワークに接続できませんでした。通信環境を確認して再試行してください。";
      }
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: `エラー: ${msg}`,
        error: true,
      }]);
    } finally {
      setLoading(false);
      fetchQuota(inviteCode || undefined);
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

      {/* ── モバイル: サイドバー背面のバックドロップ ── */}
      {sidebarOpen && <div className={styles.backdrop} onClick={() => setSidebarOpen(false)} aria-hidden="true" />}

      {/* ── サイドバー（モバイルではドロワー） ── */}
      <aside className={styles.sidebar} data-open={sidebarOpen}>

        {/* ロゴ（クリックで初期画面に戻る） */}
        <div className={styles.brand}>
          <button className={styles.brandBtn} onClick={goHome} title="最初の画面に戻る" aria-label="最初の画面に戻る">
          <div className={styles.brandMark}>
            <svg width="20" height="20" viewBox="0 0 32 32" fill="none">
              <line x1="11" y1="7" x2="11" y2="24" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <line x1="21" y1="7" x2="21" y2="24" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <path d="M4 12 Q7.5 18 11 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
              <path d="M11 7 Q16 16 21 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
              <path d="M21 7 Q24.5 18 28 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
              <line x1="3" y1="21" x2="29" y2="21" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
              <line x1="8" y1="14" x2="8" y2="21" stroke="currentColor" strokeWidth="0.8" opacity="0.5"/>
              <line x1="14" y1="13" x2="14" y2="21" stroke="currentColor" strokeWidth="0.8" opacity="0.5"/>
              <line x1="18" y1="13" x2="18" y2="21" stroke="currentColor" strokeWidth="0.8" opacity="0.5"/>
              <line x1="24" y1="14" x2="24" y2="21" stroke="currentColor" strokeWidth="0.8" opacity="0.5"/>
            </svg>
          </div>
          <div>
            <div className={styles.brandName}>SpecBridge</div>
            <div className={styles.brandSub}>Design × Spec Q&A</div>
          </div>
          </button>
          {messages.length > 0 && (
            <button
              className={styles.newChatBtn}
              onClick={goHome}
              title="新しい会話を開始"
              aria-label="新しい会話を開始"
            >
              {ICO.newChat}
            </button>
          )}
          {/* モバイル: ドロワーを閉じる */}
          <button
            className={styles.sidebarClose}
            onClick={() => setSidebarOpen(false)}
            aria-label="メニューを閉じる"
          >
            {ICO.close}
          </button>
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
            <div className={styles.apiKeyLabel}>API Key（任意・OpenAI / Gemini）</div>
            <input
              className={styles.apiKeyInput}
              type="password"
              placeholder="sk-..."
              value={userApiKey}
              onChange={e => {
                const v = e.target.value;
                setUserApiKey(v);
                localStorage.setItem("specbridge-user-apikey", v);
              }}
            />
            <div className={styles.apiKeyHint}>入力するとレート制限なしで利用でき、Gemini 2.5 Pro も選べます。キーはブラウザに保存されます。共用端末ではご注意ください。</div>
          </div>

          {/* 招待コード */}
          <div className={styles.inviteSection}>
            <div className={styles.apiKeyLabel}>招待コード（任意）</div>
            <div className={styles.inviteRow}>
              <input
                className={styles.apiKeyInput}
                type="text"
                placeholder="招待コードを入力..."
                value={inviteCode}
                onChange={e => setInviteCode(e.target.value)}
              />
              <button
                className={styles.inviteBtn}
                disabled={!inviteCode.trim()}
                onClick={async () => {
                  const code = inviteCode.trim();
                  try {
                    const res = await fetch("/api/verify-invite", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ code }),
                    });
                    const { valid } = await res.json();
                    setInviteValid(valid);
                    if (valid) {
                      localStorage.setItem("specbridge-invite-code", code);
                      fetchQuota(code);
                    } else {
                      localStorage.removeItem("specbridge-invite-code");
                    }
                  } catch { setInviteValid(false); }
                }}
              >
                確認
              </button>
            </div>
            {inviteValid === true && <div className={styles.inviteOk}>認証済み — 利用上限が拡張されています</div>}
            {inviteValid === false && <div className={styles.inviteNg}>無効なコードです</div>}
            <div className={styles.apiKeyHint}>招待コードがなくても利用できます（1日{quota?.limit ?? "..."}回まで）。自分のAPIキーを入力すると無制限です。</div>
          </div>
        </div>

        {/* ドキュメントソース */}
        <div className={styles.sideSection}>
          <div className={styles.sideLabel}>ナレッジソース <HelpTip text="回答の根拠となる仕様データベースです。MDN（Mozilla）/ WCAG 2.2（W3C）/ WAI-ARIA（W3C）の公式仕様、および 内部精査（SpecBridge 内部で精査した UX レビュー用パターン 28件、第三者ガイド由来ではありません）が事前に埋め込まれています。" /></div>
          <div className={styles.sourceList}>
            {(["MDN", "WCAG", "WAI-ARIA", "CURATED"] as SourceTag[]).map(s => (
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

        {/* ワークフロー連携エクスポート */}
        <div className={styles.sideSection}>
          <div className={styles.sideLabel}>ワークフロー連携 <HelpTip text="この会話を、普段の業務にそのまま流し込める形で出力します。ビジネス根拠資料はステークホルダー説明・要件定義に、受け入れ基準はチケットの Done 定義に貼れます。Claude Code の Skill / サブエージェントとして置けば、アクセシビリティを意識しなくても AI コーディング時に自動でレビューが効きます。" /></div>
          {messages.length > 0 ? (
            <div className={styles.exportList}>
              {EXPORT_META.map(ex => (
                <button
                  key={ex.kind}
                  className={styles.exportBtn}
                  title={ex.desc}
                  onClick={() => {
                    const session: ChatSession = {
                      id: currentId ?? "current",
                      title: messages.find(m => m.role === "user")?.content.slice(0, 40) ?? "会話",
                      messages,
                      role,
                      createdAt: new Date().toISOString(),
                    };
                    downloadText(ex.build(session), ex.filename);
                  }}
                >
                  {ICO.download}
                  <span>{ex.label}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className={styles.exportEmpty}>会話すると、ビジネス根拠資料・受け入れ基準・Claude Code Skill などをここから生成できます</div>
          )}
        </div>

        {/* 履歴 */}
        <div className={styles.sideSection}>
          <div className={styles.historyHeader}>
            <div className={styles.sideLabel}>履歴</div>
            <div className={styles.historyActions}>
              {sessions.length > 0 && (
                <button
                  className={styles.historyActionBtn}
                  onClick={() => exportToFile(buildExportPayload(sessions), `specbridge-${new Date().toISOString().slice(0, 10)}.json`)}
                  title="全履歴をJSONで保存"
                  aria-label="全履歴を保存"
                >
                  {ICO.download}
                  <span>保存</span>
                </button>
              )}
              <button
                className={styles.historyActionBtn}
                onClick={() => importRef.current?.click()}
                title="JSONファイルから履歴を読込"
                aria-label="履歴を読込"
              >
                {ICO.upload}
                <span>読込</span>
              </button>
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
                  // localStorage から最新のセッションを直接取得（stale state 回避）
                  const current = loadSessions();
                  const ids = new Set(current.map(s => s.id));
                  const merged = [...current];
                  let added = 0;
                  for (const s of imported) {
                    if (!ids.has(s.id)) { merged.push(s); added++; }
                  }
                  merged.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                  const capped = merged.slice(0, MAX_SESSIONS);
                  saveSessions(capped);
                  setSessions(capped);
                  alert(`${imported.length} 件中 ${added} 件の新規セッションをインポートしました。`);
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
                    setSidebarOpen(false); // モバイル: 選択したらドロワーを閉じる
                  }}
                >
                  <span className={styles.historyTitle}>{s.title}</span>
                  <button
                    className={styles.historyExport}
                    onClick={(e) => {
                      e.stopPropagation();
                      exportToFile(buildExportPayload([s]), `specbridge-${s.title.slice(0, 20)}.json`);
                    }}
                    title="この会話を保存"
                    aria-label="この会話を保存"
                  >
                    {ICO.download}
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
          <Link
            href="/learn"
            className={styles.themeToggle}
            title="RAGのしくみを学ぶ"
            aria-label="RAGのしくみを学ぶ"
          >
            {ICO.learn}
          </Link>
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
                  <li><strong>GPT-5.6 Luna</strong>（デフォルト・無料） — 高速で軽量</li>
                  <li><strong>Gemini 3.8 Flash</strong>（無料） — Google の高速モデル</li>
                  <li><strong>Gemini 2.5 Pro</strong>（API Key 必要） — より高精度。ご自身の Gemini API キーを入力すると有効化</li>
                </ul>
              </section>
              <section>
                <h3>履歴の管理</h3>
                <p>会話は自動保存されます。JSON形式でエクスポート/インポートも可能です。</p>
              </section>
              <section>
                <h3>RAG のしくみを学ぶ</h3>
                <p>SpecBridge がどのように仕様を検索し回答を生成しているか、フロー解説・シミュレーション・コード逆引きで学べます。</p>
                <p><Link href="/learn" className={styles.helpLearnLink} onClick={() => setShowHelp(false)}>学習ページを開く →</Link></p>
              </section>
            </div>
          </div>
        </div>
      )}

      {/* ── メイン ── */}
      <main className={styles.main}>

        {/* ── モバイル: 上部バー（ハンバーガー + ブランド） ── */}
        <div className={styles.mobileBar}>
          <button
            className={styles.hamburger}
            onClick={() => setSidebarOpen(true)}
            aria-label="メニューを開く"
          >
            {ICO.menu}
          </button>
          <button className={styles.mobileBrand} onClick={goHome} title="最初の画面に戻る" aria-label="最初の画面に戻る">
            SpecBridge
          </button>
          {messages.length > 0 && (
            <button
              className={styles.mobileNewChat}
              onClick={goHome}
              aria-label="新しい会話を開始"
            >
              {ICO.newChat}
            </button>
          )}
        </div>

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
                  const themeName = suggestTheme ? SUGGEST_THEMES.find(t => t.id === suggestTheme)?.label : null;
                  return (
                    <div className={styles.suggestResults}>
                      <div className={styles.breadcrumb}>
                        <button onClick={() => { setSuggestCat(null); setSuggestTheme(null); }}>トップ</button>
                        {themeName && <><span className={styles.breadcrumbSep}>/</span><button onClick={() => setSuggestCat(null)}>{themeName}</button></>}
                        <span className={styles.breadcrumbSep}>/</span>
                        <span className={styles.breadcrumbCurrent}>{group.label}</span>
                      </div>
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
                      <div className={styles.breadcrumb}>
                        <button onClick={() => setSuggestTheme(null)}>トップ</button>
                        <span className={styles.breadcrumbSep}>/</span>
                        <span className={styles.breadcrumbCurrent}>{theme.label}</span>
                      </div>
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

                  <div className={styles.learnBanner}>
                    <div className={styles.learnBannerText}>
                      <div className={styles.learnBannerTitle}>{ICO.learn} RAG のしくみを学ぶ</div>
                      <div className={styles.learnBannerDesc}>SpecBridge がどう動いているか、パイプラインをステップごとに解説</div>
                    </div>
                    <Link href="/learn" className={styles.learnBannerLink}>
                      解説を見る {ICO.arrowRight}
                    </Link>
                  </div>
                </>
              )}
            </div>
          ) : (
            messages.map((msg, i) => (
              <MessageBubble
                key={msg.id}
                msg={msg}
                onExpand={
                  // 最後の AI 回答にだけ深掘りボタンを出す（クイック回答の続きを読む導線）
                  !loading && !msg.error && msg.role === "assistant" && i === messages.length - 1 && msg.sources
                    ? () => handleSubmit(
                        role === "designer"
                          ? "直前の回答を、根拠仕様の引用と Good/Bad の視覚例、数値つきのデザイン仕様で詳しく展開してください"
                          : "直前の回答を、根拠仕様の引用・Good/Bad の視覚例・実装コード込みで詳しく展開してください",
                        "detailed")
                    : undefined
                }
              />
            ))
          )}
          {loading && <ThinkingBubble model={model} />}
          <div ref={bottomRef} />
        </div>

        {/* ── 入力エリア ── */}
        <div className={styles.inputWrap}>
          {/* リサイズハンドル */}
          <div
            className={styles.resizeHandle}
            onMouseDown={handleResizeStart}
            onTouchStart={handleResizeStart}
            title="ドラッグで入力欄の高さを変更"
          >
            <div className={styles.resizeBar} />
          </div>
          <div className={styles.inputRow}>
            <div className={`${styles.rolePill} ${styles[role]}`} title={role === "designer" ? "デザイナーモードで質問中" : "エンジニアモードで質問中"}>
              {role === "designer" ? (
                <><svg {...sz(12)}><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z"/></svg> Designer</>
              ) : (
                <><svg {...sz(12)}><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg> Engineer</>
              )}
            </div>
            <div className={styles.modeSwitch} role="group" aria-label="回答の詳しさ">
              <button
                type="button"
                className={styles.modeBtn}
                data-active={answerMode === "concise"}
                aria-pressed={answerMode === "concise"}
                onClick={() => setAnswerMode("concise")}
                title="結論ファーストの短い回答（8行以内）。足りなければ回答下の「詳しく展開」で深掘り"
              >
                ⚡ クイック
              </button>
              <button
                type="button"
                className={styles.modeBtn}
                data-active={answerMode === "detailed"}
                aria-pressed={answerMode === "detailed"}
                onClick={() => setAnswerMode("detailed")}
                title="Good/Bad 視覚例・仕様引用込みの深掘り回答"
              >
                📖 じっくり
              </button>
            </div>
            <textarea
              className={styles.textarea}
              style={isMobile ? undefined : { height: `${inputHeight}px` }}
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
            />
            <button className={styles.sendBtn} onClick={() => handleSubmit()} disabled={loading || !input.trim()} title="送信 (⌘+Enter)" aria-label="送信">
              {ICO.send}
            </button>
          </div>
          <div className={styles.inputHintRow}>
            <div className={styles.inputHint}>
              <span className={styles.kbdHint}>⌘+Enter で送信 · Enter で改行 · 出典は仕様書へリンク</span>
              {!userApiKey && quota && (
                <span className={`${styles.quotaBadge} ${quota.remaining <= 3 ? styles.quotaLow : ""}`}>
                  本日あと {quota.remaining}/{quota.limit} 回
                </span>
              )}
            </div>
            {messages.length > 0 && (
              <button
                className={styles.newTopicBtn}
                onClick={goHome}
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

// ── HTMLライブプレビュー（デザイナー向け視覚例） ──────────
// rehype-highlight が挿入する <span> ツリーから生のテキストを取り出す
function extractText(node: unknown): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (node && typeof node === "object" && "props" in node) {
    const p = (node as { props: { children?: unknown } }).props;
    return extractText(p.children);
  }
  return "";
}

function HtmlPreview({ code }: { code: string }) {
  // デザイナーが視覚情報をすぐ見られるよう初期表示はON。ボタンで折り畳み可能
  const [show, setShow] = useState(true);
  const [theme, setTheme] = useState<PreviewTheme>("light");
  const [viewport, setViewport] = useState<PreviewViewport>("desktop");
  const [showAria, setShowAria] = useState(false);
  const [showTabOrder, setShowTabOrder] = useState(false);
  const [interactive, setInteractive] = useState(false);
  const wcag = judgeContrast(code);
  // 既定は sandbox="" + scripts 無効。interactive=true 時のみ allow-scripts に切替（CSP で外部 fetch を封じる）
  const srcDoc = buildPreviewSrcDoc(code, theme, { allowScripts: interactive });
  const sandboxAttr = interactive ? "allow-scripts" : "";
  // ARIA snapshot / Tab 順は表示時のみ計算（DOMParser 呼び出しコスト回避）
  const ariaText = showAria ? formatAriaSnapshot(buildAriaSnapshot(code)) : "";
  const tabOrderText = showTabOrder ? formatTabOrder(extractTabOrder(code)) : "";
  return (
    <div className={styles.htmlPreview}>
      {show && interactive && (
        <div className={styles.interactiveWarn} role="note">
          ⚠ インタラクティブ実行中: コードを確認したうえで有効化してください。外部 fetch・接続は CSP で封じています
        </div>
      )}
      {show && (
        <div className={styles.previewWrap} data-viewport={viewport}>
          <iframe
            key={interactive ? "interactive" : "static"}
            className={styles.previewFrame}
            sandbox={sandboxAttr}
            srcDoc={srcDoc}
            title={`HTMLプレビュー（${THEME_STYLES[theme].titleSuffix}・${VIEWPORT_STYLES[viewport].label}${interactive ? "・インタラクティブ" : ""}）`}
          />
        </div>
      )}
      {show && showAria && (
        <pre className={styles.ariaSnapshot} aria-label="ARIA snapshot（スクリーンリーダー読み上げ簡易再現）">
          {ariaText || "（読み上げ対象の要素が検出されませんでした）"}
        </pre>
      )}
      {show && showTabOrder && (
        <pre className={styles.ariaSnapshot} aria-label="Tab フォーカス順（簡易再現）">
          {tabOrderText || "（Tab で到達可能な要素が検出されませんでした）"}
        </pre>
      )}
      <div className={styles.previewBar}>
        <button
          type="button"
          className={styles.previewBtn}
          onClick={() => setShow(s => !s)}
          aria-expanded={show}
        >
          {show ? "プレビューを閉じる" : "プレビューを表示"}
        </button>
        <PreviewThemeSwitch value={theme} onChange={setTheme} />
        <PreviewViewportSwitch value={viewport} onChange={setViewport} />
        <button
          type="button"
          className={styles.previewBtn}
          onClick={() => setShowAria(s => !s)}
          aria-pressed={showAria}
          title="スクリーンリーダー読み上げの簡易再現（role + accessible name）を表示"
        >
          {showAria ? "ARIA を閉じる" : "ARIA を表示"}
        </button>
        <button
          type="button"
          className={styles.previewBtn}
          onClick={() => setShowTabOrder(s => !s)}
          aria-pressed={showTabOrder}
          title="Tab で順に到達する要素を簡易再現で表示"
        >
          {showTabOrder ? "Tab 順を閉じる" : "Tab 順を表示"}
        </button>
        <button
          type="button"
          className={styles.previewBtn}
          data-interactive={interactive}
          onClick={() => setInteractive(s => !s)}
          aria-pressed={interactive}
          title="sandbox=allow-scripts でインラインスクリプトを実行（CSP で外部 connect は封じる）"
        >
          {interactive ? "実行を停止" : "インタラクティブ実行"}
        </button>
        {wcag && theme !== "forced-colors" && <ContrastBadge wcag={wcag} />}
      </div>
    </div>
  );
}

function PreviewThemeSwitch({ value, onChange }: { value: PreviewTheme; onChange: (t: PreviewTheme) => void }) {
  return (
    <div className={styles.themeSwitch} role="group" aria-label="プレビューテーマ切替">
      {PREVIEW_THEMES.map(theme => (
        <button
          key={theme}
          type="button"
          className={styles.themeBtn}
          data-active={value === theme}
          aria-pressed={value === theme}
          title={THEME_STYLES[theme].description}
          onClick={() => onChange(theme)}
        >
          {THEME_STYLES[theme].label}
        </button>
      ))}
    </div>
  );
}

function PreviewViewportSwitch({ value, onChange }: { value: PreviewViewport; onChange: (v: PreviewViewport) => void }) {
  return (
    <div className={styles.themeSwitch} role="group" aria-label="プレビュー幅切替">
      {PREVIEW_VIEWPORTS.map(vp => (
        <button
          key={vp}
          type="button"
          className={styles.themeBtn}
          data-active={value === vp}
          aria-pressed={value === vp}
          aria-label={VIEWPORT_STYLES[vp].ariaLabel}
          onClick={() => onChange(vp)}
        >
          {VIEWPORT_STYLES[vp].label}
        </button>
      ))}
    </div>
  );
}

function AriaCheckBadge({ content }: { content: string }) {
  // L3 Stage 1: AI 回答に含まれる aria-* 属性を WAI-ARIA 1.2/1.3 辞書と照合
  // 教育目的の Bad ブロック内は除外。total=0 ならバッジ非表示
  const aria = validateAriaAttrs(content);
  if (aria.total === 0) return null;
  const warn = aria.unknown.length > 0;
  return (
    <span
      className={styles.ariaCheckBadge}
      data-status={warn ? "warn" : "ok"}
      title={warn
        ? `未知 ARIA 属性（捏造の疑い）: ${aria.unknown.join(", ")}`
        : `ARIA 属性 ${aria.valid.length} 種すべて WAI-ARIA 1.2/1.3 に存在`}
    >
      ARIA {warn ? `⚠ ${aria.unknown.length}` : `✓ ${aria.valid.length}`}
    </span>
  );
}

function WcagCheckBadge({ content }: { content: string }) {
  // L3 Stage 2: AI 回答に含まれる WCAG 番号を WCAG 2.0/2.1/2.2 SC 辞書と照合
  const wcag = validateWcagRefs(content);
  if (wcag.total === 0) return null;
  const warn = wcag.unknown.length > 0;
  return (
    <span
      className={styles.ariaCheckBadge}
      data-status={warn ? "warn" : "ok"}
      title={warn
        ? `未知 WCAG 番号（捏造の疑い）: ${wcag.unknown.join(", ")}`
        : `WCAG 番号 ${wcag.valid.length} 件すべて WCAG 2.0/2.1/2.2 に存在`}
    >
      WCAG {warn ? `⚠ ${wcag.unknown.length}` : `✓ ${wcag.valid.length}`}
    </span>
  );
}

function KeyboardCheckBadge({ content }: { content: string }) {
  // L3 Stage 3-b: キーボード操作言及あり + Tab 言及なし パターンを警告
  const k = validateKeyboardCompleteness(content);
  if (!k.hasOperationKey) return null;
  return (
    <span
      className={styles.ariaCheckBadge}
      data-status={k.warn ? "warn" : "ok"}
      title={k.warn
        ? "Space/Enter/矢印などの操作キー言及はあるが Tab フォーカス手順への言及がありません。ARIA APG では Tab → 操作キー の順序が前提です"
        : "キーボード操作の Tab フォーカス言及あり"}
    >
      KBD {k.warn ? "⚠ Tab抜け" : "✓"}
    </span>
  );
}

function CssCheckBadge({ content }: { content: string }) {
  // L3 Stage 3-a: AI 回答に含まれる CSS プロパティを主要辞書と照合
  // 辞書漏れの可能性があるため warn ではなく info 寄り（color: ok）扱い
  const css = validateCssProps(content);
  if (css.total === 0) return null;
  const warn = css.unknown.length > 0;
  return (
    <span
      className={styles.ariaCheckBadge}
      data-status={warn ? "warn" : "ok"}
      title={warn
        ? `主要 CSS 辞書外（typo or 新規プロパティ可能性）: ${css.unknown.join(", ")}`
        : `CSS プロパティ ${css.valid.length} 種すべて主要辞書に存在`}
    >
      CSS {warn ? `⚠ ${css.unknown.length}` : `✓ ${css.valid.length}`}
    </span>
  );
}

function ContrastBadge({ wcag }: { wcag: WCAGResult }) {
  // AA通常テキストを基準に pass/large/fail を区別
  const tier: "pass" | "large" | "fail" =
    wcag.AA_normal ? "pass" : wcag.AA_large ? "large" : "fail";
  const label =
    tier === "pass"
      ? wcag.AAA_normal ? "AAA pass" : "AA pass"
      : tier === "large" ? "AA large only" : "fail";
  return (
    <span
      className={styles.wcagBadge}
      data-tier={tier}
      title="WCAG 2.1 アルゴリズムによる実測値"
    >
      {wcag.ratio}:1 · {label}
    </span>
  );
}

// コード折りたたみ: デザイナーにはコードを見せず、見たい人だけ開ける
function CodeToggle({ children }: { children: React.ReactNode }) {
  const [show, setShow] = useState(false);
  return (
    <div className={styles.codeToggleWrap}>
      <button
        type="button"
        className={styles.codeToggleBtn}
        onClick={() => setShow(s => !s)}
        aria-expanded={show}
      >
        {show ? "コードを隠す" : "</> 実装コードを表示（エンジニア向け）"}
      </button>
      {show && children}
    </div>
  );
}

// ReactMarkdown の <pre> を差し替える。
// designer: コードは見せずプレビュー（見た目）だけを表示。コードは折りたたみの奥へ
// engineer: 従来どおりコード + プレビュー
function makeMdComponents(hideCode: boolean): Components {
  return {
    pre({ children, ...rest }) {
      const child = Array.isArray(children) ? children[0] : children;
      let lang = "";
      let codeText = "";
      if (child && typeof child === "object" && "props" in child) {
        const cp = (child as { props: { className?: string; children?: unknown } }).props;
        const m = /language-(\w+)/.exec(cp.className ?? "");
        lang = m?.[1] ?? "";
        codeText = extractText(cp.children).replace(/\n$/, "");
      }
      if (lang === "html") {
        return hideCode ? (
          <>
            <HtmlPreview code={codeText} />
            <CodeToggle><pre {...rest}>{children}</pre></CodeToggle>
          </>
        ) : (
          <>
            <pre {...rest}>{children}</pre>
            <HtmlPreview code={codeText} />
          </>
        );
      }
      return hideCode
        ? <CodeToggle><pre {...rest}>{children}</pre></CodeToggle>
        : <pre {...rest}>{children}</pre>;
    },
  };
}
const MD_COMPONENTS_ENGINEER = makeMdComponents(false);
const MD_COMPONENTS_DESIGNER = makeMdComponents(true);

// ── サブコンポーネント ────────────────────────────────
function MessageBubble({ msg, onExpand }: { msg: Message; onExpand?: () => void }) {
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
            {msg.grounded === false && !msg.error && (
              <span
                className={styles.generalBadge}
                title="この回答は仕様書（WCAG/WAI-ARIA/MDN）に直接の根拠がなく、AI の一般知識に基づきます。WCAG 番号や具体値は必ず一次情報で確認してください。"
              >
                AIの一般知識（仕様外）
              </span>
            )}
            <AriaCheckBadge content={msg.content} />
            <WcagCheckBadge content={msg.content} />
            <KeyboardCheckBadge content={msg.content} />
            <CssCheckBadge content={msg.content} />
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
          {(() => {
            // デザイナーの回答ではコードを隠しプレビューだけ見せる（コード拒絶層への配慮）
            const mdComponents = msg.userRole === "engineer" ? MD_COMPONENTS_ENGINEER : MD_COMPONENTS_DESIGNER;
            // クイック回答の判定行（✅/❌/⚠️）を色付きバナーに昇格。なければ従来描画
            const verdict = msg.error ? null : parseVerdict(msg.content);
            if (!verdict) {
              return (
                <div className={styles.aiText}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={mdComponents}>{msg.content}</ReactMarkdown>
                </div>
              );
            }
            return (
              <>
                <div className={styles.verdictBanner} data-tier={verdict.tier}>
                  <span className={styles.verdictChip}>{VERDICT_LABEL[verdict.tier]}</span>
                  <span className={styles.verdictHeadline}>{verdict.headline}</span>
                </div>
                {verdict.body && (
                  <div className={styles.aiText}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={mdComponents}>{verdict.body}</ReactMarkdown>
                  </div>
                )}
              </>
            );
          })()}
          {onExpand && (
            <button
              className={styles.expandBtn}
              onClick={onExpand}
              title="この回答を根拠仕様・視覚例・実装コード込みで深掘り"
            >
              {ICO.learn}
              <span>詳しく展開</span>
            </button>
          )}
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

// 処理の進み具合を言葉で見せる（コードに関心がない人にも「何をしているか」が伝わる）
const THINKING_STEPS = [
  "仕様データベースを検索中...",
  "WCAG / WAI-ARIA / MDN を照合中...",
  "根拠を整理して回答を作成中...",
];

function ThinkingBubble({ model }: { model: string }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    // 最終ステップに達したらタイマーを止める（無駄な再レンダー防止）
    const t = setInterval(() => {
      setStep(s => {
        if (s < THINKING_STEPS.length - 1) return s + 1;
        clearInterval(t);
        return s;
      });
    }, 2500);
    return () => clearInterval(t);
  }, []);
  return (
    <div className={`${styles.msg} ${styles.assistant}`}>
      <div className={styles.aiBubble}>
        <div className={styles.aiHeader}>
          <span className={styles.aiModel}>{model}</span>
        </div>
        <div className={styles.thinkingRow}>
          <div className={styles.thinking}>
            <span /><span /><span />
          </div>
          {/* 進行ステップは視覚演出。SR には静的な1回通知のみ（aria-live の洪水防止） */}
          <span className={styles.thinkingLabel} aria-hidden="true">{THINKING_STEPS[step]}</span>
          <span className={styles.srOnly} role="status">回答を生成中</span>
        </div>
      </div>
    </div>
  );
}
