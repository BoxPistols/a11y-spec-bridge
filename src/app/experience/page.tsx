"use client";
// 暗転チャレンジ: 画面を真っ暗にして、読み上げだけでピザを注文する。
// 見た目が同じ「よくある画面（対応前）」と「やさしい画面（対応後）」で挑戦し、
// かかった時間・操作の回数・暗闇の中の道すじ・「きこえたこと」と「ほんとうは」を比べる。
// 子どもでも遊べるように、言葉はやさしく短くし、説明は絵・数字・色で見せる

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import styles from "./experience.module.css";
import { OrderAfter, OrderBefore, type PizzaSize } from "./OrderScreens";
import { READER_TEXT, useReaderSession, type PathPoint } from "./useReaderSession";
import { heardRows, isUnclear, starsOf, type PlayResult } from "./scoring";

type Version = "before" | "after";
type Phase = "menu" | "playing" | "result";

type Result = PlayResult;

const GOAL_SIZE: PizzaSize = "M";
const GOAL_QTY = 2;
const TIME_LIMIT_MS = 120_000;
const QTY_MIN = 1;
const QTY_MAX = 9;
// ピザが届く演出の長さ
const DELIVERY_MS = 2600;
const CONFETTI_COUNT = 14;

const TEXT = {
  home: "SpecBridge に戻る",
  goal: "ゴール",
  goalValueLines: ["M サイズを", "2まい"],
  before: "よくある画面",
  after: "やさしい画面",
  beforeSub: "ボタンに 名前が ない作り",
  afterSub: "アクセシビリティ対応ずみ",
  start: "くらくして スタート",
  sameLook: "2つの画面は 見た目が おなじ。ちがうのは 中身だけ",
  keys: "つかうキー",
  keyNext: "つぎ",
  keyPrev: "まえ",
  keyEnter: "えらぶ",
  keyTab: "ボタンだけ",
  keyRepeat: "もう一度",
  keyQuit: "やめる",
  moreKeys: "ほかのキー",
  ripple: "ひかり",
  caption: "じまく",
  noSpeech: "このブラウザは 読み上げが つかえません。じまくで あそべます。",
  success: "ちゅうもん できた！",
  failed: "ちゅうもん できなかった",
  seconds: "びょう",
  movesUnit: "回",
  time: "じかん",
  movesLabel: "おした回数",
  tryOther: "もう一つの画面で あそぶ",
  retry: "もう一度",
  back: "さいしょへ",
  compare: "くらべてみよう",
  pathCaption: "くらやみで うごいた みち",
  wrongOrder: "サイズか まい数が ちがいます。M サイズを 2まいに してね。",
  noSize: "サイズを えらんでね。",
  orderedVoice: "ちゅうもん できました",
  timeUpVoice: "じかん ぎれ。あかりを つけるよ",
  quitVoice: "あかりを つけるよ",
  notReached: "とどかず",
  missLegend: "なにも おきない",
  controlLegend: "ボタン",
  contentLegend: "文字・絵",
  heard: "きこえたこと",
  seen: "ほんとうは",
  verdictBefore: "わるいのは きみじゃない。画面が おしえて くれなかった",
  verdictAfterOk: "画面が ちゃんと おしえて くれた",
  verdictAfterNg: "画面は おしえて くれていた。もう一度 ためそう",
  unclearCount: (n: number, total: number) => `${total}こ 中 ${n}こ が わからない ことば`,
  delivered: "おまたせしました！",
  starsLabel: (n: number) => `ほし ${n}こ`,
} as const;

const fmtSec = (ms: number) => (ms / 1000).toFixed(1);

