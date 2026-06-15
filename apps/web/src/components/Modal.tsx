import { useEffect, type ReactNode } from "react";

interface ModalProps {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}

export function Modal({ open, title, subtitle, onClose, children }: ModalProps) {
  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="admin-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="admin-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="admin-modal-header">
          <div>
            <p className="admin-modal-eyebrow">Content Record</p>
            <h2 id="admin-modal-title">{title}</h2>
            {subtitle ? <span>{subtitle}</span> : null}
          </div>
          <button type="button" className="admin-modal-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </header>
        <div className="admin-modal-body">{children}</div>
      </div>
    </div>
  );
}
