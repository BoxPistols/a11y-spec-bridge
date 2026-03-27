import { describe, it, expect } from "vitest";
import { buildExportPayload, validateImport, mdToPlain } from "./helpers";
import type { ChatSession, Message } from "./types";

// ── テスト用データ ──
function makeMsgUser(content: string): Message {
  return { id: "m1", role: "user", content, userRole: "designer" };
}
function makeMsgAssistant(content: string): Message {
  return { id: "m2", role: "assistant", content, model: "gpt-5.4-nano" };
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
      sources: [{ title: "仕様書", url: "https://example.com" }],
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
