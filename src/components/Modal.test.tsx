import { StrictMode } from "react";
import { render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { Modal } from "./Modal";

it("releases the scroll lock when navigating away from an open modal in StrictMode", () => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.open = true;
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.open = false;
  });
  const view = render(
    <StrictMode>
      <Modal open title="認証メール" onClose={() => {}}>
        メール本文
      </Modal>
    </StrictMode>,
  );
  expect(document.body).toHaveClass("modal-open");
  view.unmount();
  expect(document.body).not.toHaveClass("modal-open");
});
