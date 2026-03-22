# SpecBridge — Vercel デプロイ手順

## 前提

- GitHubアカウント
- Vercelアカウント（GitHub連携済み）
- Upstash アカウント（Vector Index作成済み）
- OpenAI APIキー
- Google APIキー（Gemini使用時）

---

## Step 1 — Upstash Vector Index を作成

1. https://console.upstash.com にログイン
2. **Vector** → **Create Index** をクリック
3. 以下の設定で作成:

   | 項目 | 値 |
   |------|-----|
   | Name | `specbridge` （任意） |
   | **Dimensions** | **1536** ← 必須 |
   | **Metric** | **COSINE** ← 必須 |
   | Region | `us-east-1` または近いリージョン |

4. 作成後、**REST URL** と **REST Token** をコピーして控えておく

---

## Step 2 — ナレッジベース構築（ローカルで1回だけ実行）

```bash
cp .env.local.example .env.local
```

`.env.local` を編集:

```
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=AIza...           # Gemini使用時のみ
UPSTASH_VECTOR_REST_URL=https://...
UPSTASH_VECTOR_REST_TOKEN=AXxx...
```

クロール → 埋め込み を実行:

```bash
npm run crawl        # MDN/WCAG/WAI-ARIA取得 → docs/*.jsonl （数分）
npm run seed         # Upstashに一括投入 （10〜20分）
```

> **注意**: `docs/` は `.gitignore` に含まれているので
> コミットされません。Upstashに入ったら不要です。

---

## Step 3 — GitHub にプッシュ

```bash
git init
git add .
git commit -m "feat: initial SpecBridge"

# GitHub で新規リポジトリを作成してから:
git remote add origin https://github.com/<あなたのID>/specbridge.git
git push -u origin main
```

`.env.local` は `.gitignore` に含まれているので
**絶対にコミットされません**。

---

## Step 4 — Vercel にデプロイ

### 方法A: Vercel CLI（推奨）

```bash
npx vercel login       # 初回のみ
npx vercel             # プレビューデプロイ
npx vercel --prod      # 本番デプロイ
```

### 方法B: Vercel ダッシュボード

1. https://vercel.com/new にアクセス
2. **Import Git Repository** → specbridge を選択
3. **Framework Preset**: Next.js（自動検出）
4. **Deploy** をクリック（環境変数は次のStepで設定）

---

## Step 5 — 環境変数を設定

Vercel ダッシュボード → プロジェクト → **Settings** → **Environment Variables**

| Name | Value | Environments |
|------|-------|-------------|
| `OPENAI_API_KEY` | `sk-...` | Production, Preview |
| `GOOGLE_API_KEY` | `AIza...` | Production, Preview |
| `UPSTASH_VECTOR_REST_URL` | `https://...` | Production, Preview |
| `UPSTASH_VECTOR_REST_TOKEN` | `AXxx...` | Production, Preview |

設定後 **Redeploy** を実行。

> **Vercel × Upstash Integration を使う場合**
> Vercel ダッシュボード → **Integrations** → **Upstash** を追加すると
> `UPSTASH_VECTOR_REST_URL` / `UPSTASH_VECTOR_REST_TOKEN` が
> 自動で注入されます（手動入力不要）。

---

## Step 6 — 動作確認

デプロイ後の URL（例: `https://specbridge.vercel.app`）にアクセスして確認:

- [ ] サイドバーに `X vectors` と表示される
- [ ] 質問を入力して回答が返る
- [ ] ソースカードに MDN / WCAG / WAI-ARIA が表示される
- [ ] カスタムPDFをアップロードして質問できる

---

## 継続的デプロイ

GitHub の `main` ブランチにプッシュするたびに自動でデプロイされます。

```bash
git add .
git commit -m "fix: ..."
git push   # → Vercel が自動でビルド & デプロイ
```

---

## トラブルシューティング

| 症状 | 原因 | 対処 |
|------|------|------|
| `0 vectors` と表示 | Upstash未設定 or シード未実行 | Step 1-2 を確認 |
| API error 500 | 環境変数が未設定 | Step 5 を再確認 |
| ビルドエラー | `scripts/` の型エラー | `tsconfig.json` の exclude を確認 |
| Timeout (30s超) | 大きなPDF取り込み | `vercel.json` の `maxDuration` を60に変更 |
