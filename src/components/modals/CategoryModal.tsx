import { type FormEvent, useState } from "react";
import { Modal } from "../Modal";

export type CategoryFormInput = {
  name: string;
  color: string;
  icon: string;
};

type CategoryModalProps = {
  onClose: () => void;
  onSave: (input: CategoryFormInput) => Promise<void>;
};

export function CategoryModal({ onClose, onSave }: CategoryModalProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);

    try {
      await onSave({
        name: String(form.get("name")),
        color: String(form.get("color")),
        icon: String(form.get("icon")),
      });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Create category"
      eyebrow="USE FOR CASH IN OR OUT"
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <label>
          Name
          <input
            required
            autoFocus
            name="name"
            placeholder="e.g. Subscriptions"
          />
        </label>
        <div className="form-grid">
          <label>
            Icon
            <input name="icon" defaultValue="•" maxLength={12} />
          </label>
          <label>
            Colour
            <input name="color" type="color" defaultValue="#737373" />
          </label>
        </div>
        <p className="form-hint">
          This category is available for both cash-in and cash-out entries.
        </p>
        {error && <p className="form-error">{error}</p>}
        <button className="primary full" disabled={busy}>
          {busy ? "Saving…" : "Create category"} <span>→</span>
        </button>
      </form>
    </Modal>
  );
}
