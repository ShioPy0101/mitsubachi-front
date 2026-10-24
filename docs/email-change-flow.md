# メールアドレスを保存しない認証・変更画面

バックエンドの [HMAC identity 対応 PR](https://github.com/ShioPy0101/mitsubachi-ruby/pull/133) と同時に切り替える。バックエンドの段階移行・専用鍵設定・旧データ照合は同 PR の移行手順に従う。フロントエンドの migration、環境変数、追加依存関係はない。

## 画面と API の契約

1. `/settings/user` から `/login?intent=email_change` へ進む。既存のログイン状態でも入力画面を表示し、`POST /auth/login` にメールと intent を渡す。
2. Magic Link の `/auth/verify` で検証し、新しい session の `/me` 成功を確認する。API が `email_change_reauthenticated: true` を返した場合だけ設定画面へ戻す。URL の intent 自体は権限に使わない。
3. 新メールを `POST /me/email_change` に送る。画面の再認証表示はアカウント ID と時刻だけを history state に持ち、5分で失効する。許可判断はサーバーが行い、`reauthentication_required` ではログイン画面へ戻す。申請後は入力を消し、再認証表示も消費する。
4. `email_change_stage` に従って「旧メールの承認待ち」「新メールの確認待ち」を表示する。状態の再取得と取消を提供する。保存済みの宛先表示や宛先の再入力なしの再送は提供しない。
5. `/settings/email-change/approve?token=...` で旧メールを承認する。ボタン操作だけで `POST /me/email_change/approve` を実行し、新メールの確認待ちへ進む。
6. `/settings/email-change/verify?token=...` で新メールへの変更を確定する。ボタン操作だけで `POST /me/email_change/verify` を実行する。成功時に全 query cache を破棄し、新メールでのログインを案内する。旧メールへの完了通知はサーバーが送る。

承認・確定ページはリンクスキャナの GET で状態を変更しない。多重操作を防止し、成功後は URL から token を除く。session が変わる Magic Link 検証・変更確定後には CSRF cache を破棄し、次の書き込みで再取得する。

API の `email`、`pending_email`、管理画面の `owner_email`、招待メールは null を許容する。`/me` の完全な `data` を解釈し、変更段階を失わない。管理画面の一覧・確認ダイアログ、招待ページでは表示名と ID を利用する。管理編集のメール欄は任意の変更入力とし、未入力時は更新 payload から省く。管理メール検索は完全一致であることを画面で案内する。

メール原文と token を localStorage、sessionStorage、history state に追加しない。再認証 state は画面案内だけに使う。DB への保存方法や鍵の管理はバックエンドが担当する。

## 表示・検証

既存のテーマ・入力文字16pxを維持し、767px以下では対象フォーム・主要ボタンを44px以上にする。承認・確定ページの本文幅は最大640px。入力ラベル、エラーとの関連付け、処理中表示、結果通知、キーボード操作を提供する。

- `VITE_API_BASE_URL=http://localhost:3000 npm run ci`: format、lint、typecheck、206 tests、build が成功。
- lint には既存ファイルの warning 15件、build には既存構成による500KB超 chunk warning が残る。
- Chromium とモック API で320×568、360×800、390×844、430×932、768×1024、1024×768、1280×800、1440×900、1920×1080をライト／ダーク両方で検証。18通り・162画面状態で横はみ出し、文字サイズ、モバイル操作サイズ、storage 内の原文・token 不在を確認した。承認・確定は Enter キーでも検証した。
- 実際の SMTP 配送・本番デプロイ・本番データ移行は未実行。デプロイ前に、バックエンドとの同時切替、メール内 URL の origin、旧メール承認→新メール確認→旧メール通知、変更後の session 失効を実環境で確認する。
