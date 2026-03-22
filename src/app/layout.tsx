import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SpecBridge — Design × Spec Q&A",
  description: "WCAG / WAI-ARIA / MDN 仕様に基づいてデザイン判断を支援する RAG ツール",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,300;0,400;0,500;1,300&family=DM+Sans:wght@300;400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
