import { describe, it, expect } from "vitest";
import { authorizeIngest } from "./ingestAuth";

const ENV = { INGEST_TOKEN: "admin-secret", INVITE_CODES: "alpha, beta" };

describe("authorizeIngest", () => {
  it("トークンも招待コードも無ければ拒否する", () => {
    expect(authorizeIngest({ ingestToken: null, inviteCode: null }, ENV)).toEqual({ allowed: false });
  });

  it("一致する管理者トークンは token として許可する", () => {
    expect(authorizeIngest({ ingestToken: "admin-secret", inviteCode: null }, ENV)).toEqual({ allowed: true, by: "token" });
  });

  it("前方一致や長さ違いのトークンは拒否する", () => {
    expect(authorizeIngest({ ingestToken: "admin", inviteCode: null }, ENV).allowed).toBe(false);
    expect(authorizeIngest({ ingestToken: "admin-secret-x", inviteCode: null }, ENV).allowed).toBe(false);
  });

  it("有効な招待コードは invite として許可する（カンマ区切りの前後空白は無視）", () => {
    expect(authorizeIngest({ ingestToken: null, inviteCode: "beta" }, ENV)).toEqual({ allowed: true, by: "invite" });
  });

  it("無効な招待コードは拒否する", () => {
    expect(authorizeIngest({ ingestToken: null, inviteCode: "gamma" }, ENV).allowed).toBe(false);
  });

  it("環境変数が未設定なら常に拒否する", () => {
    expect(authorizeIngest({ ingestToken: "anything", inviteCode: "anything" }, {}).allowed).toBe(false);
    expect(authorizeIngest({ ingestToken: "", inviteCode: "" }, { INGEST_TOKEN: "", INVITE_CODES: "" }).allowed).toBe(false);
  });
});
