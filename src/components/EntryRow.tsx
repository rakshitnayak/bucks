import type { ReactNode } from "react";
import type { Entry } from "../api";
import { money, paymentModeLabel, shortDate } from "../utils/format";

type EntryRowProps = {
  entry: Entry;
  actions?: ReactNode;
};

export function EntryRow({ entry, actions }: EntryRowProps) {
  return (
    <div className="entry-row">
      <i style={{ background: entry.categoryColor || "#ecebe4" }}>
        {entry.kind === "income" ? "↓" : "↑"}
      </i>
      <span>
        <b>{entry.title}</b>
        <small>
          {entry.category || "Uncategorised"} ·{" "}
          {paymentModeLabel(entry.paymentMode)}
          {entry.bookName ? ` · ${entry.bookName}` : ""}
          <br />
          {shortDate(entry.occurredAt)}
          {entry.note ? ` · ${entry.note}` : ""}
        </small>
      </span>
      <strong className={entry.kind}>
        {entry.kind === "income" ? "+" : "−"}{" "}
        {money(entry.amountMinor, entry.currency)}
      </strong>
      {actions && <div className="row-actions">{actions}</div>}
    </div>
  );
}
