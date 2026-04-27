// WCAG 2.0/2.1/2.2 達成基準（Success Criteria）辞書
// L3 Stage 2 検証で LLM 出力中の WCAG 番号を照合し、捏造番号を検出する用途
// canonical: https://www.w3.org/TR/WCAG22/

export type WcagSC = {
  id: string; // "1.1.1" 形式
  level: "A" | "AA" | "AAA";
  title: string; // 日本語名
  added?: "2.1" | "2.2"; // 追加バージョン（未指定なら 2.0 から）
};

export const WCAG_SC: ReadonlyArray<WcagSC> = [
  // 1. Perceivable
  { id: "1.1.1", level: "A", title: "非テキストコンテンツ" },
  { id: "1.2.1", level: "A", title: "音声のみおよび映像のみ（収録済）" },
  { id: "1.2.2", level: "A", title: "キャプション（収録済）" },
  { id: "1.2.3", level: "A", title: "音声解説またはメディアの代替（収録済）" },
  { id: "1.2.4", level: "AA", title: "キャプション（ライブ）" },
  { id: "1.2.5", level: "AA", title: "音声解説（収録済）" },
  { id: "1.2.6", level: "AAA", title: "手話（収録済）" },
  { id: "1.2.7", level: "AAA", title: "拡張音声解説（収録済）" },
  { id: "1.2.8", level: "AAA", title: "メディアの代替（収録済）" },
  { id: "1.2.9", level: "AAA", title: "音声のみ（ライブ）" },
  { id: "1.3.1", level: "A", title: "情報及び関係性" },
  { id: "1.3.2", level: "A", title: "意味のある順序" },
  { id: "1.3.3", level: "A", title: "感覚的な特徴" },
  { id: "1.3.4", level: "AA", title: "表示の向き", added: "2.1" },
  { id: "1.3.5", level: "AA", title: "入力目的の特定", added: "2.1" },
  { id: "1.3.6", level: "AAA", title: "目的の特定", added: "2.1" },
  { id: "1.4.1", level: "A", title: "色の使用" },
  { id: "1.4.2", level: "A", title: "音声制御" },
  { id: "1.4.3", level: "AA", title: "コントラスト（最低限）" },
  { id: "1.4.4", level: "AA", title: "テキストのサイズ変更" },
  { id: "1.4.5", level: "AA", title: "文字画像" },
  { id: "1.4.6", level: "AAA", title: "コントラスト（高度）" },
  { id: "1.4.7", level: "AAA", title: "小さな背景音、又は背景音なし" },
  { id: "1.4.8", level: "AAA", title: "視覚的提示" },
  { id: "1.4.9", level: "AAA", title: "文字画像（例外なし）" },
  { id: "1.4.10", level: "AA", title: "リフロー", added: "2.1" },
  { id: "1.4.11", level: "AA", title: "非テキストコントラスト", added: "2.1" },
  { id: "1.4.12", level: "AA", title: "テキストの間隔", added: "2.1" },
  { id: "1.4.13", level: "AA", title: "ホバー又はフォーカスで表示されるコンテンツ", added: "2.1" },

  // 2. Operable
  { id: "2.1.1", level: "A", title: "キーボード" },
  { id: "2.1.2", level: "A", title: "フォーカスを移動できる" },
  { id: "2.1.3", level: "AAA", title: "キーボード（例外なし）" },
  { id: "2.1.4", level: "A", title: "文字キーのショートカット", added: "2.1" },
  { id: "2.2.1", level: "A", title: "タイミング調整可能" },
  { id: "2.2.2", level: "A", title: "一時停止、停止、非表示" },
  { id: "2.2.3", level: "AAA", title: "タイミング非依存" },
  { id: "2.2.4", level: "AAA", title: "中断" },
  { id: "2.2.5", level: "AAA", title: "再認証" },
  { id: "2.2.6", level: "AAA", title: "タイムアウト", added: "2.1" },
  { id: "2.3.1", level: "A", title: "3 回の閃光、又は閾値以下" },
  { id: "2.3.2", level: "AAA", title: "3 回の閃光" },
  { id: "2.3.3", level: "AAA", title: "アニメーション（インタラクションによる）", added: "2.1" },
  { id: "2.4.1", level: "A", title: "ブロック・スキップ" },
  { id: "2.4.2", level: "A", title: "ページタイトル" },
  { id: "2.4.3", level: "A", title: "フォーカス順序" },
  { id: "2.4.4", level: "A", title: "リンクの目的（コンテキスト内）" },
  { id: "2.4.5", level: "AA", title: "複数の手段" },
  { id: "2.4.6", level: "AA", title: "見出し及びラベル" },
  { id: "2.4.7", level: "AA", title: "フォーカスの可視化" },
  { id: "2.4.8", level: "AAA", title: "現在位置" },
  { id: "2.4.9", level: "AAA", title: "リンクの目的（リンクのみ）" },
  { id: "2.4.10", level: "AAA", title: "セクション見出し" },
  { id: "2.4.11", level: "AA", title: "フォーカスの可視化（最低限）", added: "2.2" },
  { id: "2.4.12", level: "AAA", title: "フォーカスの可視化（高度）", added: "2.2" },
  { id: "2.4.13", level: "AAA", title: "フォーカスの外観", added: "2.2" },
  { id: "2.5.1", level: "A", title: "ポインタジェスチャ", added: "2.1" },
  { id: "2.5.2", level: "A", title: "ポインタのキャンセル", added: "2.1" },
  { id: "2.5.3", level: "A", title: "名前（ラベル）", added: "2.1" },
  { id: "2.5.4", level: "A", title: "動きによる起動", added: "2.1" },
  { id: "2.5.5", level: "AAA", title: "ターゲットのサイズ", added: "2.1" },
  { id: "2.5.6", level: "AAA", title: "入力メカニズムの同時利用", added: "2.1" },
  { id: "2.5.7", level: "AA", title: "ドラッグ操作", added: "2.2" },
  { id: "2.5.8", level: "AA", title: "ターゲットのサイズ（最低限）", added: "2.2" },

  // 3. Understandable
  { id: "3.1.1", level: "A", title: "ページの言語" },
  { id: "3.1.2", level: "AA", title: "一部分の言語" },
  { id: "3.1.3", level: "AAA", title: "一般的でない用語" },
  { id: "3.1.4", level: "AAA", title: "略語" },
  { id: "3.1.5", level: "AAA", title: "読解レベル" },
  { id: "3.1.6", level: "AAA", title: "発音" },
  { id: "3.2.1", level: "A", title: "フォーカス時" },
  { id: "3.2.2", level: "A", title: "入力時" },
  { id: "3.2.3", level: "AA", title: "一貫したナビゲーション" },
  { id: "3.2.4", level: "AA", title: "一貫した識別性" },
  { id: "3.2.5", level: "AAA", title: "要求による変化" },
  { id: "3.2.6", level: "A", title: "一貫したヘルプ", added: "2.2" },
  { id: "3.3.1", level: "A", title: "エラーの特定" },
  { id: "3.3.2", level: "A", title: "ラベル又は説明" },
  { id: "3.3.3", level: "AA", title: "エラー修正の提案" },
  { id: "3.3.4", level: "AA", title: "エラー回避（法的、金融、データ）" },
  { id: "3.3.5", level: "AAA", title: "ヘルプ" },
  { id: "3.3.6", level: "AAA", title: "エラー回避（すべて）" },
  { id: "3.3.7", level: "A", title: "冗長な入力", added: "2.2" },
  { id: "3.3.8", level: "AA", title: "アクセシブルな認証（最低限）", added: "2.2" },
  { id: "3.3.9", level: "AAA", title: "アクセシブルな認証（高度）", added: "2.2" },

  // 4. Robust
  { id: "4.1.1", level: "A", title: "構文解析（廃止）" },
  { id: "4.1.2", level: "A", title: "名前（name）、役割（role）、値（value）" },
  { id: "4.1.3", level: "AA", title: "ステータスメッセージ", added: "2.1" },
];

export const WCAG_SC_IDS: ReadonlySet<string> = new Set(WCAG_SC.map(sc => sc.id));
