export type Session = {
  user: { id: string; email: string };
  workspaceId: string;
};
export type EntryKind = "income" | "expense";
export type PaymentMode =
  | "cash"
  | "upi"
  | "debit_card"
  | "credit_card"
  | "bank_transfer"
  | "cheque"
  | "other";
export type Book = {
  id: string;
  name: string;
  description: string | null;
  kind: string;
  currency: string;
  icon: string;
  color: string;
  archivedAt: string | null;
  balanceMinor: number;
  incomeMinor: number;
  expenseMinor: number;
  entryCount: number;
  latestEntryAt: string | null;
};
export type Category = {
  id: string;
  name: string;
  kind: EntryKind | "both";
  color: string;
  icon: string;
  bookId?: string | null;
};
export type Entry = {
  id: string;
  title: string;
  kind: EntryKind;
  amountMinor: number;
  currency: string;
  occurredAt: string;
  bookId: string;
  categoryId: string;
  category?: string;
  categoryColor?: string;
  paymentMode: PaymentMode;
  note?: string | null;
  attachmentId?: string | null;
  isSystem?: boolean;
  bookName?: string;
};
export type DashboardData = {
  books: Book[];
  totalsByCurrency: Array<{
    currency: string;
    balanceMinor: number;
    incomeMinor: number;
    expenseMinor: number;
  }>;
  spendingByCategory: Array<{
    id: string;
    name: string;
    color: string;
    icon: string;
    amountMinor: number;
    entryCount: number;
  }>;
  spendingByMode: Array<{ paymentMode: PaymentMode; amountMinor: number }>;
  recentEntries: Entry[];
};
export type BookData = {
  book: Book;
  categories: Category[];
  entries: Entry[];
  nextCursor: string | null;
  spendingByCategory: Array<{
    name: string;
    color: string;
    icon: string;
    amountMinor: number;
  }>;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const isForm = init?.body instanceof FormData;
  const response = await fetch(path, {
    credentials: "include",
    ...init,
    headers: {
      ...(isForm ? {} : { "Content-Type": "application/json" }),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body = await response
      .json()
      .catch(() => ({ message: "Request failed." }));
    throw new Error(body.message ?? "Request failed.");
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
const query = (values: Record<string, string | undefined>) => {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const text = params.toString();
  return text ? `?${text}` : "";
};
export const api = {
  me: () => request<Session>("/v1/auth/me"),
  login: (email: string, password: string) =>
    request<Session>("/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  register: (email: string, password: string) =>
    request<Session>("/v1/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  logout: () => request<void>("/v1/auth/logout", { method: "POST" }),
  dashboard: (
    workspaceId: string,
    dates: Record<string, string | undefined> = {},
  ) =>
    request<DashboardData>(
      `/v1/workspaces/${workspaceId}/dashboard${query(dates)}`,
    ),
  createBook: (
    workspaceId: string,
    input: {
      name: string;
      description?: string;
      kind: string;
      currency: string;
      openingBalanceMinor: number;
      color: string;
      icon: string;
    },
  ) =>
    request<{ bookId: string }>(`/v1/workspaces/${workspaceId}/books`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateBook: (id: string, input: Record<string, unknown>) =>
    request(`/v1/books/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  book: (id: string, filters: Record<string, string | undefined> = {}) =>
    request<BookData>(`/v1/books/${id}${query(filters)}`),
  createEntry: (
    bookId: string,
    input: {
      title: string;
      kind: EntryKind;
      amountMinor: number;
      categoryId: string;
      occurredAt: string;
      paymentMode: PaymentMode;
      note?: string;
      idempotencyKey: string;
    },
  ) =>
    request<{ entry: Entry }>(`/v1/books/${bookId}/entries`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  updateEntry: (id: string, input: Record<string, unknown>) =>
    request<{ entry: Entry }>(`/v1/entries/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  deleteEntry: (id: string) =>
    request<void>(`/v1/entries/${id}`, { method: "DELETE" }),
  createCategory: (
    workspaceId: string,
    input: {
      name: string;
      color: string;
      icon: string;
      bookId?: string | null;
    },
  ) =>
    request<{ category: Category }>(
      `/v1/workspaces/${workspaceId}/categories`,
      { method: "POST", body: JSON.stringify(input) },
    ),
  uploadAttachment: (entryId: string, file: File) => {
    const body = new FormData();
    body.append("file", file);
    return request<{ attachmentId: string }>(
      `/v1/entries/${entryId}/attachment`,
      { method: "POST", body },
    );
  },
  attachmentUrl: (id: string) => `/v1/attachments/${id}`,
  exportUrl: (bookId: string, filters: Record<string, string | undefined>) =>
    `/v1/books/${bookId}/export.pdf${query(filters)}`,
};
