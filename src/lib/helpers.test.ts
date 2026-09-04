import { describe, it, expect } from "vitest";
import { buildExportPayload, validateImport, mdToPlain } from "./helpers";
import type { ChatSession, Message } from "./types";

// ── テスト用データ ──
function makeMsgUser(content: string): Message {
  return { id: "m1", role: "user", content, userRole: "designer" };
}
function makeMsgAssistant(content: string): Message {
  return { id: "m2", role: "assistant", content, model: "gpt-5.6-luna" };
}
function makeSession(overrides: Partial<ChatSession> = {}): ChatSession {
  return {
    id: "sess-1",
    title: "テストセッション",
    messages: [makeMsgUser("こんにちは"), makeMsgAssistant("お手伝いします")],
    role: "designer",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

// ── buildExportPayload ──
describe("buildExportPayload", () => {
  it("正しい構造のペイロードを返す", () => {
    const sessions = [makeSession()];
    const payload = buildExportPayload(sessions);

    expect(payload.app).toBe("specbridge");
    expect(payload.version).toBe(1);
    expect(payload.exportedAt).toBeTruthy();
    expect(payload.sessions).toHaveLength(1);
    expect(payload.sessions[0].id).toBe("sess-1");
  });

  it("空配列でも動作する", () => {
    const payload = buildExportPayload([]);
    expect(payload.sessions).toHaveLength(0);
    expect(payload.app).toBe("specbridge");
  });

  it("複数セッションをエクスポートできる", () => {
    const sessions = [
      makeSession({ id: "s1", title: "会話1" }),
      makeSession({ id: "s2", title: "会話2" }),
      makeSession({ id: "s3", title: "会話3" }),
    ];
    const payload = buildExportPayload(sessions);
    expect(payload.sessions).toHaveLength(3);
  });

  it("メッセージのsources, tokens等が保持される", () => {
    const msg: Message = {
      id: "m1",
      role: "assistant",
      content: "回答",
      sources: [{ id: "src1", score: 0.9, source: "WCAG", title: "仕様書", section: "1.1.1", url: "https://example.com", snippet: "..." }],
      tokens: { input: 100, output: 200 },
    };
    const sessions = [makeSession({ messages: [makeMsgUser("質問"), msg] })];
    const payload = buildExportPayload(sessions);
    const exported = payload.sessions[0].messages[1];
    expect(exported.sources).toHaveLength(1);
    expect(exported.tokens?.input).toBe(100);
  });
});

// ── validateImport ──
describe("validateImport", () => {
  it("正しいペイロードをバリデーション通過させる", () => {
    const payload = buildExportPayload([makeSession()]);
    const result = validateImport(payload);

    expect(result).not.toBeNull();
    expect(result).toHaveLength(1);
    expect(result![0].id).toBe("sess-1");
    expect(result![0].title).toBe("テストセッション");
    expect(result![0].messages).toHaveLength(2);
  });

  it("null / undefined を拒否する", () => {
    expect(validateImport(null)).toBeNull();
    expect(validateImport(undefined)).toBeNull();
  });

  it("app が specbridge でなければ拒否", () => {
    expect(validateImport({ app: "other", sessions: [] })).toBeNull();
  });

  it("sessions が配列でなければ拒否", () => {
    expect(validateImport({ app: "specbridge", sessions: "not-array" })).toBeNull();
  });

  it("sessions が空配列なら null を返す", () => {
    expect(validateImport({ app: "specbridge", sessions: [] })).toBeNull();
  });

  it("セッションに id がなければスキップ", () => {
    const data = {
      app: "specbridge",
      sessions: [{ title: "no-id", messages: [{ role: "user", content: "hi" }], role: "designer" }],
    };
    expect(validateImport(data)).toBeNull();
  });

  it("セッションに messages がなければスキップ", () => {
    const data = {
      app: "specbridge",
      sessions: [{ id: "s1", title: "no-msgs", role: "designer" }],
    };
    expect(validateImport(data)).toBeNull();
  });

  it("メッセージの role が user/assistant 以外ならスキップ", () => {
    const data = {
      app: "specbridge",
      sessions: [{
        id: "s1",
        title: "bad-role",
        messages: [{ role: "system", content: "test" }],
        role: "designer",
      }],
    };
    expect(validateImport(data)).toBeNull();
  });

  it("メッセージに content がなければスキップ", () => {
    const data = {
      app: "specbridge",
      sessions: [{
        id: "s1",
        title: "no-content",
        messages: [{ role: "user" }],
        role: "designer",
      }],
    };
    expect(validateImport(data)).toBeNull();
  });

  it("title 欠落時にデフォルト値を使う", () => {
    const data = {
      app: "specbridge",
      sessions: [{
        id: "s1",
        messages: [{ role: "user", content: "hi" }],
        role: "designer",
      }],
    };
    const result = validateImport(data);
    expect(result).not.toBeNull();
    expect(result![0].title).toBe("無題");
  });

  it("role 不明時に designer にフォールバック", () => {
    const data = {
      app: "specbridge",
      sessions: [{
        id: "s1",
        title: "test",
        messages: [{ role: "user", content: "hi" }],
        role: "unknown-role",
      }],
    };
    const result = validateImport(data);
    expect(result).not.toBeNull();
    expect(result![0].role).toBe("designer");
  });

  it("createdAt 欠落時にデフォルト日時が入る", () => {
    const data = {
      app: "specbridge",
      sessions: [{
        id: "s1",
        title: "test",
        messages: [{ role: "user", content: "hi" }],
        role: "designer",
      }],
    };
    const result = validateImport(data);
    expect(result).not.toBeNull();
    expect(result![0].createdAt).toBeTruthy();
  });

  it("エクスポート→インポートのラウンドトリップが成功する", () => {
    const original = [
      makeSession({ id: "s1", title: "会話A" }),
      makeSession({ id: "s2", title: "会話B" }),
    ];
    const exported = buildExportPayload(original);
    // JSON経由でシリアライズ/デシリアライズ
    const json = JSON.stringify(exported);
    const parsed = JSON.parse(json);
    const imported = validateImport(parsed);

    expect(imported).not.toBeNull();
    expect(imported).toHaveLength(2);
    expect(imported![0].id).toBe("s1");
    expect(imported![1].id).toBe("s2");
    expect(imported![0].messages).toHaveLength(2);
    expect(imported![0].messages[0].content).toBe("こんにちは");
    expect(imported![0].messages[1].content).toBe("お手伝いします");
  });

  it("有効/無効なセッションが混在する場合、有効なもののみ返す", () => {
    const data = {
      app: "specbridge",
      sessions: [
        { id: "s1", title: "valid", messages: [{ role: "user", content: "hi" }], role: "designer" },
        { id: "s2", title: "invalid", messages: [{ role: "system", content: "nope" }], role: "designer" },
        "not-an-object",
        null,
        { title: "no-id", messages: [{ role: "user", content: "x" }] },
      ],
    };
    const result = validateImport(data);
    expect(result).not.toBeNull();
    expect(result).toHaveLength(1);
    expect(result![0].id).toBe("s1");
  });
});

// ── exportToFile / downloadText のブラウザ互換性テスト ──
// (これらは DOM API を使うため、ここではロジックの正しさのみ検証)
describe("mdToPlain", () => {
  it("見出しを除去する", () => {
    expect(mdToPlain("## タイトル")).toBe("タイトル");
  });
  it("太字を除去する", () => {
    expect(mdToPlain("**強調**テスト")).toBe("強調テスト");
  });
  it("リンクをテキストに変換する", () => {
    expect(mdToPlain("[リンク](https://example.com)")).toBe("リンク");
  });
});

// ── parseGrounding ──
import { parseGrounding } from "./helpers";

describe("parseGrounding", () => {
  it("先頭センチネル [[GENERAL]] を検出し grounded=false + 除去する", () => {
    const r = parseGrounding("[[GENERAL]]\n✅ axe DevTools は拡張機能です。");
    expect(r.grounded).toBe(false);
    expect(r.answer).toBe("✅ axe DevTools は拡張機能です。");
  });

  it("センチネルが無ければ grounded=true で本文そのまま", () => {
    const r = parseGrounding("✅ WCAG 2.2 SC 1.4.3 に基づきます。");
    expect(r.grounded).toBe(true);
    expect(r.answer).toBe("✅ WCAG 2.2 SC 1.4.3 に基づきます。");
  });

  it("センチネル前後の空白・改行揺れを吸収する", () => {
    expect(parseGrounding("  [[GENERAL]]  \n本文").grounded).toBe(false);
    expect(parseGrounding("[[general]]\n本文").grounded).toBe(false); // 大小文字許容
    expect(parseGrounding("[[GENERAL]] 本文").answer).toBe("本文");
  });

  it("結論行を先に置くモデルでも、位置を問わずセンチネルを除去し grounded=false にする", () => {
    // concise モードで verdict 行が先、[[GENERAL]] が後に来ても漏らさない
    const r = parseGrounding("✅ axe は拡張機能です。\n[[GENERAL]]");
    expect(r.grounded).toBe(false);
    expect(r.answer).not.toContain("[[GENERAL]]");
    expect(r.answer.startsWith("✅")).toBe(true);
  });

  it("センチネルを全除去し、生の文字列を本文へ漏らさない", () => {
    const r = parseGrounding("[[GENERAL]]\n本文に [[GENERAL]] が二重に出ても除去");
    expect(r.answer).not.toContain("[[GENERAL]]");
    expect(r.grounded).toBe(false);
  });
});

// ── headerSafe ──
import { headerSafe } from "./helpers";

describe("headerSafe", () => {
  it("前後の空白と改行を除去する", () => {
    expect(headerSafe("  sk-abc123\n")).toBe("sk-abc123");
  });

  it("全角文字・日本語を除去する（Safari の fetch ヘッダー例外対策）", () => {
    expect(headerSafe("ｓｋ−abc")).toBe("abc");
    expect(headerSafe("招待コード123")).toBe("123");
  });

  it("印字可能 ASCII はそのまま通す", () => {
    expect(headerSafe("sk-proj_ABC-123.xyz~")).toBe("sk-proj_ABC-123.xyz~");
  });

  it("すべて不正文字なら空文字（ヘッダー自体を送らない判定に使う）", () => {
    expect(headerSafe("　全角スペースのみ　")).toBe("");
  });
});
