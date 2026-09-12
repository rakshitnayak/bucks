import { type FormEvent, useState } from "react";
import type { Book } from "../../api";
import { Modal } from "../Modal";

export type BookFormInput = {
  name: string;
  description?: string;
  kind: string;
  currency: string;
  openingBalanceMinor: number;
  color: string;
  icon: string;
};

type BookModalProps = {
  book: Book | null;
  onClose: () => void;
  onSave: (input: BookFormInput) => Promise<void>;
};

export function BookModal({ book, onClose, onSave }: BookModalProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);

    try {
      await onSave({
        name: String(form.get("name")),
        description: String(form.get("description") || ""),
        kind: String(form.get("kind")),
        currency: String(form.get("currency")),
        openingBalanceMinor: Math.round(
          Number(form.get("openingBalance") || 0) * 100,
        ),
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
      title={book ? "Edit book" : "Create a new book"}
      eyebrow="YOUR MONEY, YOUR WAY"
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="form-grid">
          <label className="wide">
            Book name
            <input
              name="name"
              defaultValue={book?.name}
              required
              autoFocus
              placeholder="e.g. Canara Bank"
            />
          </label>
          <label>
            Type
            <select name="kind" defaultValue={book?.kind || "bank"}>
              <option value="bank">Bank account</option>
              <option value="cash">Cash wallet</option>
              <option value="card">Credit card</option>
              <option value="business">Business</option>
              <option value="other">General</option>
            </select>
          </label>
          <label>
            Currency
            <input
              name="currency"
              defaultValue={book?.currency || "INR"}
              maxLength={3}
              required
              disabled={Boolean(book)}
            />
          </label>
          <label className="wide">
            Description
            <input
              name="description"
              defaultValue={book?.description || ""}
              placeholder="What will you track here?"
            />
          </label>
          {!book && (
            <label>
              Opening balance
              <input
                name="openingBalance"
                inputMode="decimal"
                defaultValue="0"
              />
            </label>
          )}
          <label>
            Icon
            <input
              name="icon"
              defaultValue={book?.icon || "📒"}
              maxLength={12}
            />
          </label>
          <label>
            Colour
            <input
              name="color"
              type="color"
              defaultValue={book?.color || "#5f6f52"}
            />
          </label>
        </div>
        {error && <p className="form-error">{error}</p>}
        <button className="primary full" disabled={busy}>
          {busy ? "Saving…" : book ? "Save changes" : "Create book"}{" "}
          <span>→</span>
        </button>
      </form>
    </Modal>
  );
}
