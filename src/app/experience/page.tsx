"use client";
// 暗転チャレンジ: 画面を真っ暗にして、読み上げだけでピザを注文する。
// 見た目が同じ「対応前」と「対応後」の画面で挑戦し、かかった時間・操作回数・暗闇の中の動きを比べる

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./experience.module.css";
import { OrderAfter, OrderBefore, type PizzaSize } from "./OrderScreens";
import { READER_TEXT, useReaderSession, type PathPoint } from "./useReaderSession";

type Version = "before" | "after";
type Phase = "menu" | "playing" | "result";

type Result = {
  success: boolean;
  ms: number;
  moves: number;
  path: PathPoint[];
};

const GOAL_SIZE: PizzaSize = "M";
const GOAL_QTY = 2;
const TIME_LIMIT_MS = 120_000;
const QTY_MIN = 1;
const QTY_MAX = 9;

const TEXT = {
  title: "暗転チャレンジ",
  lead: "画面を見ずに、音だけでピザを注文できるか",
  goal: "ゴール",
  goalValue: "Mサイズを 2枚",
  before: "対応前",
  after: "対応後",
  beforeSub: "よくある作り方",
  afterSub: "アクセシビリティ対応",
  start: "暗くしてスタート",
  sameLook: "2つの画面は、見た目がまったく同じです",
  keys: "操作",
  keyNext: "次へ",
  keyPrev: "前へ",
  keyTab: "次のボタン",
  keyEnter: "決定",
  keyRepeat: "もう一度",
  keyQuit: "やめる",
  ripple: "波紋",
  caption: "字幕",
  noSpeech: "このブラウザは読み上げに対応していません。字幕で遊べます。",
  success: "注文できた",
  failed: "注文できなかった",
  seconds: "秒",
  movesUnit: "回",
  time: "時間",
  movesLabel: "操作",
  tryOther: "もう一方で挑戦",
  retry: "もう一度",
  back: "最初へ",
  compare: "くらべる",
  pathCaption: "暗闇の中で動いた道すじ",
  wrongOrder: "サイズか枚数が違います。Mサイズを2枚にしてください。",
  noSize: "サイズを選んでください。",
  orderedVoice: "注文できました",
  timeUpVoice: "時間切れです",
  quitVoice: "やめました。明かりをつけます",
  notReached: "たどり着けず",
  home: "SpecBridge に戻る",
  missLegend: "反応なし",
  controlLegend: "ボタンなど",
  contentLegend: "文字・画像",
} as const;

const fmtSec = (ms: number) => (ms / 1000).toFixed(1);

