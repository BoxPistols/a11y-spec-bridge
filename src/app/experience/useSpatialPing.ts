"use client";
// 項目の位置を音で知らせる短い効果音（Web Audio）
// 横位置 → 左右の定位、縦位置 → 音の高さ。操作できる部品は高めの柔らかい音、文字や画像は低めの音にする

import { useCallback, useEffect, useRef } from "react";

export type PingKind = "control" | "content" | "error" | "success";

const BASE_FREQ: Record<PingKind, number> = {
  control: 880,
  content: 440,
  error: 160,
  success: 660,
};

export function useSpatialPing() {
  const ctxRef = useRef<AudioContext | null>(null);

  useEffect(() => () => { void ctxRef.current?.close(); }, []);

  // ブラウザは利用者の操作の後でないと音を出せないため、最初の操作で作る
  const ensure = useCallback((): AudioContext | null => {
    if (typeof window === "undefined") return null;
    if (!ctxRef.current) {
      const Ctor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctxRef.current = new Ctor();
    }
    if (ctxRef.current.state === "suspended") void ctxRef.current.resume();
    return ctxRef.current;
  }, []);

  // x, y は 0〜1（画面内の相対位置）
  const ping = useCallback((x: number, y: number, kind: PingKind) => {
    const ctx = ensure();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const pan = ctx.createStereoPanner();
    osc.type = kind === "error" ? "sawtooth" : "sine";
    const pitch = kind === "control" || kind === "content" ? 1.5 - y : 1;
    osc.frequency.setValueAtTime(BASE_FREQ[kind] * pitch, now);
    if (kind === "success") osc.frequency.exponentialRampToValueAtTime(BASE_FREQ.success * 2, now + 0.25);
    pan.pan.setValueAtTime(Math.max(-1, Math.min(1, x * 2 - 1)), now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(kind === "error" ? 0.12 : 0.18, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + (kind === "success" ? 0.5 : 0.18));
    osc.connect(gain).connect(pan).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.55);
  }, [ensure]);

  return { ping, ensure };
}
