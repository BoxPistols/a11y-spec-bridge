# SpecBridge

> 仕様を根拠に、判断できる

WCAG 2.2 / WAI-ARIA / MDN の仕様に基づいてデザインとエンジニアリングの判断を支援する RAG ツール。

## コンセプト

デザイナーが「ブラウザの実態を知らないままワイヤーを作る」課題を解消する。
仕様書を根拠に「なぜこう設計するか」を説明できるようにする。

## スタック

| 役割 | 技術 |
|------|------|
| フロント | Next.js 15 App Router |
| Embedding | OpenAI text-embedding-3-small |
| VectorDB | Upstash Vector（永続化） |
| LLM | gpt-6-luna / gemini-3.5-flash-lite |
| デプロイ | Vercel |

## セットアップ

```bash
npm install
cp .env.local.example .env.local
# .env.local に APIキーを記入
```

## ナレッジベース構築（初回のみ）

```bash
# Step 1: MDN / WCAG / WAI-ARIA をクロールして docs/*.jsonl に保存
npm run crawl

# Step 2: Upstash Vector に埋め込み（約10〜20分）
npm run seed

# または一括実行
npm run crawl:seed
```

## 開発サーバー起動

```bash
npm run dev
# → http://localhost:3000
```

## Vercel デプロイ

```bash
npx vercel
```

環境変数（Vercel ダッシュボード）:
- `OPENAI_API_KEY`
- `GOOGLE_API_KEY`
- `UPSTASH_VECTOR_REST_URL`
- `UPSTASH_VECTOR_REST_TOKEN`

## ドキュメント構成（2層）

```
Layer 1 — 事前埋め込み済み（npm run crawl:seed で構築）
  MDN Web Docs    : HTML要素・ARIA属性・CSS・フォーカス
  WCAG 2.2        : 達成基準ごとの Understanding ドキュメント
  WAI-ARIA APG    : UIパターンごとのキーボード・ARIA要件

Layer 2 — ユーザーが追加（UIからPDF/TXT/MD投入）
  自社デザインシステムガイドライン
  コンポーネント使い分けルール など
```

## ロール別回答の違い

| ロール | 回答スタイル |
|--------|-------------|
| Designer | デザイン判断への影響・仕様をデザイン要件として表現 |
| Engineer | 実装詳細・ARIAコード例・ブラウザ互換性 |

## 回答モード

| モード | スタイル |
|--------|---------|
| ⚡ クイック（デフォルト） | 1行目に ✅/❌/⚠️ の判定。8行以内 + コード1つ + 根拠1行。「詳しく展開」ボタンで深掘り可 |
| 📖 じっくり | Good/Bad 視覚例・仕様引用込みの解説 |

## ワークフロー連携エクスポート

会話から、普段の業務にそのまま流し込めるファイルをワンクリック生成（LLM 不使用・即時）:

- **ビジネス根拠資料** — WCAG 要件を法的リスク（障害者差別解消法 2024 改正・EAA）・ユーザー到達率・放置コストの言語に翻訳。要件定義・ステークホルダー説明用
- **受け入れ基準** — チケット/PBI の Done 定義に貼れるチェックリスト。専門知識なしで検証できる手順つき
- **DESIGN.md** — 設計判断ログ + WCAG チェックリスト + 根拠リンク
- **Claude Code Skill** (`.claude/skills/a11y-review/SKILL.md`) — AI コーディング時に a11y レビューが自動で効く
- **サブエージェント定義** (`.claude/agents/a11y-reviewer.md`) — a11y 専門レビュアー
- **CLAUDE.md 追記** — 全 AI 作業に a11y 要件を暗黙で乗せる

会話中に引用された WCAG 番号 / ARIA 属性は L3 検証辞書と照合済みのものだけが採用されるため、捏造された基準がチームのルールに混入しない。詳細は `docs/UX-REDESIGN.md` を参照。
