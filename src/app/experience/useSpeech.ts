"use client";
// 読み上げ（Web Speech API）。日本語の声を選び、新しい読み上げは前の読み上げを打ち切る
// （スクリーンリーダーも次の項目へ移ると前の読み上げを止める）

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export const SPEECH_RATE_DEFAULT = 1.15;

export type Speech = {
  // null は判定前（サーバー描画と読み込み直後）。誤って「非対応」と表示しないために区別する
  supported: boolean | null;
  speak: (text: string) => void;
  cancel: () => void;
  lastText: string;
};

export function useSpeech(rate: number = SPEECH_RATE_DEFAULT): Speech {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [lastText, setLastText] = useState("");
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) { setSupported(false); return; }
    setSupported(true);
    const pick = () => {
      const voices = window.speechSynthesis.getVoices();
      voiceRef.current = voices.find(v => v.lang === "ja-JP") ?? voices.find(v => v.lang.startsWith("ja")) ?? null;
    };
    pick();
    window.speechSynthesis.addEventListener("voiceschanged", pick);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", pick);
      window.speechSynthesis.cancel();
    };
  }, []);

  const speak = useCallback((text: string) => {
    setLastText(text);
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ja-JP";
    u.rate = rate;
    if (voiceRef.current) u.voice = voiceRef.current;
    window.speechSynthesis.speak(u);
  }, [rate]);

  const cancel = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  // 呼び出し側の依存配列を安定させるため、値が変わらない限り同じオブジェクトを返す
  return useMemo(() => ({ supported, speak, cancel, lastText }), [supported, speak, cancel, lastText]);
}
