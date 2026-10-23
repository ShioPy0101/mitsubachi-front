import { X } from "lucide-react";
import { useEffect, useRef } from "react";

import { IconButton } from "./IconButton";

type ModalProps = {
  open: boolean;
  title: string;
  className?: string;
  children: React.ReactNode;
  onClose: () => void;
};

export function Modal({ open, title, className = "", children, onClose }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      triggerRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
      document.body.classList.add("modal-open");
    }

    if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => {
      document.body.classList.remove("modal-open");
      triggerRef.current?.focus();
    };
    dialog.addEventListener("close", handleClose);
    return () => dialog.removeEventListener("close", handleClose);
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className={`modal ${className}`.trim()}
      aria-labelledby="modal-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal-header">
        <h2 id="modal-title">{title}</h2>
        <IconButton label="閉じる" onClick={onClose}>
          <X size={18} aria-hidden="true" />
        </IconButton>
      </div>
      <div className="modal-body">{children}</div>
    </dialog>
  );
}
