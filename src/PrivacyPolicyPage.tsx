import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

const policySections = [
  {
    title: "取得する情報",
    body: [
      "本サービスは、アカウントの作成、ログイン、組織への参加、ファイル管理機能の提供に必要な範囲で、メールアドレス、表示名、所属組織、権限、認証に関する情報を取得します。",
      "ファイル名、フォルダ名、アップロードされたファイル、更新日時、サイズ、共有設定、操作履歴、監査ログなど、サービス利用に伴って保存される情報を取得します。",
      "障害対応やセキュリティ維持のため、アクセス日時、IPアドレス、ユーザーエージェント、エラー内容などの技術情報を取得する場合があります。",
    ],
  },
  {
    title: "利用目的",
    body: [
      "取得した情報は、ログイン状態の維持、ファイルやフォルダの保存、共有、復元、削除、ダウンロード、プレビューなど、本サービスの機能提供に利用します。",
      "不正アクセスの防止、権限確認、監査、問い合わせ対応、障害調査、サービス改善のために利用します。",
      "法令に基づく対応、利用規約違反への対応、ユーザーと組織の正当な権利保護のために利用する場合があります。",
    ],
  },
  {
    title: "第三者提供",
    body: [
      "法令に基づく場合、ユーザーまたは組織の同意がある場合、または生命・身体・財産の保護に必要な場合を除き、取得した個人情報を第三者へ提供しません。",
      "サービス運用に必要な範囲で、クラウド基盤、メール配信、監視、バックアップなどの委託先へ情報を取り扱わせる場合があります。この場合も、委託先に対して必要かつ適切な管理を行います。",
    ],
  },
  {
    title: "安全管理",
    body: [
      "本サービスは、権限管理、通信の暗号化、監査ログ、アクセス制御などにより、保存された情報の漏えい、滅失、改ざん、不正利用の防止に努めます。",
      "ユーザーは、共有設定や組織メンバーの権限を適切に管理し、意図しない情報共有が発生しないよう注意してください。",
    ],
  },
  {
    title: "保存期間と削除",
    body: [
      "取得した情報は、利用目的の達成に必要な期間、または法令・契約・監査上必要な期間保存します。",
      "削除されたファイルやアカウントに関連する情報は、復元、監査、バックアップ、障害対応のため、一定期間保持される場合があります。",
    ],
  },
  {
    title: "開示・訂正・利用停止",
    body: [
      "ユーザー本人または正当な権限を持つ組織管理者から、個人情報の開示、訂正、削除、利用停止などの請求があった場合、本人確認および権限確認のうえ、法令に従って対応します。",
      "組織が管理するデータについては、所属組織の管理者を通じた対応が必要になる場合があります。",
    ],
  },
  {
    title: "改定",
    body: [
      "本ポリシーは、サービス内容の変更、法令改正、運用上の必要に応じて改定することがあります。重要な変更がある場合は、サービス上の表示など適切な方法で通知します。",
    ],
  },
];

export function PrivacyPolicyPage() {
  return (
    <main className="legal-page">
      <article className="legal-document" aria-labelledby="privacy-title">
        <Link to="/login" className="legal-back-link">
          <ArrowLeft size={16} aria-hidden="true" />
          ログインへ戻る
        </Link>
        <header className="legal-header">
          <p className="legal-eyebrow">Mitsubachi Drive</p>
          <h1 id="privacy-title">プライバシーポリシー</h1>
          <p>
            Mitsubachi
            Drive（以下「本サービス」といいます）は、ファイル管理サービスの提供にあたり取得する情報を、以下の方針に基づいて取り扱います。
          </p>
          <p className="legal-updated">制定日: 2026年8月5日</p>
        </header>

        <div className="legal-section-list">
          {policySections.map((section) => (
            <section key={section.title} className="legal-section">
              <h2>{section.title}</h2>
              {section.body.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </section>
          ))}
        </div>

        <section className="legal-section">
          <h2>お問い合わせ</h2>
          <p>
            本ポリシーに関するお問い合わせは、本サービスの管理者または所属組織の管理者へご連絡ください。
          </p>
        </section>
      </article>
    </main>
  );
}