export default function ExperiencePage() {
  const [phase, setPhase] = useState<Phase>("menu");
  const [version, setVersion] = useState<Version>("before");
  const [results, setResults] = useState<Partial<Record<Version, Result>>>({});
  const [size, setSize] = useState<PizzaSize | null>(null);
  const [qty, setQty] = useState(QTY_MIN);
  const [error, setError] = useState("");
  const [showRipple, setShowRipple] = useState(true);
  const [showCaption, setShowCaption] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);
  // 終了処理は 1 回の挑戦につき 1 回だけ（時間切れの判定とキー操作が重なっても結果を上書きしない）
  const finishedRef = useRef(false);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const sinkRef = useRef<HTMLDivElement | null>(null);

  const session = useReaderSession(stageRef, phase === "playing");
  const { speech, ensure, ping, moves, path, ripple, move, activate, repeat, reset } = session;

  const finish = useCallback((success: boolean, reason: "order" | "timeup" | "quit" = success ? "order" : "quit") => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    const ms = Date.now() - startedAt.current;
    setResults(r => ({ ...r, [version]: { success, ms, moves, path } }));
    setPhase("result");
    if (success) {
      ping(0.5, 0.5, "success");
      speech.speak(TEXT.orderedVoice);
    } else {
      ping(0.5, 0.5, "error");
      speech.speak(reason === "timeup" ? TEXT.timeUpVoice : TEXT.quitVoice);
    }
  }, [version, moves, path, ping, speech]);

  const begin = useCallback((v: Version) => {
    setVersion(v);
    setSize(null);
    setQty(QTY_MIN);
    setError("");
    reset();
    ensure(); // 利用者の操作の直後に音声の準備をする（ブラウザの自動再生の制限）
    startedAt.current = Date.now();
    finishedRef.current = false;
    setElapsed(0);
    setPhase("playing");
    speech.speak(READER_TEXT.start);
  }, [reset, ensure, speech]);

  // 暗転中はキー操作を仮想カーソルに割り当てる
  useEffect(() => {
    if (phase !== "playing") return;
    sinkRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing) return;
      const k = e.key;
      const handled = ["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft", "Tab", "Enter", " ", "Escape", "r", "R"].includes(k);
      if (!handled) return;
      e.preventDefault();
      if (k === "ArrowDown" || k === "ArrowRight") move(1);
      else if (k === "ArrowUp" || k === "ArrowLeft") move(-1);
      else if (k === "Tab") move(e.shiftKey ? -1 : 1, true);
      else if (k === "Enter" || k === " ") activate();
      else if (k === "r" || k === "R") repeat();
      else if (k === "Escape") finish(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [phase, move, activate, repeat, finish]);

  // 経過時間と時間切れ
  useEffect(() => {
    if (phase !== "playing") return;
    const id = window.setInterval(() => {
      const ms = Date.now() - startedAt.current;
      setElapsed(ms);
      if (ms >= TIME_LIMIT_MS) finish(false, "timeup");
    }, 200);
    return () => window.clearInterval(id);
  }, [phase, finish]);

  const onOrder = useCallback(() => {
    if (!size) { setError(TEXT.noSize); return; }
    if (size !== GOAL_SIZE || qty !== GOAL_QTY) { setError(TEXT.wrongOrder); return; }
    setError("");
    finish(true);
  }, [size, qty, finish]);

  const screenProps = {
    size,
    qty,
    error,
    onSize: (s: PizzaSize) => { setSize(s); setError(""); },
    onQty: (d: 1 | -1) => { setQty(q => Math.min(QTY_MAX, Math.max(QTY_MIN, q + d))); setError(""); },
    onOrder,
  };

  const current = results[version];
  const other: Version = version === "before" ? "after" : "before";
  const both = results.before && results.after;

  return (
    <div className={styles.page} data-phase={phase}>
      <header className={styles.header}>
        <Link href="/" className={styles.homeLink}>← {TEXT.home}</Link>
        <h1 className={styles.title}>{TEXT.title}</h1>
        <p className={styles.lead}>{TEXT.lead}</p>
      </header>

      {phase === "menu" && (
        <Menu onStart={begin} results={results} speechSupported={speech.supported} />
      )}

      {phase !== "menu" && (
        <div className={styles.stageWrap}>
          <div className={styles.phone}>
            <div className={styles.phoneNotch} aria-hidden="true" />
            {/* 道すじの座標はステージ基準。重ね合わせのため同じ箱に入れる */}
            <div className={styles.stageBox}>
              <div ref={stageRef} className={styles.stage}>
                {version === "before" ? <OrderBefore {...screenProps} /> : <OrderAfter {...screenProps} />}
              </div>
              {phase === "result" && current && <PathOverlay path={current.path} />}
            </div>
          </div>

          {phase === "result" && current && (
            <ResultPanel
              version={version}
              result={current}
              onRetry={() => begin(version)}
              onOther={() => begin(other)}
              onMenu={() => setPhase("menu")}
              otherDone={!!results[other]}
            />
          )}
        </div>
      )}

      {phase === "result" && both && <Compare before={results.before!} after={results.after!} />}

      {phase === "playing" && (
        <>
          {/* 暗転の幕。マウスで覗けないようにクリックも受け止める */}
          <div className={styles.blackout} aria-hidden="true" />
          {showRipple && ripple && (
            <div
              key={ripple.key}
              className={styles.ripple}
              data-kind={ripple.kind}
              aria-hidden="true"
              style={{ left: ripple.left + ripple.width / 2, top: ripple.top + ripple.height / 2 }}
            />
          )}
          <div ref={sinkRef} tabIndex={-1} className={styles.sink} aria-label={TEXT.title} />
          <div className={styles.hud}>
            <div className={styles.hudTop}>
              <span className={styles.hudBadge}>{version === "before" ? TEXT.before : TEXT.after}</span>
              <span className={styles.hudTime} aria-hidden="true">{fmtSec(elapsed)}{TEXT.seconds}</span>
              <span className={styles.hudMoves} aria-hidden="true">{moves}{TEXT.movesUnit}</span>
              <div className={styles.hudToggles}>
                <Toggle label={TEXT.ripple} value={showRipple} onChange={setShowRipple} />
                <Toggle label={TEXT.caption} value={showCaption} onChange={setShowCaption} />
              </div>
            </div>
            {(showCaption || speech.supported === false) && (
              <div className={styles.caption} aria-live="off">{speech.lastText || (speech.supported === false ? TEXT.noSpeech : "")}</div>
            )}
            <div className={styles.pad}>
              <PadButton label={TEXT.keyPrev} keyCap="↑" onPress={() => move(-1)} />
              <PadButton label={TEXT.keyEnter} keyCap="Enter" onPress={activate} primary />
              <PadButton label={TEXT.keyNext} keyCap="↓" onPress={() => move(1)} />
              <PadButton label={TEXT.keyRepeat} keyCap="R" onPress={repeat} />
              <PadButton label={TEXT.keyQuit} keyCap="Esc" onPress={() => finish(false)} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── メニュー ──────────────────────────────────────────
function Menu({ onStart, results, speechSupported }: {
  onStart: (v: Version) => void;
  results: Partial<Record<Version, Result>>;
  speechSupported: boolean | null;
}) {
  return (
    <section className={styles.menu}>
      <div className={styles.goalCard}>
        <span className={styles.goalLabel}>{TEXT.goal}</span>
        {/* eslint-disable-next-line @next/next/no-img-element -- 装飾の小さな画像 */}
        <img src="/experience/pizza_0291.svg" alt="" width={56} height={56} />
        <span className={styles.goalValue}>{TEXT.goalValue}</span>
      </div>

      <div className={styles.keysCard} aria-label={TEXT.keys}>
        <KeyHint cap="↓" label={TEXT.keyNext} />
        <KeyHint cap="↑" label={TEXT.keyPrev} />
        <KeyHint cap="Tab" label={TEXT.keyTab} />
        <KeyHint cap="Enter" label={TEXT.keyEnter} />
        <KeyHint cap="R" label={TEXT.keyRepeat} />
        <KeyHint cap="Esc" label={TEXT.keyQuit} />
      </div>

      <p className={styles.sameLook}>{TEXT.sameLook}</p>

      <div className={styles.versionGrid}>
        {(["before", "after"] as const).map(v => {
          const r = results[v];
          return (
            <button key={v} type="button" className={styles.versionCard} data-version={v} onClick={() => onStart(v)}>
              <span className={styles.versionName}>{v === "before" ? TEXT.before : TEXT.after}</span>
              <span className={styles.versionSub}>{v === "before" ? TEXT.beforeSub : TEXT.afterSub}</span>
              {r && (
                <span className={styles.versionScore} data-success={r.success}>
                  {r.success ? `${fmtSec(r.ms)}${TEXT.seconds}` : TEXT.failed}
                </span>
              )}
              <span className={styles.versionStart}>{TEXT.start}</span>
            </button>
          );
        })}
      </div>
      {speechSupported === false && <p className={styles.note}>{TEXT.noSpeech}</p>}
    </section>
  );
}

function KeyHint({ cap, label }: { cap: string; label: string }) {
  return (
    <div className={styles.keyHint}>
      <kbd className={styles.kbd}>{cap}</kbd>
      <span>{label}</span>
    </div>
  );
}

function PadButton({ label, keyCap, onPress, primary }: { label: string; keyCap: string; onPress: () => void; primary?: boolean }) {
  return (
    <button
      type="button"
      className={styles.padBtn}
      data-primary={primary}
      aria-label={label}
      // キーボードの Enter は暗転中の操作に割り当てているので、ボタン自体はポインター操作用
      onPointerDown={e => { e.preventDefault(); onPress(); }}
    >
      <kbd className={styles.kbd}>{keyCap}</kbd>
      <span>{label}</span>
    </button>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      className={styles.toggle}
      aria-pressed={value}
      onPointerDown={e => { e.preventDefault(); onChange(!value); }}
    >
      {label}
    </button>
  );
}

// ── 結果: 暗闇の中の道すじ ────────────────────────────
function PathOverlay({ path }: { path: PathPoint[] }) {
  const d = useMemo(() => path.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" "), [path]);
  return (
    <svg className={styles.pathOverlay} aria-hidden="true">
      {path.length > 1 && <path className={styles.pathLine} d={d} pathLength={1} />}
      {path.map((p, i) => (
        <g key={i} className={styles.pathDot} data-kind={p.kind} style={{ animationDelay: `${Math.min(i * 60, 2400)}ms` }}>
          <circle cx={p.x} cy={p.y} r={9} />
          <text x={p.x} y={p.y + 4}>{i + 1}</text>
        </g>
      ))}
    </svg>
  );
}

function ResultPanel({ version, result, onRetry, onOther, onMenu, otherDone }: {
  version: Version;
  result: Result;
  onRetry: () => void;
  onOther: () => void;
  onMenu: () => void;
  otherDone: boolean;
}) {
  return (
    <section className={styles.result} aria-live="polite">
      <span className={styles.hudBadge}>{version === "before" ? TEXT.before : TEXT.after}</span>
      <p className={styles.resultHead} data-success={result.success}>
        <span className={styles.resultIcon} aria-hidden="true">{result.success ? "✓" : "✕"}</span>
        {result.success ? TEXT.success : TEXT.failed}
      </p>
      <dl className={styles.stats}>
        <div><dt>{TEXT.time}</dt><dd>{fmtSec(result.ms)}<small>{TEXT.seconds}</small></dd></div>
        <div><dt>{TEXT.movesLabel}</dt><dd>{result.moves}<small>{TEXT.movesUnit}</small></dd></div>
      </dl>
      <p className={styles.pathCaption}>{TEXT.pathCaption}</p>
      <ul className={styles.legend}>
        <li data-kind="control">{TEXT.controlLegend}</li>
        <li data-kind="content">{TEXT.contentLegend}</li>
        <li data-kind="miss">{TEXT.missLegend}</li>
      </ul>
      <div className={styles.resultActions}>
        {!otherDone && <button type="button" className={styles.primaryBtn} onClick={onOther}>{TEXT.tryOther}</button>}
        <button type="button" className={styles.secondaryBtn} onClick={onRetry}>{TEXT.retry}</button>
        <button type="button" className={styles.secondaryBtn} onClick={onMenu}>{TEXT.back}</button>
      </div>
    </section>
  );
}

// ── くらべる ──────────────────────────────────────────
function Compare({ before, after }: { before: Result; after: Result }) {
  // 注文できなかった側は時間の比較にならないので、棒は端まで伸ばし「たどり着けず」と示す
  const max = Math.max(...[before, after].filter(r => r.success).map(r => r.ms), 1);
  const rows: { v: Version; r: Result }[] = [{ v: "before", r: before }, { v: "after", r: after }];
  return (
    <section className={styles.compare}>
      <h2 className={styles.compareTitle}>{TEXT.compare}</h2>
      {rows.map(({ v, r }) => (
        <div key={v} className={styles.compareRow}>
          <span className={styles.compareName}>{v === "before" ? TEXT.before : TEXT.after}</span>
          <div className={styles.compareTrack}>
            <div
              className={styles.compareBar}
              data-version={v}
              data-success={r.success}
              style={{ width: r.success ? `${(r.ms / max) * 100}%` : "100%" }}
            />
          </div>
          <span className={styles.compareValue} data-success={r.success}>
            {r.success ? `${fmtSec(r.ms)}${TEXT.seconds}` : TEXT.notReached}
          </span>
        </div>
      ))}
    </section>
  );
}
