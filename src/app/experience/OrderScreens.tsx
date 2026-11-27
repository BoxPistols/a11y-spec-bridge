"use client";
// 暗転チャレンジで操作する注文画面。対応前と対応後は見た目をそろえ、コードの書き方だけを変える
// - 対応前: サイズは div にクリックを付けただけ、数量と注文はアイコンだけのボタン、画像に alt なし、エラーは色だけ
// - 対応後: ラジオボタン + label、ボタンに名前、画像に alt、数量の変化とエラーを読み上げ領域で知らせる

import styles from "./experience.module.css";

export type PizzaSize = "S" | "M" | "L";

export type OrderScreenProps = {
  size: PizzaSize | null;
  qty: number;
  error: string;
  onSize: (s: PizzaSize) => void;
  onQty: (delta: 1 | -1) => void;
  onOrder: () => void;
};

export const SIZES: readonly PizzaSize[] = ["S", "M", "L"];
export const UNIT_PRICE: Record<PizzaSize, number> = { S: 900, M: 1200, L: 1600 };
const PIZZA_SRC = "/experience/pizza_0291.svg";
const PIZZA_ALT = "マルゲリータ。トマトソースにモッツァレラとバジル";

const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;

function MinusIcon() {
  return <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>;
}
function PlusIcon() {
  return <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>;
}
function CartIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path d="M3 4h2l2.4 11.2a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.1L21 8H6.2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="9.5" cy="20" r="1.4" fill="currentColor" />
      <circle cx="17" cy="20" r="1.4" fill="currentColor" />
    </svg>
  );
}

// ── 対応前 ──────────────────────────────────────────
// 見た目は対応後と同じ。ただし支援技術に役割・名前・状態・変化が伝わらない
export function OrderBefore({ size, qty, error, onSize, onQty, onOrder }: OrderScreenProps) {
  const total = size ? UNIT_PRICE[size] * qty : 0;
  return (
    <div className={styles.shop}>
      <div className={styles.shopTitle}>ピザを注文</div>
      {/* eslint-disable-next-line @next/next/no-img-element -- alt なしが対応前の意図 */}
      <img className={styles.shopImage} src={PIZZA_SRC} width={160} height={160} />
      <div className={styles.shopName}>マルゲリータ</div>
      <div className={styles.shopRow}>
        {SIZES.map(s => (
          <div
            key={s}
            className={styles.sizeChip}
            data-selected={size === s}
            onClick={() => onSize(s)}
          >
            {s}
          </div>
        ))}
      </div>
      <div className={styles.shopRow}>
        <button type="button" className={styles.qtyBtn} onClick={() => onQty(-1)}><MinusIcon /></button>
        <div className={styles.qtyValue}>{qty}</div>
        <button type="button" className={styles.qtyBtn} onClick={() => onQty(1)}><PlusIcon /></button>
      </div>
      <div className={styles.total}>{yen(total)}</div>
      <button type="button" className={styles.orderBtn} data-error={!!error} onClick={onOrder}><CartIcon /></button>
      {/* 色だけのエラー表示。読み上げ領域ではないので支援技術には届かない */}
      <div className={styles.errorDot} data-show={!!error} />
    </div>
  );
}

// ── 対応後 ──────────────────────────────────────────
export function OrderAfter({ size, qty, error, onSize, onQty, onOrder }: OrderScreenProps) {
  const total = size ? UNIT_PRICE[size] * qty : 0;
  return (
    <div className={styles.shop}>
      <h1 className={styles.shopTitle}>ピザを注文</h1>
      {/* eslint-disable-next-line @next/next/no-img-element -- 静的な小さい画像のため next/image は使わない */}
      <img className={styles.shopImage} src={PIZZA_SRC} width={160} height={160} alt={PIZZA_ALT} />
      <div className={styles.shopName} aria-hidden="true">マルゲリータ</div>
      <fieldset className={styles.shopRow}>
        <legend className={styles.srOnly}>サイズ</legend>
        {SIZES.map(s => (
          <label key={s} className={styles.sizeChip} data-selected={size === s}>
            <input
              type="radio"
              name="size"
              className={styles.srOnly}
              checked={size === s}
              onChange={() => onSize(s)}
            />
            {s}
            {/* 見た目は S/M/L だけだが、読み上げでは「Mサイズ ¥1,200」と伝える */}
            <span className={styles.srOnly}>{`サイズ ${yen(UNIT_PRICE[s])}`}</span>
          </label>
        ))}
      </fieldset>
      <div className={styles.shopRow}>
        <button type="button" className={styles.qtyBtn} aria-label="1枚減らす" onClick={() => onQty(-1)}><MinusIcon /></button>
        <output className={styles.qtyValue} aria-live="polite" aria-label={`${qty}枚`}>{qty}</output>
        <button type="button" className={styles.qtyBtn} aria-label="1枚増やす" onClick={() => onQty(1)}><PlusIcon /></button>
      </div>
      <div className={styles.total} aria-hidden="true">{yen(total)}</div>
      <button
        type="button"
        className={styles.orderBtn}
        data-error={!!error}
        aria-label={size ? `${size}サイズ ${qty}枚を注文する 合計${yen(total)}` : `注文する サイズが未選択です`}
        onClick={onOrder}
      >
        <CartIcon />
      </button>
      <div className={styles.errorDot} data-show={!!error} role="alert">
        {error && <span className={styles.srOnly}>{error}</span>}
      </div>
    </div>
  );
}
