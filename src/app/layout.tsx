import type { Metadata, Viewport } from "next";
import "./globals.css";

// モバイル対応: device-width 基準。ピンチズームは禁止しない（WCAG 1.4.4 拡大縮小）
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // ノッチ端末で safe-area を使えるようにする
};

export const metadata: Metadata = {
  title: "SpecBridge — デザイナーとエンジニアのための a11y 判断",
  description: "アクセシビリティの担当者がいない現場のデザイナーとフロントエンドエンジニア向け。WCAG 2.2・WAI-ARIA・MDN の仕様を根拠に OK / NG と理由を返し、受け入れ基準や Claude Code のルールにしてチームに配れる",
  metadataBase: new URL("https://spec-bridge.vercel.app"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "SpecBridge — デザイナーとエンジニアのための a11y 判断",
    description: "アクセシビリティの担当者がいない現場のデザイナーとフロントエンドエンジニア向け。WCAG 2.2・WAI-ARIA・MDN の仕様を根拠に OK / NG と理由を返し、受け入れ基準や Claude Code のルールにしてチームに配れる",
    url: "https://spec-bridge.vercel.app",
    siteName: "SpecBridge",
    locale: "ja_JP",
    type: "website",
    images: [
      {
        url: "/og-image.svg",
        width: 1200,
        height: 630,
        alt: "SpecBridge — デザイナーとエンジニアのための a11y 判断",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "SpecBridge — デザイナーとエンジニアのための a11y 判断",
    description: "アクセシビリティの担当者がいない現場のデザイナーとフロントエンドエンジニア向け。WCAG 2.2・WAI-ARIA・MDN の仕様を根拠に OK / NG と理由を返し、受け入れ基準や Claude Code のルールにしてチームに配れる",
    images: ["/og-image.svg"],
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
  },
  manifest: "/manifest.json",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){var t=localStorage.getItem("specbridge-theme");if(t)document.documentElement.setAttribute("data-theme",t)})()` }} />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,300;0,400;0,500;1,300&family=DM+Sans:wght@300;400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
