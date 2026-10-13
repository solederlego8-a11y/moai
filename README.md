# MOAI — 無料のAIマーケティング司令室

**AIマーケティング運用ツールと同じことを、無料で。**

複数のメディア（ブログ・Instagram・X・YouTube など）の運用を、ひとつの画面で管理するツールです。
やることの整理、AIへの依頼、生成物の確認と承認、実績の記録までを1か所にまとめます。

同じ用途の商用ツールは月 1万〜7万円ほどしますが、MOAI は **完全無料** です。
サーバー代も、月額料金も、アカウント登録も要りません。

**▶ [いますぐ使う（インストール不要）](https://solederlego8-a11y.github.io/moai/)**

---

## 2つの使い方

MOAI には2つのモードがあり、同じ画面がそのまま動きます。

| | ブラウザ版 | ローカル版 |
|---|---|---|
| 使い方 | URLを開くだけ | 自分のPCにダウンロードして起動 |
| インストール | 不要 | Node.js が必要 |
| データの保存先 | そのブラウザの中 | 自分のPCのファイル（`data/*.json`） |
| AIが自動で実行 | ✕（指示をコピーしてAIに貼る） | ○（画面のボタンひとつ） |
| 費用 | 無料 | 無料 |

まずブラウザ版で触ってみて、気に入ったらローカル版へ。データは書き出し・読み込みで引っ越せます。

---

## 何ができるか

| 画面 | できること |
|---|---|
| **ダッシュボード** | 全チャネルの数字を一望。フォロワー・PV・収益の推移をグラフで確認 |
| **AIチーム** | SEOリサーチャー、ライター、競合アナリストなど8人のAI担当者に仕事を依頼 |
| **承認キュー** | AIが作ったものを読んで、承認 / 差し戻し（修正指示つき）/ 却下 |
| **タスク** | 待機 → 実行中 → 承認待ち → 承認済み → 公開済み のカンバンと履歴 |
| **指示する** | 日本語で書くだけ。担当と対象チャネルを選んでキューに積む |
| **チャネル** | 運用メディアの登録と、日々の実績の記録 |
| **カレンダー** | いつ何を出すかの計画 |
| **レポート** | 週次分析・競合調査の保管場所 |
| **設定** | ブランドの前提・禁止ワード・運用ルール。AIへの指示に毎回引き継がれます |

---

## ブラウザ版の使い方

1. [https://solederlego8-a11y.github.io/moai/](https://solederlego8-a11y.github.io/moai/) を開く
2. 「チャネル」で運用しているメディアを登録する
3. 「設定」でミッションとトーンを書く（AIへの指示に毎回付きます）
4. 「指示する」でやってほしいことを日本語で書く
5. 「キューをまとめてコピー」を押し、ChatGPT や Claude に貼り付ける
6. 返ってきた内容を「承認キュー」に貼って、確認 → 承認

> データはあなたのブラウザの中だけに保存され、外部には一切送信されません。
> ただし**ブラウザの履歴やサイトデータを消すと一緒に消えます**。設定画面から定期的に書き出してください。

---

## ローカル版の使い方（AIが自動で実行する）

### 必要なもの

- [Node.js](https://nodejs.org/)（無料）
- [Claude Code](https://claude.com/claude-code)（AIに自動実行させる場合）

### 手順

```bash
git clone https://github.com/solederlego8-a11y/moai.git
cd moai
node server.js
```

→ ブラウザで http://localhost:4173 を開く。停止は Ctrl + C。

Windows なら `start-moai.bat` をダブルクリックするだけでも起動します。

### AIチームを入れる

同梱のスキルとエージェントを Claude Code に読ませます。

```bash
# Windows
xcopy /E /I claude-code\skills\moai "%USERPROFILE%\.claude\skills\moai"
xcopy /E /I claude-code\agents "%USERPROFILE%\.claude\agents"

# macOS / Linux
cp -r claude-code/skills/moai ~/.claude/skills/
cp -r claude-code/agents/* ~/.claude/agents/
```

### 最初に1回だけ：ログイン

MOAI は画面のボタンから Claude Code を起動します。そのために、一度だけログインしておきます。

**Windows**: `login-claude.bat` をダブルクリック
**macOS / Linux**: `node login.js`

ブラウザが開くので「許可（Authorize）」を押すだけです。終わると画面に `✔ ログイン済み` と出ます。

> デスクトップアプリでログイン済みでも、この手順は別途必要です。
> アプリは自分の中に認証を持っていて、外部から起動したAIには渡さないためです。
> 状態は `node login.js --status` でいつでも確認できます。

### 実行する

「指示する」画面の **「▶ AIに実行させる」** を押すだけです。
AIが何をしているか（どのツールを使い、何を調べているか）が画面にそのまま出ます。

生成物は「承認キュー」に戻ってくるので、読んでから承認します。
**承認していないものが勝手に公開されることはありません。**

Claude Code のターミナルから `/moai` と打っても同じことができます。

#### 権限のプリセット

| プリセット | 内容 |
|---|---|
| おまかせ（推奨） | `node` コマンドと調べもの・執筆だけを許可。既定 |
| すべて許可 | ブラウザ操作を伴う投稿まで任せる場合に選ぶ |

---

## よくある質問

**Q. 本当に無料ですか？**
はい。MOAI 自体に費用は一切かかりません。ソースコードも MIT ライセンスで公開しています。
AIに自動実行させる部分は、お使いのAIサービス（Claude Code など）の契約に依存します。

**Q. データはどこに送られますか？**
どこにも送られません。ブラウザ版はあなたのブラウザの中、ローカル版はあなたのPCのファイルに保存されます。
MOAI にサーバーはありません。

**Q. ブラウザ版でAIは動きますか？**
自動では動きません。指示をまとめてコピーする機能があるので、お使いのAIに貼り付けて使ってください。
自動実行が必要ならローカル版をお使いください。

**Q. スマホでも使えますか？**
画面は対応していますが、じっくり書く作業が多いのでパソコンを推奨します。

**Q. 自分用に改造していいですか？**
どうぞ。`docs/seed.js` を書き換えると初期データを変えられます。
`claude-code/agents/` にファイルを足せばAI担当者も増やせます。

---

## 構成

```
moai/
  docs/             ← Webアプリ本体（GitHub Pages が公開している場所）
    index.html
    app.js          画面とロジック（フレームワーク不使用）
    styles.css      ライト/ダーク両対応
    seed.js         初期テンプレートデータ
  server.js         ローカル版のサーバー（Node標準機能のみ・依存パッケージゼロ）
  cli.js            Claude Code からデータを安全に読み書きするCLI
  claude-code/      Claude Code 用のスキルとAIエージェント定義
  start-moai.bat    Windows用のワンクリック起動
  data/             あなたのデータ（Gitには含まれません）
```

依存パッケージはゼロです。`npm install` は不要です。

---

## ライセンス

MIT License. 自由に使い、改造し、再配布できます。

<!-- article-index:start -->
## MOAI 公開中のページ一覧

無料・オープンソースのAIマーケティング司令室。ブログで導入・運用の手順を解説しています。

サイト: https://solederlego8-a11y.github.io/moai/

### top
- [MOAI｜AIマーケティング司令室](https://solederlego8-a11y.github.io/moai/)

### blog
- [MOAI ブログ｜無料でAIマーケティングの運用を回す方法](https://solederlego8-a11y.github.io/moai/blog/)
- [AIマーケティングの運用ループを無料で回す手順｜計画→依頼→承認→投稿→計測](https://solederlego8-a11y.github.io/moai/blog/ai-marketing-unyo-loop-muryo.html)
- [ChatGPTでのSNS運用を無料で一元管理する方法｜前提・依頼・承認・実績を1か所に](https://solederlego8-a11y.github.io/moai/blog/chatgpt-sns-unyo-kanri-muryo.html)
- [SNS投稿の承認フローを無料で作る方法｜必要な3要素とチェックリスト](https://solederlego8-a11y.github.io/moai/blog/sns-toukou-shonin-flow-muryo.html)
- [Claude Codeでマーケティングを自動化するやり方｜導入5ステップと承認つき運用](https://solederlego8-a11y.github.io/moai/blog/claude-code-marketing-jidoka-yarikata.html)
- [AIマーケティングツールを無料・オープンソースで選ぶ基準｜5つの確認項目と導入手順](https://solederlego8-a11y.github.io/moai/blog/ai-marketing-tool-muryo-opensource.html)
- [NoimosAIの代替を無料で｜オープンソースで置き換えられる機能・できない機能](https://solederlego8-a11y.github.io/moai/blog/noimosai-daitai-muryo.html)
- [一人社長のマーケティング自動化を無料で始める｜週3時間で回す最小構成](https://solederlego8-a11y.github.io/moai/blog/hitori-shacho-marketing-jidoka-muryo.html)
- [AIでブログとSNSを同時に回す運用手順｜1本の記事から投稿文を作る週次フロー](https://solederlego8-a11y.github.io/moai/blog/blog-sns-doujiku-ai-unyo-tejun.html)
- [AIエージェントに任せてはいけないマーケティング業務｜人が残す5つの判断と線引き](https://solederlego8-a11y.github.io/moai/blog/ai-agent-marketing-makasete-ikenai-gyomu.html)
- [AIマーケティングツールを解約する前に書き出すデータ｜乗り換え前チェックリスト10項目](https://solederlego8-a11y.github.io/moai/blog/ai-marketing-tool-kaiyaku-mae-data-ikou.html)
- [AIマーケティングツールのデータ保存先を導入前に確認する方法｜ブラウザ版とローカル版の違い](https://solederlego8-a11y.github.io/moai/blog/ai-marketing-tool-data-hozonsaki-kakunin.html)
- [AIマーケティングツールは無料で足りる？有料に替える判断基準4つ](https://solederlego8-a11y.github.io/moai/blog/ai-marketing-tool-muryo-yuryo-hantei-hub.html)
- [MOAIをWindowsに入れる手順｜ブラウザ版とローカル版の始め方](https://solederlego8-a11y.github.io/moai/blog/moai-windows-donyu-tejun.html)
- [AIマーケティングを無料で始める本当の費用｜隠れコスト5項目](https://solederlego8-a11y.github.io/moai/blog/ai-marketing-muryo-kakureta-cost.html)
- [MOAIの設定の書き方｜ミッション・トーン・禁止ワードの例文つき](https://solederlego8-a11y.github.io/moai/blog/moai-settings-mission-tone-kakikata.html)
- [MOAIのAI担当者を増やす方法｜エージェント定義の追加と割り当て](https://solederlego8-a11y.github.io/moai/blog/moai-ai-tantosha-tsuika-customize.html)

<!-- article-index:end -->
