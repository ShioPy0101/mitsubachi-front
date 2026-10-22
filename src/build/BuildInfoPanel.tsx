import { type BuildInfo, frontendBuildInfo } from "./info";
import "./buildInfo.css";

export function BuildInfoPanel({
  backend,
  release,
  frontend = frontendBuildInfo,
}: {
  backend?: BuildInfo;
  release?: BuildInfo | null;
  frontend?: BuildInfo;
}) {
  const rows = [
    {
      name: "フロントエンド",
      phase: "ビルド",
      at: frontend.built_at,
      commit: frontend.commit,
    },
    {
      name: "フロントエンド",
      phase: "本番配信",
      at: release?.deployed_at,
      commit: release?.commit,
    },
    {
      name: "バックエンド",
      phase: "ビルド",
      at: backend?.built_at,
      commit: backend?.commit,
    },
    {
      name: "バックエンド",
      phase: `稼働中（${backend?.environment ?? "未記録"}）`,
      at: backend?.deployed_at,
      commit: backend?.commit,
    },
  ];
  return (
    <section className="build-info" aria-labelledby="build-info-title">
      <h2 id="build-info-title">ビルド・本番稼働情報</h2>
      <p>
        日時は UTC 表示です。現在読み込んだ画面と、本番配信中のリリースを確認できます。
      </p>
      <div className="build-info-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">対象</th>
              <th scope="col">状態</th>
              <th scope="col">日時（UTC）</th>
              <th scope="col">commit</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.name}-${row.phase}`}>
                <th scope="row">{row.name}</th>
                <td>{row.phase}</td>
                <td>{row.at ?? "未記録"}</td>
                <td>
                  <code>{row.commit ?? "未記録"}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