// ふりがな
function Rb({ children, rt }: { children: ReactNode; rt: string }) {
  return <ruby>{children}<rt>{rt}</rt></ruby>;
}

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
  const [delivering, setDelivering] = useState(false);
  const startedAt = useRef(0);
  // 終了処理は 1 回の挑戦につき 1 回だけ（時間切れの判定とキー操作が重なっても結果を上書きしない）
  const finishedRef = useRef(false);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const sinkRef = useRef<HTMLDivElement | null>(null);

  const session = useReaderSession(stageRef, phase === "playing");
  const { speech, ensure, ping, jingle, moves, path, ripple, move, activate, repeat, reset } = session;

  const finish = useCallback((success: boolean, reason: "order" | "timeup" | "quit" = success ? "order" : "quit") => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    const ms = Date.now() - startedAt.current;
    setResults(r => ({ ...r, [version]: { success, ms, moves, path } }));
    setPhase("result");
    if (success) {
      jingle();
      speech.speak(TEXT.orderedVoice);
      setDelivering(true);
    } else {
      ping(0.5, 0.5, "error");
      speech.speak(reason === "timeup" ? TEXT.timeUpVoice : TEXT.quitVoice);
    }
  }, [version, moves, path, ping, jingle, speech]);

  // ピザが届く演出は一定時間で消し、道すじが見えるようにする
  useEffect(() => {
    if (!delivering) return;
    const id = window.setTimeout(() => setDelivering(false), DELIVERY_MS);
    return () => window.clearTimeout(id);
  }, [delivering]);

  const begin = useCallback((v: Version) => {
    setVersion(v);
    setSize(null);
    setQty(QTY_MIN);
    setError("");
    setDelivering(false);
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
  const versionName = (v: Version) => (v === "before" ? TEXT.before : TEXT.after);

  return (
    <div className={styles.page} data-phase={phase}>
      <header className={styles.header}>
        <Link href="/" className={styles.homeLink}>← {TEXT.home}</Link>
        <h1 className={styles.title}><Rb rt="あんてん">暗転</Rb>チャレンジ</h1>
        <p className={styles.lead}>
          {/* ふりがなが親字より長いと字間が開くので、長いものはかなで書く */}
          <Rb rt="がめん">画面</Rb>を 見ないで、<Rb rt="おと">音</Rb>だけで ピザを ちゅうもん できるかな
        </p>
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
              {phase === "result" && current && !delivering && <PathOverlay path={current.path} />}
              {phase === "result" && delivering && <Delivery />}
            </div>
          </div>

          {phase === "result" && current && (
            <ResultPanel
              versionLabel={versionName(version)}
              result={current}
              onRetry={() => begin(version)}
              onOther={() => begin(other)}
              onMenu={() => setPhase("menu")}
              otherDone={!!results[other]}
            />
          )}

          {phase === "result" && current && (
            <HeardVsSeen version={version} result={current} />
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
          <div ref={sinkRef} tabIndex={-1} className={styles.sink} aria-label="暗転チャレンジ" />
          <div className={styles.hud}>
            <div className={styles.hudTop}>
              <span className={styles.hudBadge}>{versionName(version)}</span>
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
              <PadButton label={TEXT.keyRepeat} keyCap="R" onPress={repeat} small />
              <PadButton label={TEXT.keyQuit} keyCap="Esc" onPress={() => finish(false)} small />
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
      <div className={styles.menuTop}>
        <div className={styles.goalCard}>
          <span className={styles.goalLabel}>{TEXT.goal}</span>
          {/* eslint-disable-next-line @next/next/no-img-element -- 装飾の小さな画像 */}
          <img src="/experience/pizza_0291.svg" alt="" width={64} height={64} />
          <span className={styles.goalValue}>
            {TEXT.goalValueLines.map(l => <span key={l} className={styles.nowrap}>{l}</span>)}
          </span>
        </div>

        {/* 主に使う 3 つのキーだけを大きく見せ、ほかは小さくまとめる */}
        <div className={styles.keysCard} aria-label={TEXT.keys}>
          <div className={styles.keysMain}>
            <KeyHint cap="↓" label={TEXT.keyNext} big />
            <KeyHint cap="↑" label={TEXT.keyPrev} big />
            <KeyHint cap="Enter" label={TEXT.keyEnter} big />
          </div>
          <div className={styles.keysMore}>
            <span className={styles.keysMoreLabel}>{TEXT.moreKeys}</span>
            <KeyHint cap="Tab" label={TEXT.keyTab} />
            <KeyHint cap="R" label={TEXT.keyRepeat} />
            <KeyHint cap="Esc" label={TEXT.keyQuit} />
          </div>
        </div>
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
                  {r.success && <Stars count={starsOf(r)} small />}
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

function KeyHint({ cap, label, big }: { cap: string; label: string; big?: boolean }) {
  return (
    <div className={styles.keyHint} data-big={big}>
      <kbd className={styles.kbd}>{cap}</kbd>
      <span>{label}</span>
    </div>
  );
}

function PadButton({ label, keyCap, onPress, primary, small }: {
  label: string;
  keyCap: string;
  onPress: () => void;
  primary?: boolean;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      className={styles.padBtn}
      data-primary={primary}
      data-small={small}
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

// ── 星 ────────────────────────────────────────────────
function Stars({ count, small }: { count: number; small?: boolean }) {
  return (
    <span className={styles.stars} data-small={small} role="img" aria-label={TEXT.starsLabel(count)}>
      {[0, 1, 2].map(i => (
        <svg key={i} viewBox="0 0 24 24" className={styles.star} data-on={i < count} style={{ animationDelay: `${300 + i * 180}ms` }} aria-hidden="true">
          <path d="M12 2.6l2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 17.2l-5.9 3.2 1.3-6.5L2.5 9.4l6.6-.8z" />
        </svg>
      ))}
    </span>
  );
}

// ── ピザが届く演出 ────────────────────────────────────
function Delivery() {
  return (
    <div className={styles.delivery} aria-hidden="true">
      <div className={styles.deliveryBox}>
        {/* eslint-disable-next-line @next/next/no-img-element -- 装飾の小さな画像 */}
        <img src="/experience/pizza_0291.svg" alt="" width={110} height={110} className={styles.deliveryPizza} />
        {/* eslint-disable-next-line @next/next/no-img-element -- 装飾の小さな画像 */}
        <img src="/experience/pizza_0291.svg" alt="" width={110} height={110} className={styles.deliveryPizza} />
      </div>
      <span className={styles.deliveryText}>{TEXT.delivered}</span>
      {Array.from({ length: CONFETTI_COUNT }, (_, i) => (
        <span key={i} className={styles.confetti} data-i={i % 4} style={{ left: `${6 + i * 6.6}%`, animationDelay: `${(i % 5) * 90}ms` }} />
      ))}
    </div>
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

function ResultPanel({ versionLabel, result, onRetry, onOther, onMenu, otherDone }: {
  versionLabel: string;
  result: Result;
  onRetry: () => void;
  onOther: () => void;
  onMenu: () => void;
  otherDone: boolean;
}) {
  return (
    <section className={styles.result} aria-live="polite">
      <span className={styles.hudBadge}>{versionLabel}</span>
      <p className={styles.resultHead} data-success={result.success}>
        <span className={styles.resultIcon} aria-hidden="true">{result.success ? "✓" : "✕"}</span>
        {result.success ? TEXT.success : TEXT.failed}
      </p>
      <Stars count={starsOf(result)} />
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

// ── きこえたこと と ほんとうは ──────────────────────────
// 読み上げで聞こえた言葉と、画面上の実物を並べる。分からない言葉は赤で示し、
// うまくいかなかったのは遊んだ人のせいではなく、画面の作りのせいだと一目で分かるようにする
function HeardVsSeen({ version, result }: { version: Version; result: Result }) {
  const rows = heardRows(result.path);
  const unclear = rows.filter(isUnclear).length;
  const verdict = version === "before"
    ? TEXT.verdictBefore
    : result.success ? TEXT.verdictAfterOk : TEXT.verdictAfterNg;
  return (
    <section className={styles.heard} data-version={version}>
      <p className={styles.heardVerdict}>{verdict}</p>
      {rows.length > 0 && (
        <>
          <p className={styles.heardCount} data-bad={unclear > 0}>{TEXT.unclearCount(unclear, rows.length)}</p>
          <table className={styles.heardTable}>
            <thead>
              <tr>
                <th scope="col"><span aria-hidden="true" className={styles.heardIcon}>👂</span>{TEXT.heard}</th>
                <th scope="col"><span aria-hidden="true" className={styles.heardIcon}>👀</span>{TEXT.seen}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p, i) => (
                <tr key={i} data-unclear={isUnclear(p)}>
                  <td>{p.kind === "miss" ? `${p.label} → ${READER_TEXT.noReaction}` : p.label}</td>
                  <td>{p.seen}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}

// ── くらべる ──────────────────────────────────────────
function Compare({ before, after }: { before: Result; after: Result }) {
  // 注文できなかった側は時間の比較にならないので、棒は端まで伸ばし「とどかず」と示す
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
          <Stars count={starsOf(r)} small />
        </div>
      ))}
    </section>
  );
}
