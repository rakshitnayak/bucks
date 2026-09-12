import { useEffect, useMemo, useState } from "react";
import { api, type Book, type DashboardData, type Session } from "../api";
import { Breakdown } from "../components/Breakdown";
import { EntryRow } from "../components/EntryRow";
import { BookModal } from "../components/modals/BookModal";
import { dateRange, money, paymentModeLabel, shortDate } from "../utils/format";

type BooksDashboardProps = {
  session: Session;
  openBook: (id: string) => void;
};

export function BooksDashboard({ session, openBook }: BooksDashboardProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [bookModal, setBookModal] = useState<Book | null | undefined>();
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [period, setPeriod] = useState("month");

  const load = () => {
    setLoading(true);
    api
      .dashboard(session.workspaceId, dateRange(period))
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [session.workspaceId, period]);

  const books = useMemo(
    () =>
      data?.books.filter(
        (book) =>
          (showArchived || !book.archivedAt) &&
          book.name.toLowerCase().includes(search.toLowerCase()),
      ) ?? [],
    [data, showArchived, search],
  );

  const total =
    data?.totalsByCurrency.find((row) => row.currency === "INR") ??
    data?.totalsByCurrency[0];

  return (
    <main>
      <header>
        <div>
          <p className="eyebrow">ALL YOUR MONEY, ONE VIEW</p>
          <h1>Your books</h1>
          <p className="page-copy">
            Create a book for every account, wallet or purpose.
          </p>
        </div>
        <button className="primary" onClick={() => setBookModal(null)}>
          ＋ Create book
        </button>
      </header>

      {error && <div className="notice">{error}</div>}

      <section className="summary-card">
        <div>
          <p className="eyebrow">
            {period === "month" ? "THIS MONTH" : "SELECTED PERIOD"} · ALL ACTIVE
            BOOKS
          </p>
          <h2>
            {total ? money(total.balanceMinor, total.currency) : money(0)}
          </h2>
          <p className="subtle">
            Combined balance{" "}
            {data?.totalsByCurrency.length && data.totalsByCurrency.length > 1
              ? "shown for one currency at a time"
              : ""}
          </p>
        </div>
        <div className="summary-numbers">
          <span>
            <small>Cash in</small>
            <b className="income">
              {total ? money(total.incomeMinor, total.currency) : money(0)}
            </b>
          </span>
          <span>
            <small>Cash out</small>
            <b>
              {total ? money(total.expenseMinor, total.currency) : money(0)}
            </b>
          </span>
          <span>
            <small>Net flow</small>
            <b>
              {total
                ? money(total.incomeMinor - total.expenseMinor, total.currency)
                : money(0)}
            </b>
          </span>
        </div>
      </section>

      <section className="toolbar" id="books">
        <div className="search">
          <span>⌕</span>
          <input
            aria-label="Search books"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search your books"
          />
        </div>
        <select
          value={period}
          onChange={(event) => setPeriod(event.target.value)}
        >
          <option value="month">This month</option>
          <option value="last">Last month</option>
          <option value="quarter">Last 3 months</option>
          <option value="year">This year</option>
        </select>
        <label className="check">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(event) => setShowArchived(event.target.checked)}
          />{" "}
          Archived
        </label>
      </section>

      {loading ? (
        <div className="empty">Loading your books…</div>
      ) : books.length ? (
        <section className="book-grid">
          {books.map((book) => (
            <article
              className={`book-card ${book.archivedAt ? "is-archived" : ""}`}
              key={book.id}
            >
              <button className="book-open" onClick={() => openBook(book.id)}>
                <i style={{ background: book.color }}>{book.icon}</i>
                <span>
                  <b>{book.name}</b>
                  <small>{book.description || `${book.kind} book`}</small>
                </span>
                <strong>{money(book.balanceMinor, book.currency)}</strong>
              </button>
              <div className="book-stats">
                <span>
                  <small>Cash in</small>
                  <b className="income">
                    {money(book.incomeMinor, book.currency)}
                  </b>
                </span>
                <span>
                  <small>Cash out</small>
                  <b>{money(book.expenseMinor, book.currency)}</b>
                </span>
              </div>
              <footer>
                <span>
                  {book.entryCount} entries · {shortDate(book.latestEntryAt)}
                </span>
                <div>
                  <button onClick={() => setBookModal(book)}>Edit</button>
                  <button
                    onClick={async () => {
                      await api.updateBook(book.id, {
                        archived: !book.archivedAt,
                      });
                      load();
                    }}
                  >
                    {book.archivedAt ? "Restore" : "Archive"}
                  </button>
                </div>
              </footer>
            </article>
          ))}
        </section>
      ) : (
        <div className="empty">
          <i>📚</i>
          <h3>{search ? "No matching books" : "Start with your first book"}</h3>
          <p>Track a bank account, cash wallet, card or a special purpose.</p>
          {!search && (
            <button className="primary" onClick={() => setBookModal(null)}>
              Create a book
            </button>
          )}
        </div>
      )}

      <section className="dashboard-lower" id="insights">
        <div className="panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">ACROSS ALL BOOKS</p>
              <h3>Recent entries</h3>
            </div>
          </div>
          {data?.recentEntries.length ? (
            data.recentEntries.map((entry) => (
              <EntryRow key={entry.id} entry={entry} />
            ))
          ) : (
            <p className="muted">Your latest entries will appear here.</p>
          )}
        </div>
        <div className="panel">
          <p className="eyebrow">SPENDING INSIGHT</p>
          <h3>Top categories</h3>
          <Breakdown
            rows={data?.spendingByCategory ?? []}
            total={total?.expenseMinor ?? 0}
          />
          <div className="mode-list">
            {data?.spendingByMode.slice(0, 4).map((row) => (
              <span key={row.paymentMode}>
                <small>{paymentModeLabel(row.paymentMode)}</small>
                <b>{money(row.amountMinor, total?.currency)}</b>
              </span>
            ))}
          </div>
        </div>
      </section>

      {bookModal !== undefined && (
        <BookModal
          book={bookModal}
          onClose={() => setBookModal(undefined)}
          onSave={async (input) => {
            if (bookModal) {
              await api.updateBook(bookModal.id, input);
            } else {
              await api.createBook(session.workspaceId, input);
            }
            setBookModal(undefined);
            load();
          }}
        />
      )}
    </main>
  );
}
