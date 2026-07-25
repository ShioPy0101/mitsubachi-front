import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "../components/Button";

export function JoinOrganizationPage() {
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  return (
    <main className="join-organization-page">
      <section className="invitation-panel" aria-labelledby="join-title">
        <h1 id="join-title">新しい組織に参加</h1>
        <form
          className="form-stack"
          onSubmit={(event) => {
            event.preventDefault();
            const token = extractInvitationToken(input);
            if (!token) {
              setError("招待コードまたは招待URLを入力してください。");
              return;
            }
            void navigate(`/organization-invitations/${encodeURIComponent(token)}`);
          }}
        >
          <label className="field">
            <span>招待コードまたは招待URL</span>
            <input
              value={input}
              onChange={(event) => {
                setInput(event.target.value);
                setError(null);
              }}
              placeholder="https://.../organization-invitations/..."
              autoComplete="off"
            />
            {error ? <span className="field-error">{error}</span> : null}
          </label>
          <Button type="submit">
            <ArrowRight size={16} aria-hidden="true" />
            招待を確認
          </Button>
        </form>
      </section>
    </main>
  );
}

function extractInvitationToken(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  try {
    const url = new URL(trimmed);
    const match = /\/organization-invitations\/([^/?#]+)/.exec(url.pathname);
    return match ? decodeURIComponent(match[1]) : trimmed;
  } catch {
    const match = /organization-invitations\/([^/?#]+)/.exec(trimmed);
    return match ? decodeURIComponent(match[1]) : trimmed;
  }
}
