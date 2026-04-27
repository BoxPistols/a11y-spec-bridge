import { describe, expect, it } from "vitest";
import {
  buildPreviewSrcDoc,
  extractFirstColorPair,
  judgeContrast,
  PREVIEW_VIEWPORTS,
  THEME_STYLES,
  VIEWPORT_STYLES,
} from "./htmlPreview";

describe("extractFirstColorPair", () => {
  it("ダブルクォート style から hex ペアを抽出", () => {
    expect(extractFirstColorPair('<button style="color:#fff;background:#000">A</button>'))
      .toEqual({ fg: "#fff", bg: "#000" });
  });

  it("シングルクォート style からも抽出", () => {
    expect(extractFirstColorPair("<button style='color:#fff;background:#000'>A</button>"))
      .toEqual({ fg: "#fff", bg: "#000" });
  });

  it("background-color 表記も認識", () => {
    expect(extractFirstColorPair('<div style="color:#222;background-color:#eee">x</div>'))
      .toEqual({ fg: "#222", bg: "#eee" });
  });

  it("3桁 hex を受け付ける", () => {
    expect(extractFirstColorPair('<a style="color:#abc;background:#def">l</a>'))
      .toEqual({ fg: "#abc", bg: "#def" });
  });

  it("大文字 hex も受け付ける", () => {
    expect(extractFirstColorPair('<a style="color:#FFF;background:#000">l</a>'))
      .toEqual({ fg: "#FFF", bg: "#000" });
  });

  it("CSS 変数は hex でないため null", () => {
    expect(extractFirstColorPair('<a style="color:var(--text);background:#000">l</a>'))
      .toBeNull();
  });

  it("named color (red) は hex 限定のため null", () => {
    expect(extractFirstColorPair('<a style="color:red;background:#fff">l</a>'))
      .toBeNull();
  });

  it("style 属性なしは null", () => {
    expect(extractFirstColorPair("<button>A</button>")).toBeNull();
  });

  it("空 style は null", () => {
    expect(extractFirstColorPair('<button style="">A</button>')).toBeNull();
  });

  it("color のみ・background なしは null", () => {
    expect(extractFirstColorPair('<a style="color:#fff">A</a>')).toBeNull();
  });
});

describe("judgeContrast", () => {
  it("hex ペアがあれば WCAGResult を返す", () => {
    const result = judgeContrast('<button style="color:#fff;background:#000">A</button>');
    expect(result).not.toBeNull();
    expect(result?.AA_normal).toBe(true);
  });

  it("色ペアが取れなければ null", () => {
    expect(judgeContrast("<button>plain</button>")).toBeNull();
  });
});

describe("buildPreviewSrcDoc", () => {
  it("light テーマで body bg が #ffffff", () => {
    const doc = buildPreviewSrcDoc("<p>x</p>", "light");
    expect(doc).toContain("background:#ffffff");
    expect(doc).toContain("color:#222222");
    expect(doc).toContain("color-scheme:light");
  });

  it("dark テーマで body bg が #1a1a1a と color-scheme:dark", () => {
    const doc = buildPreviewSrcDoc("<p>x</p>", "dark");
    expect(doc).toContain("background:#1a1a1a");
    expect(doc).toContain("color:#e0e0e0");
    expect(doc).toContain("color-scheme:dark");
  });

  it("forced-colors テーマで Canvas / CanvasText / ButtonFace を含む", () => {
    const doc = buildPreviewSrcDoc("<p>x</p>", "forced-colors");
    expect(doc).toContain("background:Canvas");
    expect(doc).toContain("color:CanvasText");
    expect(doc).toContain("ButtonFace");
    expect(doc).toContain("ButtonText");
    expect(doc).toContain("background-image:none!important");
    expect(doc).toContain("box-shadow:none!important");
  });

  it("code が body 内に挿入される", () => {
    const code = '<button class="x">click</button>';
    expect(buildPreviewSrcDoc(code, "light")).toContain(`<body>${code}</body>`);
  });

  it("CSP meta が常に含まれる", () => {
    for (const theme of ["light", "dark", "forced-colors"] as const) {
      const doc = buildPreviewSrcDoc("", theme);
      expect(doc).toContain('http-equiv="Content-Security-Policy"');
      expect(doc).toContain("default-src 'none'");
      expect(doc).toContain("style-src 'unsafe-inline'");
    }
  });

  it("既定では script-src を含まない（scripts 無効）", () => {
    const doc = buildPreviewSrcDoc("<p>x</p>", "light");
    expect(doc).not.toContain("script-src");
  });

  it("allowScripts=true で script-src 'unsafe-inline' と connect-src 'none' を含む", () => {
    const doc = buildPreviewSrcDoc("<p>x</p>", "light", { allowScripts: true });
    expect(doc).toContain("script-src 'unsafe-inline'");
    expect(doc).toContain("connect-src 'none'");
    expect(doc).toContain("frame-ancestors 'none'");
  });

  it("allowScripts=false（既定）では connect-src を含まない", () => {
    const doc = buildPreviewSrcDoc("<p>x</p>", "light", { allowScripts: false });
    expect(doc).not.toContain("connect-src");
  });
});

describe("THEME_STYLES", () => {
  it("light/dark の extraCss は空", () => {
    expect(THEME_STYLES.light.extraCss).toBe("");
    expect(THEME_STYLES.dark.extraCss).toBe("");
  });

  it("forced-colors の label は 'Forced'、titleSuffix は '強制色'", () => {
    expect(THEME_STYLES["forced-colors"].label).toBe("Forced");
    expect(THEME_STYLES["forced-colors"].titleSuffix).toBe("強制色");
  });

  it("forced-colors のみ description（擬似再現の注釈）が定義されている", () => {
    expect(THEME_STYLES.light.description).toBeUndefined();
    expect(THEME_STYLES.dark.description).toBeUndefined();
    expect(THEME_STYLES["forced-colors"].description).toBeTruthy();
    expect(THEME_STYLES["forced-colors"].description).toContain("擬似");
  });
});

describe("VIEWPORT_STYLES", () => {
  it("各ビューポートに label と ariaLabel が定義されている", () => {
    for (const vp of PREVIEW_VIEWPORTS) {
      expect(VIEWPORT_STYLES[vp].label).toBeTruthy();
      expect(VIEWPORT_STYLES[vp].ariaLabel).toBeTruthy();
    }
  });

  it("ariaLabel に幅情報を含む（375px / 768px / 100%）", () => {
    expect(VIEWPORT_STYLES.mobile.ariaLabel).toContain("375px");
    expect(VIEWPORT_STYLES.tablet.ariaLabel).toContain("768px");
    expect(VIEWPORT_STYLES.desktop.ariaLabel).toContain("100%");
  });

  it("PREVIEW_VIEWPORTS の順序は mobile → tablet → desktop", () => {
    expect(PREVIEW_VIEWPORTS).toEqual(["mobile", "tablet", "desktop"]);
  });
});
