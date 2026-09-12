import { type FormEvent, useState } from "react";
import type { Category, Entry, EntryKind, PaymentMode } from "../../api";
import { localDateTime, paymentModes } from "../../utils/format";
import { Modal } from "../Modal";

export type EntryFormInput = {
  title: string;
  kind: EntryKind;
  amountMinor: number;
  categoryId: string;
  occurredAt: string;
  paymentMode: PaymentMode;
  note?: string;
};

type EntryModalProps = {
  entry: Entry | null;
  categories: Category[];
  currency: string;
  onClose: () => void;
  onSave: (input: EntryFormInput, file?: File) => Promise<void>;
};

export function EntryModal({
  entry,
  categories,
  currency,
  onClose,
  onSave,
}: EntryModalProps) {
  const [kind, setKind] = useState<EntryKind>(entry?.kind || "expense");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get("attachment");
    setBusy(true);

    try {
      await onSave(
        {
          title: String(form.get("title")),
          kind,
          amountMinor: Math.round(Number(form.get("amount")) * 100),
          categoryId: String(form.get("categoryId")),
          occurredAt: new Date(String(form.get("occurredAt"))).toISOString(),
          paymentMode: String(form.get("paymentMode")) as PaymentMode,
          note: String(form.get("note") || ""),
        },
        file instanceof File && file.size ? file : undefined,
      );
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal
      title={entry ? "Edit entry" : "Add an entry"}
      eyebrow={entry ? "UPDATE TRANSACTION" : "NEW TRANSACTION"}
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="tabs">
          <button
            type="button"
            className={kind === "expense" ? "chosen expense-tab" : ""}
            onClick={() => setKind("expense")}
          >
            ↑ Cash out
          </button>
          <button
            type="button"
            className={kind === "income" ? "chosen income-tab" : ""}
            onClick={() => setKind("income")}
          >
            ↓ Cash in
          </button>
        </div>
        <label>
          Amount ({currency})
          <input
            required
            autoFocus
            name="amount"
            type="number"
            min="0.01"
            step="0.01"
            inputMode="decimal"
            defaultValue={entry ? entry.amountMinor / 100 : ""}
            placeholder="0.00"
          />
        </label>
        <label>
          Title
          <input
            required
            name="title"
            defaultValue={entry?.title}
            placeholder="e.g. Grocery shopping"
          />
        </label>
        <div className="form-grid">
          <label>
            Category
            <select name="categoryId" defaultValue={entry?.categoryId}>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.icon} {category.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Payment mode
            <select
              name="paymentMode"
              defaultValue={
                entry?.paymentMode ||
                localStorage.getItem("daybook-mode") ||
                "upi"
              }
              onChange={(event) =>
                localStorage.setItem("daybook-mode", event.target.value)
              }
            >
              {paymentModes.map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="wide">
            Date & time
            <input
              required
              name="occurredAt"
              type="datetime-local"
              defaultValue={localDateTime(
                entry ? new Date(entry.occurredAt) : new Date(),
              )}
            />
          </label>
          <label className="wide">
            Small note
            <textarea
              name="note"
              maxLength={500}
              defaultValue={entry?.note || ""}
              placeholder="Optional details"
            />
          </label>
          {!entry?.attachmentId && (
            <label className="wide">
              Receipt image <small>JPEG, PNG or WebP · up to 5 MB</small>
              <input
                name="attachment"
                type="file"
                accept="image/jpeg,image/png,image/webp"
              />
            </label>
          )}
        </div>
        {error && <p className="form-error">{error}</p>}
        <button className="primary full" disabled={busy || !categories.length}>
          {busy ? "Saving…" : entry ? "Save changes" : "Save entry"}{" "}
          <span>→</span>
        </button>
      </form>
    </Modal>
  );
}
