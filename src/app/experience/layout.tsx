import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "暗転チャレンジ — SpecBridge",
  description: "画面を真っ暗にして、読み上げだけでピザを注文する。アクセシビリティ対応の前と後で、かかる時間と暗闇の中の動きを比べる体験",
};

export default function ExperienceLayout({ children }: { children: React.ReactNode }) {
  return children;
}
