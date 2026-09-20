import { useEffect, useState } from "react";
import { api, type BookData, type Entry, type Session } from "../api";
import { Breakdown } from "../components/Breakdown";
import { EntryRow } from "../components/EntryRow";
import { Metric } from "../components/Metric";
import { CategoryModal } from "../components/modals/CategoryModal";
import { EntryModal } from "../components/modals/EntryModal";
import { dateRange, money, paymentModes } from "../utils/format";

type BookFilters = {
  search: string;
  kind: string;
  paymentMode: string;
  categoryId: string;
  from: string;
  to: string;
};

type BookPageProps = {
  session: Session;
  bookId: string;
  back: () => void;
};

export function BookPage({ session, bookId, back }: BookPageProps) {
  const initialRange = dateRange("month");
  const [data, setData] = useState<BookData | null>(null);
  const [error, setError] = useState("");
  const [entryModal, setEntryModal] = useState<Entry | null | undefined>();
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [period, setPeriod] = useState("month");
  const [filters, setFilters] = useState<BookFilters>({
    search: "",
    kind: "",
    paymentMode: "",
    categoryId: "",
    from: initialRange.from,
    to: initialRange.to,
  });

  const load = () =>
    api
      .book(bookId, filters)
      .then(setData)
      .catch((err) => setError(err.message));

  useEffect(() => {
    void load();
  }, [
    bookId,
    filters.search,
    filters.kind,
    filters.paymentMode,
    filters.categoryId,
    filters.from,
    filters.to,
  ]);

  const choosePeriod = (value: string) => {
    setPeriod(value);
    if (value !== "custom") {
      setFilters((current) => ({ ...current, ...dateRange(value) }));
    }
  };

  if (!data) {
    return (
      <main>
        <button className="back" onClick={back}>
          ← All books
        </button>
        {error ? (
          <div className="notice">{error}</div>
        ) : (
          <div className="empty">Opening book…</div>
        )}
      </main>
    );
  }

  const book = data.book;

  return (
    <main>
      <button className="back" onClick={back}>
        ← All books
      </button>
      <header className="book-header">
        <div className="book-title">
          <i style={{ background: book.color }}>{book.icon}</i>
          <div>
            <p className="eyebrow">
              {book.kind.toUpperCase()} · {book.currency}
            </p>
            <h1>{book.name}</h1>
            <p className="page-copy">
              {book.description || "Your entries and insights in one place."}
            </p>
          </div>
        </div>
        <button className="primary" onClick={() => setEntryModal(null)}>
          ＋ Add entry
        </button>
      </header>

      {error && <div className="notice">{error}</div>}

      <section className="metrics">
        <Metric
          title="Period net"
          value={money(book.balanceMinor, book.currency)}
          note={`${book.entryCount} matching entries`}
        />
        <Metric
          title="Cash in"
          value={money(book.incomeMinor, book.currency)}
          tone="income"
          note="In selected period"
        />
        <Metric
          title="Cash out"
          value={money(book.expenseMinor, book.currency)}
          note="In selected period"
        />
      </section>

      <section className="date-filter">
        <div className="period-tabs">
          <button
            className={period === "month" ? "active" : ""}
            onClick={() => choosePeriod("month")}
          >
            This month
          </button>
          <button
            className={period === "last" ? "active" : ""}
            onClick={() => choosePeriod("last")}
          >
            Last month
          </button>
          <button
            className={period === "quarter" ? "active" : ""}
            onClick={() => choosePeriod("quarter")}
          >
            Last 3 months
          </button>
          <button
            className={period === "custom" ? "active" : ""}
            onClick={() => choosePeriod("custom")}
          >
            Custom
          </button>
        </div>
        {period === "custom" && (
          <div className="custom-dates">
            <label>
              From
              <input
                type="date"
                value={filters.from}
                onChange={(event) =>
                  setFilters({ ...filters, from: event.target.value })
                }
              />
            </label>
            <label>
              To
              <input
                type="date"
                value={filters.to}
                onChange={(event) =>
                  setFilters({ ...filters, to: event.target.value })
                }
              />
            </label>
          </div>
        )}
        <a
          className="export-button"
          href={api.exportUrl(bookId, filters)}
          download
        >
          ⇩ Export filtered PDF
        </a>
      </section>

      <section className="toolbar">
        <div className="search">
          <span>⌕</span>
          <input
            value={filters.search}
            onChange={(event) =>
              setFilters({ ...filters, search: event.target.value })
            }
            placeholder="Search notes and entries"
          />
        </div>
        <select
          value={filters.kind}
          onChange={(event) =>
            setFilters({ ...filters, kind: event.target.value })
          }
        >
          <option value="">Cash in & out</option>
          <option value="income">Cash in</option>
          <option value="expense">Cash out</option>
        </select>
        <select
          value={filters.categoryId}
          onChange={(event) =>
            setFilters({ ...filters, categoryId: event.target.value })
          }
        >
          <option value="">All categories</option>
          {data.categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <select
          value={filters.paymentMode}
          onChange={(event) =>
            setFilters({ ...filters, paymentMode: event.target.value })
          }
        >
          <option value="">All payment modes</option>
          {paymentModes.map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </section>

      <section className="dashboard-lower book-content">
        <div className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">LEDGER</p>
              <h3>All entries</h3>
            </div>
            <button className="secondary" onClick={() => setCategoryOpen(true)}>
              ＋ Category
            </button>
          </div>
          {data.entries.length ? (
            data.entries.map((entry) => (
              <EntryRow
                key={entry.id}
                entry={entry}
                actions={
                  !entry.isSystem ? (
                    <>
                      <button onClick={() => setEntryModal(entry)}>Edit</button>
                      <button
                        onClick={async () => {
                          if (confirm("Delete this entry?")) {
                            await api.deleteEntry(entry.id);
                            load();
                          }
                        }}
                      >
                        Delete
                      </button>
                    </>
                  ) : undefined
                }
              />
            ))
          ) : (
            <div className="empty compact">
              <h3>No entries yet</h3>
              <p>Add cash in or cash out to begin this book.</p>
            </div>
          )}
        </div>
        <div className="panel">
          <p className="eyebrow">THIS BOOK</p>
          <h3>Where money went</h3>
          <Breakdown rows={data.spendingByCategory} total={book.expenseMinor} />
        </div>
      </section>

      {entryModal !== undefined && (
        <EntryModal
          entry={entryModal}
          categories={data.categories}
          currency={book.currency}
          onClose={() => setEntryModal(undefined)}
          onSave={async (input) => {
            if (entryModal) {
              await api.updateEntry(entryModal.id, input);
            } else {
              await api.createEntry(bookId, {
                ...input,
                idempotencyKey: crypto.randomUUID(),
              });
            }
            setEntryModal(undefined);
            load();
          }}
        />
      )}

      {categoryOpen && (
        <CategoryModal
          onClose={() => setCategoryOpen(false)}
          onSave={async (input) => {
            await api.createCategory(session.workspaceId, {
              ...input,
              bookId: null,
            });
            setCategoryOpen(false);
            load();
          }}
        />
      )}
    </main>
  );
}
