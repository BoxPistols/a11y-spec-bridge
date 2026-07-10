import { describe, it, expect } from "vitest";
import { parseVerdict } from "./verdict";

describe("parseVerdict", () => {
  it("✅ 始まりを ok と判定し、マーカーを除いた見出しを返す", () => {
    const v = parseVerdict("✅ 問題ありません。ネイティブ button で十分です。\n\n根拠: WCAG 2.2 SC 4.1.2");
    expect(v?.tier).toBe("ok");
    expect(v?.headline).toBe("問題ありません。ネイティブ button で十分です。");
    expect(v?.body).toBe("根拠: WCAG 2.2 SC 4.1.2");
  });

  it("❌ 始まりを ng と判定する", () => {
    const v = parseVerdict("❌ 避けるべきです。div にクリックを付けても支援技術に伝わりません。");
    expect(v?.tier).toBe("ng");
    expect(v?.body).toBe("");
  });

  it("⚠️ 始まりを warn と判定する（異体字セレクタなしも許容）", () => {
    expect(parseVerdict("⚠️ 条件付きで可。")?.tier).toBe("warn");
    expect(parseVerdict("⚠ 条件付きで可。")?.tier).toBe("warn");
  });

  it("太字マーカー（**✅ ...**）でも検出し、** を除去する", () => {
    const v = parseVerdict("**✅ 問題ない**\n本文");
    expect(v?.tier).toBe("ok");
    expect(v?.headline).toBe("問題ない");
  });

  it("先頭の空行をスキップして判定する", () => {
    expect(parseVerdict("\n\n✅ OK です。")?.tier).toBe("ok");
  });

  it("マーカーがない回答は null（従来描画にフォールバック）", () => {
    expect(parseVerdict("## 結論\n問題ありません。")).toBeNull();
    expect(parseVerdict("")).toBeNull();
    expect(parseVerdict("途中に ✅ があっても先頭でなければ対象外")).toBeNull();
  });
});
