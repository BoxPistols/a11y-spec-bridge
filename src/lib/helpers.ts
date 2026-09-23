import type { ChatSession, ModelId } from "./types";

// ── 定数 ──
export const MAX_SESSIONS = 50;

// ── モデルID ──
// 一覧外の値（外したgemini-3.8-flashなど、保存値や古いタブからの送信）は既定のgpt-6-lunaに戻す
export const MODEL_IDS: readonly ModelId[] = ["gpt-6-luna"];
export const DEFAULT_MODEL_ID: ModelId = "gpt-6-luna";
export function normalizeModelId(value: unknown): ModelId {
  return MODEL_IDS.find(id => id === value) ?? DEFAULT_MODEL_ID;
}

// ── グラウンディング判定 ──
// LLM は仕様コンテキストに根拠が無く一般知識で答えるとき、回答の先頭行に
// センチネル [[GENERAL]] を出力する。サーバ側でこれを剥がして grounded=false を判定し、
// UI で「AIの一般知識（仕様外）」と明示する。閾値の推測に頼らず門前払いもしない方式。
// センチネルは行頭に来る想定だが、モデルが結論行(✅/❌)を先に置くなど位置がぶれても
// 生の [[GENERAL]] が本文へ漏れないよう、出現箇所を問わず検出・全除去する
export function parseGrounding(answer: string): { grounded: boolean; answer: string } {
  if (/\[\[GENERAL\]\]/i.test(answer)) {
    const cleaned = answer
      .replace(/\[\[GENERAL\]\]/gi, "")
      .replace(/^\s+/, "")        // 先頭に残った空行・空白を除去
      .replace(/\n{3,}/g, "\n\n"); // センチネル除去で空いた空行を詰める
    return { grounded: false, answer: cleaned };
  }
  return { grounded: true, answer };
}

// ── HTTP ヘッダー値のサニタイズ ──
// Safari は fetch のヘッダー値に非 ASCII・制御文字（全角文字、改行、貼り付け時の空白等）が
// 含まれると "The string did not match the expected pattern" を投げる。
// APIキー・招待コードは印字可能 ASCII のみ許容し、それ以外は落とす
export function headerSafe(value: string): string {
  return value.trim().replace(/[^\x21-\x7E]/g, "");
}

// ── Markdown → プレーンテキスト ──
export function mdToPlain(md: string): string {
  return md
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`{3}[\s\S]*?`{3}/g, m =>
      m.replace(/^`{3}\w*\n?/, "").replace(/`{3}$/, ""))
    .replace(/`(.+?)`/g, "$1")
    .replace(/\[(.+?)\]\(.+?\)/g, "$1")
    .replace(/^[-*+]\s+/gm, "- ")
    .replace(/^\d+\.\s+/gm, m => m)
    .replace(/^>\s+/gm, "")
    .replace(/---/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ── ダウンロード共通処理 ──
function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  // Safari対応: ダウンロード開始後にクリーンアップ
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

// ── テキストダウンロード ──
export function downloadText(content: string, filename: string) {
  triggerDownload(new Blob([content], { type: "text/plain;charset=utf-8" }), filename);
}

// ── エクスポート ──
export function exportToFile(data: object, filename: string) {
  triggerDownload(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), filename);
}

export function buildExportPayload(sessions: ChatSession[]) {
  return { app: "specbridge", version: 1, exportedAt: new Date().toISOString(), sessions };
}

// ── インポートバリデーション ──
export function validateImport(data: unknown): ChatSession[] | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (d.app !== "specbridge" || !Array.isArray(d.sessions)) return null;

  const valid: ChatSession[] = [];
  for (const s of d.sessions) {
    if (!s || typeof s !== "object") continue;
    const sess = s as Record<string, unknown>;
    if (typeof sess.id !== "string" || !Array.isArray(sess.messages)) continue;
    // メッセージ構造の検証
    const msgs = sess.messages as Record<string, unknown>[];
    if (!msgs.every(m => typeof m.role === "string" && typeof m.content === "string" && (m.role === "user" || m.role === "assistant"))) continue;
    valid.push({
      id: sess.id,
      title: typeof sess.title === "string" ? sess.title : "無題",
      messages: sess.messages,
      role: sess.role === "engineer" ? "engineer" : "designer",
      createdAt: typeof sess.createdAt === "string" ? sess.createdAt : new Date().toISOString(),
    });
  }
  return valid.length > 0 ? valid : null;
}
