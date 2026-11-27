"use client";
// 暗転中の操作（仮想カーソルの移動・決定・読み上げ・軌跡の記録）をまとめたフック

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { collectReadable, describe, getAccessibleName, INTERACTIVE_ROLES, type ReaderItem } from "@/lib/virtualReader";
import { useSpeech } from "./useSpeech";
import { useSpatialPing } from "./useSpatialPing";

export type PathPoint = {
  x: number; // ステージ内の座標（px）
  y: number;
  kind: "control" | "content" | "miss";
  label: string;
};

export type Ripple = {
  key: number;
  left: number; // 画面上の座標（px、position: fixed 用）
  top: number;
  width: number;
  height: number;
  kind: PathPoint["kind"];
};

export const READER_TEXT = {
  start: "画面が暗くなりました。下の矢印キーで次の項目、上の矢印キーで前の項目、エンターキーで決定します。",
  noReaction: "反応がありません",
  edge: "これ以上ありません",
  noControl: "操作できる部品が見つかりません",
} as const;

export function useReaderSession(stageRef: RefObject<HTMLDivElement | null>, active: boolean) {
  const speech = useSpeech();
  const { ping, ensure } = useSpatialPing();
  const currentRef = useRef<Element | null>(null);
  const [moves, setMoves] = useState(0);
  const [path, setPath] = useState<PathPoint[]>([]);
  const [ripple, setRipple] = useState<Ripple | null>(null);
  const rippleKey = useRef(0);

  const reset = useCallback(() => {
    currentRef.current = null;
    setMoves(0);
    setPath([]);
    setRipple(null);
  }, []);

  const items = useCallback((): ReaderItem[] => (stageRef.current ? collectReadable(stageRef.current) : []), [stageRef]);

  // 項目に移ったときの演出: 効果音（位置）→ 波紋 → 読み上げ → 軌跡の記録
  const announce = useCallback((item: ReaderItem, kind: PathPoint["kind"] = INTERACTIVE_ROLES.has(item.role) ? "control" : "content") => {
    const stage = stageRef.current;
    if (!stage) return;
    const r = item.el.getBoundingClientRect();
    const s = stage.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    ping(cx / window.innerWidth, cy / window.innerHeight, kind === "miss" ? "error" : kind);
    rippleKey.current += 1;
    setRipple({ key: rippleKey.current, left: r.left, top: r.top, width: r.width, height: r.height, kind });
    const text = describe(item);
    speech.speak(kind === "miss" ? READER_TEXT.noReaction : text);
    setPath(p => [...p, { x: cx - s.left, y: cy - s.top, kind, label: text }]);
    setMoves(m => m + 1);
  }, [stageRef, ping, speech]);

  const indexOfCurrent = (list: ReaderItem[]) => list.findIndex(i => i.el === currentRef.current);

  const move = useCallback((dir: 1 | -1, onlyControls = false) => {
    const list = items();
    if (list.length === 0) return;
    let i = indexOfCurrent(list);
    for (let step = 0; step < list.length; step++) {
      i = i + dir;
      if (i < 0 || i >= list.length) {
        speech.speak(onlyControls ? READER_TEXT.noControl : READER_TEXT.edge);
        ping(dir > 0 ? 1 : 0, 0.5, "error");
        return;
      }
      if (!onlyControls || INTERACTIVE_ROLES.has(list[i].role)) break;
    }
    currentRef.current = list[i].el;
    announce(list[i]);
  }, [items, announce, speech, ping]);

  // 決定: 役割のある部品だけが反応する（div にクリックを付けただけの部品は支援技術から押せない、という簡易再現）
  const activate = useCallback(() => {
    const list = items();
    const i = indexOfCurrent(list);
    if (i < 0) { move(1); return; }
    const item = list[i];
    if (!INTERACTIVE_ROLES.has(item.role)) {
      announce(item, "miss");
      return;
    }
    (item.el as HTMLElement).click();
    // ラジオボタンなど状態が変わる部品は、変わった後の状態を読み直す
    if (item.role === "radio" || item.role === "checkbox") {
      window.setTimeout(() => {
        const updated = items().find(x => x.el === item.el);
        if (updated) speech.speak(describe(updated));
      }, 30);
    }
  }, [items, move, announce, speech]);

  const repeat = useCallback(() => {
    const item = items().find(x => x.el === currentRef.current);
    if (item) speech.speak(describe(item));
  }, [items, speech]);

  // 監視は描画のたびに張り直さない（クリック直後の変化を受け取る前に外れてしまうため）。最新の speak は ref で参照する
  const speakRef = useRef(speech.speak);
  useEffect(() => { speakRef.current = speech.speak; }, [speech.speak]);

  // 読み上げ領域（aria-live / role=alert）の変化を読み上げる。対応前の画面には読み上げ領域が無いので何も起きない
  useEffect(() => {
    const stage = stageRef.current;
    if (!active || !stage) return;
    const obs = new MutationObserver(records => {
      for (const rec of records) {
        const target = rec.target.nodeType === 1 ? (rec.target as Element) : rec.target.parentElement;
        const region = target?.closest("[aria-live], [role='alert']");
        if (!region) continue;
        const text = getAccessibleName(region) || (region.textContent ?? "").trim();
        if (text) window.setTimeout(() => speakRef.current(text), 60);
        return;
      }
    });
    obs.observe(stage, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["aria-label"] });
    return () => obs.disconnect();
  }, [stageRef, active]);

  return { speech, ensure, ping, moves, path, ripple, move, activate, repeat, reset };
}
