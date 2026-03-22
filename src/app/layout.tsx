import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SpecBridge — Design × Spec Q&A",
  description: "WCAG / WAI-ARIA / MDN 仕様に基づいてデザイン判断を支援する RAG ツール",
  metadataBase: new URL("https://a11y-spec-bridge.vercel.app"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "SpecBridge — Design × Spec Q&A",
    description: "WCAG / WAI-ARIA / MDN 仕様に基づいてデザイン判断を支援する RAG ツール",
    url: "https://a11y-spec-bridge.vercel.app",
    siteName: "SpecBridge",
    locale: "ja_JP",
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "SpecBridge — Design × Spec Q&A",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "SpecBridge — Design × Spec Q&A",
    description: "WCAG / WAI-ARIA / MDN 仕様に基づいてデザイン判断を支援する RAG ツール",
    images: ["/og-image.png"],
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: [
      { url: "/apple-touch-icon.png" },
    ],
  },
  manifest: "/manifest.json",
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
