# Meal Project

LINE で食事名を送り、既存データがあれば即記録、なければ LIFF で補完して 1 日の集計を返す食事記録アプリです。

現在の構成は次のとおりです。

- フロント: GitHub Pages で公開する静的ファイル
- API / Webhook: Google Apps Script Web アプリ
- データ: スプレッドシート

## Directory

```text
.
├── index.html
├── html
│   ├── css
│   │   └── index-style.css
│   └── js
│       ├── app-actions.js
│       ├── app-render.js
│       ├── app-shared.js
│       └── site-config.js
└── gs
    ├── 0_core
    ├── 1_entry
    ├── 2_domain
    ├── 3_usecase
    ├── 4_ui
    ├── 5_infra
    ├── 6_web
    └── 7_setup
```

## Architecture

1. ユーザーが LINE でメニュー名を送信
2. GAS がスプレッドシートの栄養マスタを参照
3. 完全一致ならそのまま食事ログへ保存し、Flex で当日集計を返す
4. 未登録なら LIFF を案内
5. LIFF で栄養値を補完し、GAS API へ送信
6. GAS がマスタ更新、食事記録、再集計、LINE 返信を行う

## Frontend

GitHub Pages の公開入口は直下の [index.html](./index.html) です。

- スタイル: [html/css/index-style.css](./html/css/index-style.css)
- 動作:
  - [html/js/app-shared.js](./html/js/app-shared.js)
  - [html/js/app-render.js](./html/js/app-render.js)
  - [html/js/app-actions.js](./html/js/app-actions.js)
- 環境依存値: [html/js/site-config.js](./html/js/site-config.js)

`site-config.js` では次を持たせます。

- `appVersion`
- `appCommit`
- `initialLiffId`
- `apiBaseUrl`

例:

```js
window.__MEAL_APP_CONFIG__ = Object.assign({}, window.__MEAL_APP_CONFIG__ || {}, {
  appVersion: '2026-05-22-1',
  appCommit: '698863f',
  initialLiffId: 'YOUR_LIFF_ID',
  apiBaseUrl: 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec'
});
```

デバッグ欄の `version / commit` はこの値を表示します。更新前に次を実行すると、現在の git commit に合わせて書き換えられます。

```sh
./scripts/update-site-version.sh
```

## GAS

GAS 側はフロント配信を行わず、API と LINE webhook だけを担当します。

主な入口:

- [gs/6_web/6_webapp.gs](./gs/6_web/6_webapp.gs)
  - `doGet`: ヘルス確認用 JSON
  - `doPost`: API / webhook 受付

利用アクション:

- `getLiffAppState`
- `submitMealDetail`
- `updateProfile`

## Spreadsheet

スプレッドシートはコンテナバインド前提で使っています。`setupProject()` を実行すると、必要なシートを作成します。

作成対象:

- `users`
- `meal_logs`
- `nutrition_master`

セットアップ関数:

- [gs/7_setup/7_setup.gs](./gs/7_setup/7_setup.gs)
  - `setupProject()`
  - `setupLineProject(config)`

## Script Properties

GAS の Script Properties には次を設定します。

- `LIFF_ID`
- `LINE_CHANNEL_ID`
- `LINE_CHANNEL_ACCESS_TOKEN`
- `WEBAPP_URL`

関連コード:

- [gs/5_infra/5_infra.gs](./gs/5_infra/5_infra.gs)

## Deploy

### 1. GAS Web アプリ

1. Apps Script を Web アプリとしてデプロイ
2. 実行ユーザーを用途に応じて設定
3. `/exec` URL を控える
4. その URL を `site-config.js` の `apiBaseUrl` に設定

### 2. GitHub Pages

1. このリポジトリを GitHub に push
2. GitHub Pages の公開対象を root に設定
3. 公開 URL を LIFF のエンドポイントとして設定

## Local Preview

静的確認だけならローカルで [index.html](./index.html) を開けます。

ただし次はローカル直開きでは完全には動きません。

- LIFF ログイン
- GAS API への本番通信

これらは GitHub Pages や本番 URL 上で確認してください。

## Notes

- フロントは `google.script.run` を使わず、GAS Web アプリに `fetch` で接続します。
- 送信時の `Content-Type` は preflight を増やしにくいよう `text/plain` を使っています。
- LINE Channel Access Token のような秘密情報はフロントに置かず、必ず GAS 側で管理します。
