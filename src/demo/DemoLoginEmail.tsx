import { Link } from "react-router-dom";

import { Modal } from "../components/Modal";
import type { DemoEmail } from "./api";
import "./demo.css";

// API が通常メールと同じ template で生成した本文を表示し、HTML としては解釈しない。
export function DemoLoginEmail({
  email,
  onClose,
}: {
  email: DemoEmail | null;
  onClose: () => void;
}) {
  return (
    <Modal open={email !== null} title="デモ用の認証メール" onClose={onClose}>
      {email && (
        <>
          <p>デモではメールを実送信せず、送付する内容をここに表示します。</p>
          <p>宛先: {email.to}</p>
          <p>件名: {email.subject}</p>
          <div className="demo-email-body">{email.body}</div>
          <p className="demo-email-url">
            <Link to={email.url} onClick={onClose}>
              Mitsubachiにログインする
              <br />
              {email.url}
            </Link>
          </p>
        </>
      )}
    </Modal>
  );
}
