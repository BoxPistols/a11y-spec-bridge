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
  label: string; // 読み上げで聞こえた言葉
  seen: string;  // 画面上の実物（data-see 属性。結果画面で「ほんとうは」として並べる）
};

export type Ripple = {
  key: number;
  left: number; // 画面上の座標（px、position: fixed 用）
  top: number;
  width: number;
  height: number;
  kind: PathPoint["kind"];
};

// 子どもにも分かる短い言葉にする（部品の読み上げ自体は、実際のスクリーンリーダーに近い言い方のまま）
export const READER_TEXT = {
  start: "くらくなったよ。したの やじるしで つぎ。エンターで えらぶ。",
  noReaction: "なにも おきない",
  edge: "ここで おしまい",
  noControl: "ボタンが みつからない",
} as const;

// 画面上の実物の名前（data-see 属性）。無ければ見えている文字を使う
function seenOf(el: Element): string {
  const tagged = el.closest("[data-see]")?.getAttribute("data-see");
  return tagged ?? (el.textContent ?? "").replace(/\s+/g, " ").trim();
}

export function useReaderSession(stageRef: RefObject<HTMLDivElement | null>, active: boolean) {
  const speech = useSpeech();
  const { ping, ensure, jingle } = useSpatialPing();
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
    setPath(p => [...p, { x: cx - s.left, y: cy - s.top, kind, label: text, seen: seenOf(item.el) }]);
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
    // カーソルが未設定（-1）で操作部品が 1 つも無いと、境界に届かずにループを抜ける。その場合も「見つからない」と伝える
    if (onlyControls && !INTERACTIVE_ROLES.has(list[i].role)) {
      speech.speak(READER_TEXT.noControl);
      ping(dir > 0 ? 1 : 0, 0.5, "error");
      return;
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

  return { speech, ensure, ping, jingle, moves, path, ripple, move, activate, repeat, reset };
}
