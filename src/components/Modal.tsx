import type { ReactNode } from "react";

type ModalProps = {
  title: string;
  eyebrow: string;
  onClose: () => void;
  children: ReactNode;
};

export function Modal({ title, eyebrow, onClose, children }: ModalProps) {
  return (
    <div className="backdrop" role="dialog" aria-modal="true">
      <section className="modal">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h3>{title}</h3>
          </div>
          <button className="close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
