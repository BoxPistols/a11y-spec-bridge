import type { ChatSession } from "./types";

// ── 定数 ──
export const MAX_SESSIONS = 50;

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
