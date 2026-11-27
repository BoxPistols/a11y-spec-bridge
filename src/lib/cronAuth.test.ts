import { describe, it, expect } from "vitest";
import { isAuthorizedCron } from "./cronAuth";

describe("isAuthorizedCron", () => {
  it("CRON_SECRET が未設定なら許可する", () => {
    expect(isAuthorizedCron(null, undefined)).toBe(true);
    expect(isAuthorizedCron(null, "  ")).toBe(true);
  });

  it("CRON_SECRET が設定されていれば Bearer の一致を必須にする", () => {
    expect(isAuthorizedCron("Bearer s3cret", "s3cret")).toBe(true);
    expect(isAuthorizedCron(null, "s3cret")).toBe(false);
    expect(isAuthorizedCron("Bearer wrong", "s3cret")).toBe(false);
    expect(isAuthorizedCron("s3cret", "s3cret")).toBe(false);
  });
});

describe("isAuthorizedCron（長さ違い）", () => {
  it("前方一致や長さ違いは拒否する", () => {
    expect(isAuthorizedCron("Bearer s3cre", "s3cret")).toBe(false);
    expect(isAuthorizedCron("Bearer s3cretX", "s3cret")).toBe(false);
  });
});
