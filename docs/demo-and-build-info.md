# デモテナントとビルド情報

## デモの動作

通常のログイン画面で `demo@tenant.example` を入力すると、送信ボタンを待たず
`https://demo.mitsubachi.shiosalt.com/login` へ移動する。前後の空白と大文字小文字は正規化する。
デモ画面は独立した React Router と QueryClient で動作し、通常の AuthProvider を起動しない。

移動先で `https://mitsubachi-demo-api.shiosalt.com/api/v1/demo/login` を呼び、
実送信せず生成された宛先・件名・認証メール本文をモーダルに表示する。
メールのリンクからサーバーで15分間有効・一回限りのリンクを検証し、デモ専用の署名 token を取得する。
デモ token は sessionStorage に保存し、通常の Cookie・CSRF token・ログイン状態と共有しない。
API 呼び出しは `credentials: omit` とする。

デモのドライブは API の合成カタログだけを表示する。フォルダー「資料」「プロジェクト」を開ける。
ファイルの実体、storage_key、通常の DriveItem ID を保持しない。
アップロード、ドロップ、個別・一括ダウンロードは制限モーダルを表示し、転送 API を呼ばない。
専用 API も転送要求を403で拒否する。左上には `demo` バッジを常時表示する。

## feature flag

`VITE_FEATURE_DEMO_TENANT=true` を指定したビルドだけがデモ導線を有効にする。
未指定・false・その他の値は無効。無効時は専用ホストにも利用不可画面を表示する。
Vite のビルド設定なので変更後は再ビルド・デプロイが必要。

infra の `demo.enabled` が有効な場合にこの flag をビルドへ渡す。
frontend.env の `VITE_FEATURE_DEMO_TENANT=false` により導線だけを先に無効化することもできる。
API 側では独立した `FEATURE_DEMO_TENANT` と `DEMO_MODE`、専用 Host を検証する。
DNS、TLS、Nginx、別 API プロセスの準備は infra の `docs/demo-and-build-info.md` を参照する。

## 管理画面の表示

システム管理・組織管理のダッシュボードに以下を表示する。

| 対象                     | 日時                                                | commit                |
| ------------------------ | --------------------------------------------------- | --------------------- |
| フロントエンドのビルド   | Vite が固定した UTC ビルド日時                      | ビルド時の SHA        |
| フロントエンドの本番配信 | 同一 origin の release-info.json に記録した反映日時 | 現在配信中の SHA      |
| バックエンドのビルド     | 管理 API の build_info.built_at                     | 稼働中 release の SHA |
| バックエンドの稼働情報   | build_info.deployed_at                              | 稼働中 release の SHA |

取得できない情報は「未記録」と表示する。画面を開いた日時で補完しない。
リリース後の古いブラウザ bundle と、現在配信中の release の違いを判別できる。
全 SHA を表示し、狭い画面では情報表の内側だけを横スクロールする。

## 検証

`VITE_API_BASE_URL=http://localhost:3000 VITE_FEATURE_DEMO_TENANT=true npm run ci`
で format・lint・型チェック・Vitest・本番ビルドを確認する。
実ブラウザでは API をスタブし、320/360/390/430/768/1024/1280/1440/1920px で
デモ、長い認証メール、管理情報欄を確認した。DNS・TLS・systemd の本番適用は別工程。
