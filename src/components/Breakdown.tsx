import { money } from "../utils/format";

type BreakdownRow = {
  name: string;
  color: string;
  icon: string;
  amountMinor: number;
};

type BreakdownProps = {
  rows: BreakdownRow[];
  total: number;
};

export function Breakdown({ rows, total }: BreakdownProps) {
  if (!rows.length) {
    return <p className="muted">Add cash-out entries to see a breakdown.</p>;
  }

  return (
    <div className="breakdown">
      {rows.map((row) => (
        <div key={row.name}>
          <span>
            <i style={{ background: row.color }}>{row.icon}</i>
            <b>{row.name}</b>
          </span>
          <span>
            <strong>
              {total ? Math.round((row.amountMinor / total) * 100) : 0}%
            </strong>
            <small>{money(row.amountMinor)}</small>
          </span>
          <em
            style={{
              width: `${total ? (row.amountMinor / total) * 100 : 0}%`,
              background: row.color,
            }}
          />
        </div>
      ))}
    </div>
  );
}
