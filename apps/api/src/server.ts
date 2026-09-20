import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg, { type PoolClient } from "pg";
import PDFDocument from "pdfkit";
import { z, ZodError } from "zod";

// Runtime configuration and infrastructure.
const env = z
  .object({
    DATABASE_URL: z.string().min(1),
    DATABASE_PASSWORD: z.string().min(1).optional(),
    JWT_SECRET: z.string().min(32),
    WEB_ORIGIN: z
      .string()
      .url()
      .default(process.env.RENDER_EXTERNAL_URL ?? "http://localhost:5173"),
    PORT: z.coerce.number().int().positive().default(3001),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    DATABASE_SSL: z.enum(["true", "false"]).optional(),
    ALLOWED_EMAIL: z.string().trim().toLowerCase().email().optional(),
  })
  .parse(process.env);
const useDatabaseSsl =
  env.DATABASE_SSL === "true" ||
  (env.DATABASE_SSL === undefined && env.NODE_ENV === "production");
const databaseUrl = env.DATABASE_PASSWORD
  ? env.DATABASE_URL.replace(
      "[YOUR-PASSWORD]",
      encodeURIComponent(env.DATABASE_PASSWORD),
    )
  : env.DATABASE_URL;
const db = new pg.Pool({
  connectionString: databaseUrl,
  max: 10,
  ssl: useDatabaseSsl || undefined,
});
const app = Fastify({
  logger: { redact: ["req.headers.authorization", "req.headers.cookie"] },
  trustProxy: env.NODE_ENV === "production",
});
await app.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      "style-src": [
        "'self'",
        "'unsafe-inline'",
        "https://fonts.googleapis.com",
      ],
      "font-src": ["'self'", "https://fonts.gstatic.com", "data:"],
      "img-src": ["'self'", "data:"],
    },
  },
});
await app.register(cors, { origin: env.WEB_ORIGIN, credentials: true });
await app.register(cookie);
await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });
await app.register(jwt, {
  secret: env.JWT_SECRET,
  cookie: { cookieName: "daybook_session", signed: false },
});
if (env.NODE_ENV === "production") {
  await app.register(fastifyStatic, {
    root: resolve(dirname(fileURLToPath(import.meta.url)), "../../../dist"),
    wildcard: false,
  });
}

// Authentication and request validation.
type User = { id: string; email: string };
const auth = {
  preHandler: [
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await request.jwtVerify();
      } catch {
        return reply
          .code(401)
          .send({ code: "UNAUTHENTICATED", message: "Please sign in." });
      }
    },
  ],
};
const userOf = (request: FastifyRequest) => request.user as User;
const credentials = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(12).max(128),
});
const workspaceParams = z.object({ workspaceId: z.string().uuid() });
const bookParams = z.object({ bookId: z.string().uuid() });
const entryParams = z.object({ entryId: z.string().uuid() });
const categoryParams = z.object({ categoryId: z.string().uuid() });
const paymentMode = z.enum([
  "cash",
  "upi",
  "debit_card",
  "credit_card",
  "bank_transfer",
  "cheque",
  "other",
]);
const entryInput = z.object({
  title: z.string().trim().min(1).max(120),
  kind: z.enum(["income", "expense"]),
  amountMinor: z.number().int().positive().max(10_000_000_000),
  categoryId: z.string().uuid(),
  occurredAt: z.string().datetime({ offset: true }),
  paymentMode,
  note: z.string().trim().max(500).optional().nullable(),
  idempotencyKey: z.string().uuid(),
});
const bookInput = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(240).optional().nullable(),
  kind: z.enum(["cash", "bank", "card", "business", "other"]),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/)
    .default("INR"),
  openingBalanceMinor: z
    .number()
    .int()
    .min(-10_000_000_000)
    .max(10_000_000_000)
    .default(0),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#5f6f52"),
  icon: z.string().trim().min(1).max(12).default("📒"),
});
const dateQuery = z
  .object({
    from: z.string().date().optional(),
    to: z.string().date().optional(),
  })
  .refine(
    (x) => !x.from || !x.to || x.from <= x.to,
    "From date must be before to date.",
  );
const bookFilterBase = z.object({
  kind: z.enum(["income", "expense"]).optional(),
  categoryId: z.string().uuid().optional(),
  paymentMode: paymentMode.optional(),
  search: z.string().trim().max(100).optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  cursor: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(40),
});
const bookFilterSchema = bookFilterBase.refine(
  (value) => !value.from || !value.to || value.from <= value.to,
  "From date must be before to date.",
);
type BookFilter = z.infer<typeof bookFilterSchema>;
function entryFilter(bookId: string, query: BookFilter, withCursor = true) {
  const values: unknown[] = [bookId];
  const clauses = ["t.wallet_id=$1", "t.deleted_at IS NULL"];
  const add = (sql: string, value: unknown) => {
    values.push(value);
    clauses.push(sql.replaceAll("?", `$${values.length}`));
  };
  if (query.kind) add("t.kind=?", query.kind);
  if (query.categoryId) add("t.category_id=?", query.categoryId);
  if (query.paymentMode) add("t.payment_mode=?", query.paymentMode);
  if (query.search)
    add(
      "(t.title ILIKE '%'||?||'%' OR t.note ILIKE '%'||?||'%')",
      query.search,
    );
  if (query.from) add("t.occurred_at>=?::date", query.from);
  if (query.to) add("t.occurred_at<?::date+interval '1 day'", query.to);
  if (withCursor && query.cursor) add("t.occurred_at<?", query.cursor);
  return { values, clauses };
}

// Authorization, audit, and response mapping helpers.
async function setSession(reply: FastifyReply, user: User) {
  const token = await reply.jwtSign(user, { expiresIn: "7d" });
  reply.setCookie("daybook_session", token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 604800,
  });
}
async function workspaceFor(
  userId: string,
  workspaceId: string,
  client: pg.Pool | PoolClient = db,
) {
  return (
    (
      await client.query(
        "SELECT 1 FROM workspace_members WHERE user_id=$1 AND workspace_id=$2",
        [userId, workspaceId],
      )
    ).rowCount === 1
  );
}
async function ownedBook(
  userId: string,
  bookId: string,
  client: pg.Pool | PoolClient = db,
) {
  return (
    await client.query(
      `SELECT w.* FROM wallets w JOIN workspace_members m ON m.workspace_id=w.workspace_id WHERE w.id=$1 AND m.user_id=$2`,
      [bookId, userId],
    )
  ).rows[0];
}
async function audit(
  client: PoolClient,
  workspaceId: string,
  actorId: string,
  entityType: string,
  entityId: string,
  action: string,
  before: unknown,
  after: unknown,
) {
  await client.query(
    `INSERT INTO audit_events(workspace_id,actor_id,entity_type,entity_id,action,before_data,after_data) VALUES($1,$2,$3,$4,$5,$6,$7)`,
    [
      workspaceId,
      actorId,
      entityType,
      entityId,
      action,
      before ? JSON.stringify(before) : null,
      after ? JSON.stringify(after) : null,
    ],
  );
}
const mapEntry = (row: Record<string, unknown>) => ({
  id: row.id,
  title: row.title,
  kind: row.kind,
  amountMinor: Number(row.amount_minor),
  currency: row.currency,
  occurredAt: row.occurred_at,
  bookId: row.wallet_id,
  categoryId: row.category_id,
  category: row.category,
  categoryColor: row.category_color,
  paymentMode: row.payment_mode,
  note: row.note,
  isSystem: row.is_system,
  deletedAt: row.deleted_at ?? null,
});

// Authentication routes.
app.post(
  "/v1/auth/register",
  { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
  async (request, reply) => {
    const input = credentials.parse(request.body);
    if (env.NODE_ENV === "production" && input.email !== env.ALLOWED_EMAIL)
      return reply.code(403).send({
        code: "REGISTRATION_DISABLED",
        message: "Registration is not available for this email.",
      });
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      const hash = await bcrypt.hash(input.password, 12);
      const users = await client.query<User>(
        "INSERT INTO users(email,password_hash) VALUES($1,$2) RETURNING id,email",
        [input.email, hash],
      );
      const user = users.rows[0];
      const workspaces = await client.query<{ id: string }>(
        "INSERT INTO workspaces(owner_id,name) VALUES($1,'Personal') RETURNING id",
        [user.id],
      );
      const workspaceId = workspaces.rows[0].id;
      await client.query(
        "INSERT INTO workspace_members(workspace_id,user_id,role) VALUES($1,$2,'owner')",
        [workspaceId, user.id],
      );
      const defaults = [
        ["Food & drinks", "both", "#ef7149", "☕"],
        ["Travel", "both", "#8378d7", "↗"],
        ["Shopping", "both", "#d79555", "◈"],
        ["Home", "both", "#5d937b", "⌂"],
        ["Bills", "both", "#8f6f62", "🧾"],
        ["Rent", "both", "#735b69", "🏠"],
        ["Health", "both", "#bd6d68", "♥"],
        ["Education", "both", "#6680a1", "🎓"],
        ["Entertainment", "both", "#b66a88", "♪"],
        ["Fees", "both", "#86755d", "◇"],
        ["Salary", "both", "#428368", "↓"],
        ["Business", "both", "#39766a", "◈"],
        ["Interest", "both", "#567f59", "+"],
        ["Refund", "both", "#638a73", "↩"],
        ["Gift", "both", "#8a6a9e", "✦"],
        ["Other", "both", "#737373", "•"],
      ];
      for (const item of defaults)
        await client.query(
          "INSERT INTO categories(workspace_id,name,kind,color,icon) VALUES($1,$2,$3,$4,$5)",
          [workspaceId, ...item],
        );
      await client.query("COMMIT");
      await setSession(reply, user);
      return reply.code(201).send({ user, workspaceId });
    } catch (error) {
      await client.query("ROLLBACK");
      if (error instanceof Error && "code" in error && error.code === "23505")
        return reply.code(409).send({
          code: "EMAIL_IN_USE",
          message: "An account already exists for this email.",
        });
      throw error;
    } finally {
      client.release();
    }
  },
);
app.post(
  "/v1/auth/login",
  { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
  async (request, reply) => {
    const input = credentials.parse(request.body);
    const result = await db.query<User & { password_hash: string }>(
      "SELECT id,email,password_hash FROM users WHERE email=$1",
      [input.email],
    );
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(input.password, user.password_hash)))
      return reply.code(401).send({
        code: "INVALID_CREDENTIALS",
        message: "Email or password is incorrect.",
      });
    await setSession(reply, { id: user.id, email: user.email });
    const workspace = await db.query<{ id: string }>(
      "SELECT workspace_id id FROM workspace_members WHERE user_id=$1 ORDER BY created_at LIMIT 1",
      [user.id],
    );
    return {
      user: { id: user.id, email: user.email },
      workspaceId: workspace.rows[0].id,
    };
  },
);
app.post("/v1/auth/logout", async (_request, reply) => {
  reply.clearCookie("daybook_session", { path: "/" });
  return reply.code(204).send();
});
app.get("/v1/auth/me", auth, async (request, reply) => {
  const user = userOf(request);
  const workspace = await db.query<{ id: string }>(
    "SELECT workspace_id id FROM workspace_members WHERE user_id=$1 ORDER BY created_at LIMIT 1",
    [user.id],
  );
  if (!workspace.rows[0]) {
    reply.clearCookie("daybook_session", { path: "/" });
    return reply
      .code(401)
      .send({ code: "UNAUTHENTICATED", message: "Please sign in." });
  }
  return { user, workspaceId: workspace.rows[0].id };
});

// Dashboard and book routes.
app.get(
  "/v1/workspaces/:workspaceId/dashboard",
  auth,
  async (request, reply) => {
    const { workspaceId } = workspaceParams.parse(request.params);
    const dates = dateQuery.parse(request.query);
    const user = userOf(request);
    if (!(await workspaceFor(user.id, workspaceId)))
      return reply
        .code(404)
        .send({ code: "NOT_FOUND", message: "Workspace not found." });
    const dateSql = `${dates.from ? " AND t.occurred_at >= $2::date" : ""}${dates.to ? ` AND t.occurred_at < $${dates.from ? 3 : 2}::date + interval '1 day'` : ""}`;
    const params: unknown[] = [workspaceId];
    if (dates.from) params.push(dates.from);
    if (dates.to) params.push(dates.to);
    const [books, totals, categories, modes, recent] = await Promise.all([
      db.query(
        `SELECT w.id,w.name,w.description,w.kind,w.currency,w.icon,w.color,w.archived_at,w.opening_balance_minor+COALESCE(SUM(CASE WHEN t.kind='income' THEN t.amount_minor ELSE -t.amount_minor END) FILTER(WHERE t.deleted_at IS NULL),0) balance_minor,COALESCE(SUM(t.amount_minor) FILTER(WHERE t.kind='income' AND t.deleted_at IS NULL),0) income_minor,COALESCE(SUM(t.amount_minor) FILTER(WHERE t.kind='expense' AND t.deleted_at IS NULL),0) expense_minor,COUNT(t.id) FILTER(WHERE t.deleted_at IS NULL) entry_count,MAX(t.occurred_at) FILTER(WHERE t.deleted_at IS NULL) latest_entry_at FROM wallets w LEFT JOIN transactions t ON t.wallet_id=w.id WHERE w.workspace_id=$1 GROUP BY w.id ORDER BY w.archived_at NULLS FIRST,w.created_at`,
        [workspaceId],
      ),
      db.query(
        `SELECT w.currency,COALESCE(SUM(w.opening_balance_minor),0)+COALESCE(SUM(CASE WHEN t.kind='income' THEN t.amount_minor ELSE -t.amount_minor END),0) balance_minor,COALESCE(SUM(t.amount_minor) FILTER(WHERE t.kind='income'),0) income_minor,COALESCE(SUM(t.amount_minor) FILTER(WHERE t.kind='expense'),0) expense_minor FROM wallets w LEFT JOIN transactions t ON t.wallet_id=w.id AND t.deleted_at IS NULL${dateSql} WHERE w.workspace_id=$1 AND w.archived_at IS NULL GROUP BY w.currency`,
        params,
      ),
      db.query(
        `SELECT c.id,c.name,c.color,c.icon,COALESCE(SUM(t.amount_minor),0) amount_minor,COUNT(t.id) entry_count FROM categories c JOIN transactions t ON t.category_id=c.id AND t.kind='expense' AND t.deleted_at IS NULL${dateSql} JOIN wallets w ON w.id=t.wallet_id AND w.archived_at IS NULL WHERE c.workspace_id=$1 GROUP BY c.id ORDER BY amount_minor DESC LIMIT 6`,
        params,
      ),
      db.query(
        `SELECT t.payment_mode,COALESCE(SUM(t.amount_minor),0) amount_minor FROM transactions t JOIN wallets w ON w.id=t.wallet_id AND w.archived_at IS NULL WHERE t.workspace_id=$1 AND t.kind='expense' AND t.deleted_at IS NULL${dateSql} GROUP BY t.payment_mode ORDER BY amount_minor DESC`,
        params,
      ),
      db.query(
        `SELECT t.*,c.name category,c.color category_color,w.name book_name FROM transactions t JOIN wallets w ON w.id=t.wallet_id AND w.archived_at IS NULL LEFT JOIN categories c ON c.id=t.category_id WHERE t.workspace_id=$1 AND t.deleted_at IS NULL ORDER BY t.occurred_at DESC LIMIT 8`,
        [workspaceId],
      ),
    ]);
    return {
      books: books.rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        kind: row.kind,
        currency: row.currency,
        icon: row.icon,
        color: row.color,
        archivedAt: row.archived_at,
        balanceMinor: Number(row.balance_minor),
        incomeMinor: Number(row.income_minor),
        expenseMinor: Number(row.expense_minor),
        entryCount: Number(row.entry_count),
        latestEntryAt: row.latest_entry_at,
      })),
      totalsByCurrency: totals.rows.map((row) => ({
        currency: row.currency,
        balanceMinor: Number(row.balance_minor),
        incomeMinor: Number(row.income_minor),
        expenseMinor: Number(row.expense_minor),
      })),
      spendingByCategory: categories.rows.map((row) => ({
        id: row.id,
        name: row.name,
        color: row.color,
        icon: row.icon,
        amountMinor: Number(row.amount_minor),
        entryCount: Number(row.entry_count),
      })),
      spendingByMode: modes.rows.map((row) => ({
        paymentMode: row.payment_mode,
        amountMinor: Number(row.amount_minor),
      })),
      recentEntries: recent.rows.map((row) => ({
        ...mapEntry(row),
        bookName: row.book_name,
      })),
    };
  },
);

app.post("/v1/workspaces/:workspaceId/books", auth, async (request, reply) => {
  const { workspaceId } = workspaceParams.parse(request.params);
  const input = bookInput.parse(request.body);
  const user = userOf(request);
  if (!(await workspaceFor(user.id, workspaceId)))
    return reply
      .code(404)
      .send({ code: "NOT_FOUND", message: "Workspace not found." });
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `INSERT INTO wallets(workspace_id,name,description,kind,currency,color,icon) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        workspaceId,
        input.name,
        input.description || null,
        input.kind,
        input.currency,
        input.color,
        input.icon,
      ],
    );
    const book = result.rows[0];
    if (input.openingBalanceMinor !== 0) {
      const kind = input.openingBalanceMinor > 0 ? "income" : "expense";
      const categoryName =
        kind === "income" ? "Opening balance" : "Opening debt";
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO categories(workspace_id,name,kind,color,icon) VALUES($1,$2,'both','#737373','◉') ON CONFLICT DO NOTHING RETURNING id`,
        [workspaceId, categoryName],
      );
      const categoryId =
        inserted.rows[0]?.id ??
        (
          await client.query<{ id: string }>(
            "SELECT id FROM categories WHERE workspace_id=$1 AND lower(name)=lower($2) AND wallet_id IS NULL",
            [workspaceId, categoryName],
          )
        ).rows[0].id;
      await client.query(
        `INSERT INTO transactions(workspace_id,wallet_id,category_id,title,kind,amount_minor,currency,occurred_at,idempotency_key,payment_mode,is_system,note) VALUES($1,$2,$3,$4,$5,$6,$7,now(),$8,'other',true,'Created with this book')`,
        [
          workspaceId,
          book.id,
          categoryId,
          categoryName,
          kind,
          Math.abs(input.openingBalanceMinor),
          input.currency,
          randomUUID(),
        ],
      );
    }
    await audit(
      client,
      workspaceId,
      user.id,
      "book",
      book.id,
      "created",
      null,
      book,
    );
    await client.query("COMMIT");
    return reply.code(201).send({ bookId: book.id });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});
app.patch("/v1/books/:bookId", auth, async (request, reply) => {
  const { bookId } = bookParams.parse(request.params);
  const user = userOf(request);
  const before = await ownedBook(user.id, bookId);
  if (!before)
    return reply
      .code(404)
      .send({ code: "NOT_FOUND", message: "Book not found." });
  const input = bookInput
    .omit({ openingBalanceMinor: true, currency: true })
    .partial()
    .extend({ archived: z.boolean().optional() })
    .parse(request.body);
  const result = await db.query(
    `UPDATE wallets SET name=COALESCE($1,name),description=CASE WHEN $2::boolean THEN $3 ELSE description END,kind=COALESCE($4,kind),color=COALESCE($5,color),icon=COALESCE($6,icon),archived_at=CASE WHEN $7::boolean IS TRUE THEN now() WHEN $7::boolean IS FALSE THEN NULL ELSE archived_at END,updated_at=now() WHERE id=$8 RETURNING *`,
    [
      input.name,
      input.description !== undefined,
      input.description ?? null,
      input.kind,
      input.color,
      input.icon,
      input.archived,
      bookId,
    ],
  );
  return { book: result.rows[0] };
});

app.get("/v1/books/:bookId/export.pdf", auth, async (request, reply) => {
  const { bookId } = bookParams.parse(request.params);
  const book = await ownedBook(userOf(request).id, bookId);
  if (!book)
    return reply
      .code(404)
      .send({ code: "NOT_FOUND", message: "Book not found." });
  const query = bookFilterBase
    .omit({ cursor: true, limit: true })
    .refine(
      (value) => !value.from || !value.to || value.from <= value.to,
      "From date must be before to date.",
    )
    .parse(request.query);
  const filter = entryFilter(bookId, { ...query, limit: 100 }, false);
  const result = await db.query(
    `SELECT t.*,c.name category FROM transactions t LEFT JOIN categories c ON c.id=t.category_id WHERE ${filter.clauses.join(" AND ")} ORDER BY t.occurred_at DESC,t.id DESC LIMIT 5000`,
    filter.values,
  );
  const income = result.rows
      .filter((row) => row.kind === "income")
      .reduce((sum, row) => sum + Number(row.amount_minor), 0),
    expense = result.rows
      .filter((row) => row.kind === "expense")
      .reduce((sum, row) => sum + Number(row.amount_minor), 0);
  const document = new PDFDocument({
    size: "A4",
    margin: 46,
    bufferPages: true,
    info: { Title: `${book.name} - bucks report`, Author: "bucks" },
  });
  const chunks: Buffer[] = [];
  document.on("data", (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolveBuffer, reject) => {
    document.on("end", () => resolveBuffer(Buffer.concat(chunks)));
    document.on("error", reject);
  });
  document.rect(0, 0, 595, 128).fill("#252720");
  document
    .fillColor("#ffffff")
    .font("Helvetica-Bold")
    .fontSize(22)
    .text("BUCKS", 46, 40);
  document
    .font("Helvetica")
    .fontSize(10)
    .fillColor("#bfc2b8")
    .text("FILTERED BOOK REPORT", 46, 72);
  document
    .font("Helvetica-Bold")
    .fontSize(18)
    .fillColor("#ffffff")
    .text(book.name, 46, 91);
  const range =
    query.from || query.to
      ? `${query.from ?? "Beginning"} to ${query.to ?? "Today"}`
      : "All dates";
  document
    .fillColor("#55584f")
    .font("Helvetica")
    .fontSize(9)
    .text(
      `Period: ${range}   |   Category: ${result.rows[0]?.category && query.categoryId ? result.rows[0].category : "All categories"}   |   Generated: ${new Date().toLocaleDateString("en-IN")}`,
      46,
      150,
    );
  const value = (minor: number) =>
    `${book.currency} ${(minor / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  document
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor("#252720")
    .text("CASH IN", 46, 181)
    .text("CASH OUT", 220, 181)
    .text("NET FLOW", 394, 181);
  document
    .fontSize(15)
    .text(value(income), 46, 198)
    .fillColor("#a95445")
    .text(value(expense), 220, 198)
    .fillColor(income - expense >= 0 ? "#367355" : "#a95445")
    .text(value(income - expense), 394, 198);
  let y = 244;
  const headings = () => {
    document.rect(46, y, 503, 24).fill("#edeee7");
    document
      .fillColor("#55584f")
      .font("Helvetica-Bold")
      .fontSize(8)
      .text("DATE", 54, y + 8)
      .text("TYPE", 108, y + 8)
      .text("CATEGORY", 158, y + 8)
      .text("DETAIL", 245, y + 8)
      .text("MODE", 405, y + 8)
      .text("AMOUNT", 475, y + 8);
    y += 29;
  };
  headings();
  for (const row of result.rows) {
    if (y > 760) {
      document.addPage();
      y = 48;
      headings();
    }
    const sign = row.kind === "income" ? "+" : "-";
    document
      .fillColor("#252720")
      .font("Helvetica")
      .fontSize(8)
      .text(new Date(row.occurred_at).toLocaleDateString("en-IN"), 54, y, {
        width: 50,
      })
      .text(row.kind === "income" ? "Cash in" : "Cash out", 108, y, {
        width: 48,
      })
      .text(row.category ?? "-", 158, y, { width: 82 })
      .text(row.title, 245, y, { width: 150, ellipsis: true })
      .text(String(row.payment_mode).replaceAll("_", " "), 405, y, {
        width: 65,
      })
      .font("Helvetica-Bold")
      .text(`${sign}${value(Number(row.amount_minor))}`, 475, y, {
        width: 74,
        align: "right",
      });
    y += 22;
    document
      .moveTo(46, y - 6)
      .lineTo(549, y - 6)
      .strokeColor("#e5e6de")
      .stroke();
  }
  if (!result.rows.length)
    document
      .fillColor("#777970")
      .font("Helvetica")
      .fontSize(10)
      .text("No entries match these filters.", 46, y + 12);
  const pages = document.bufferedPageRange();
  for (let index = pages.start; index < pages.start + pages.count; index++) {
    document.switchToPage(index);
    document
      .fillColor("#8a8c83")
      .font("Helvetica")
      .fontSize(8)
      .text(`bucks  |  ${book.name}`, 46, 780, { width: 400 })
      .text(`Page ${index + 1}`, 480, 780, { width: 69, align: "right" });
  }
  document.end();
  const pdf = await finished;
  const filename =
    String(book.name)
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() || "book";
  reply.header(
    "Content-Disposition",
    `attachment; filename="${filename}-report.pdf"`,
  );
  return reply.type("application/pdf").send(pdf);
});

app.get("/v1/books/:bookId", auth, async (request, reply) => {
  const { bookId } = bookParams.parse(request.params);
  const book = await ownedBook(userOf(request).id, bookId);
  if (!book)
    return reply
      .code(404)
      .send({ code: "NOT_FOUND", message: "Book not found." });
  const query = bookFilterSchema.parse(request.query);
  const filter = entryFilter(bookId, query);
  const summaryFilter = entryFilter(bookId, query, false);
  const entryValues = [...filter.values, query.limit + 1];
  const [entries, categories, summary, breakdown] = await Promise.all([
    db.query(
      `SELECT t.*,c.name category,c.color category_color FROM transactions t LEFT JOIN categories c ON c.id=t.category_id WHERE ${filter.clauses.join(" AND ")} ORDER BY t.occurred_at DESC,t.id DESC LIMIT $${entryValues.length}`,
      entryValues,
    ),
    db.query(
      `SELECT id,name,kind,color,icon,wallet_id FROM categories WHERE workspace_id=$1 AND archived_at IS NULL AND (wallet_id IS NULL OR wallet_id=$2) ORDER BY name`,
      [book.workspace_id, bookId],
    ),
    db.query(
      `SELECT COALESCE(SUM(CASE WHEN t.kind='income' THEN t.amount_minor ELSE 0 END),0) income_minor,COALESCE(SUM(CASE WHEN t.kind='expense' THEN t.amount_minor ELSE 0 END),0) expense_minor,COUNT(*) entry_count FROM transactions t WHERE ${summaryFilter.clauses.join(" AND ")}`,
      summaryFilter.values,
    ),
    db.query(
      `SELECT c.name,c.color,c.icon,SUM(t.amount_minor) amount_minor FROM transactions t JOIN categories c ON c.id=t.category_id WHERE ${summaryFilter.clauses.join(" AND ")} AND t.kind='expense' GROUP BY c.id ORDER BY amount_minor DESC LIMIT 6`,
      summaryFilter.values,
    ),
  ]);
  const hasMore = entries.rows.length > query.limit;
  const rows = entries.rows.slice(0, query.limit);
  const stats = summary.rows[0];
  const income = Number(stats.income_minor),
    expense = Number(stats.expense_minor);
  return {
    book: {
      id: book.id,
      name: book.name,
      description: book.description,
      kind: book.kind,
      currency: book.currency,
      icon: book.icon,
      color: book.color,
      archivedAt: book.archived_at,
      balanceMinor: income - expense,
      incomeMinor: income,
      expenseMinor: expense,
      entryCount: Number(stats.entry_count),
    },
    categories: categories.rows.map((row) => ({
      id: row.id,
      name: row.name,
      kind: row.kind,
      color: row.color,
      icon: row.icon,
      bookId: row.wallet_id,
    })),
    entries: rows.map(mapEntry),
    nextCursor: hasMore ? rows.at(-1)?.occurred_at : null,
    spendingByCategory: breakdown.rows.map((row) => ({
      ...row,
      amountMinor: Number(row.amount_minor),
    })),
  };
});

app.post("/v1/books/:bookId/entries", auth, async (request, reply) => {
  const { bookId } = bookParams.parse(request.params);
  const input = entryInput.parse(request.body);
  const user = userOf(request);
  const book = await ownedBook(user.id, bookId);
  if (!book || book.archived_at)
    return reply
      .code(404)
      .send({ code: "NOT_FOUND", message: "Active book not found." });
  const category = await db.query(
    `SELECT 1 FROM categories WHERE id=$1 AND workspace_id=$2 AND kind IN ($3,'both') AND archived_at IS NULL AND (wallet_id IS NULL OR wallet_id=$4)`,
    [input.categoryId, book.workspace_id, input.kind, bookId],
  );
  if (!category.rowCount)
    return reply.code(400).send({
      code: "INVALID_CATEGORY",
      message: "Choose an active category.",
    });
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `INSERT INTO transactions(workspace_id,wallet_id,category_id,title,kind,amount_minor,currency,note,occurred_at,idempotency_key,payment_mode) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(workspace_id,idempotency_key) DO UPDATE SET idempotency_key=EXCLUDED.idempotency_key RETURNING *`,
      [
        book.workspace_id,
        bookId,
        input.categoryId,
        input.title,
        input.kind,
        input.amountMinor,
        book.currency,
        input.note || null,
        input.occurredAt,
        input.idempotencyKey,
        input.paymentMode,
      ],
    );
    const row = result.rows[0];
    await audit(
      client,
      book.workspace_id,
      user.id,
      "entry",
      row.id,
      "created",
      null,
      row,
    );
    await client.query("COMMIT");
    return reply.code(201).send({ entry: mapEntry(row) });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});
app.patch("/v1/entries/:entryId", auth, async (request, reply) => {
  const { entryId } = entryParams.parse(request.params);
  const user = userOf(request);
  const input = entryInput
    .omit({ idempotencyKey: true })
    .partial()
    .parse(request.body);
  const current = await db.query(
    `SELECT t.* FROM transactions t JOIN workspace_members m ON m.workspace_id=t.workspace_id WHERE t.id=$1 AND m.user_id=$2 AND t.deleted_at IS NULL AND t.is_system=false`,
    [entryId, user.id],
  );
  if (!current.rowCount)
    return reply
      .code(404)
      .send({ code: "NOT_FOUND", message: "Editable entry not found." });
  const before = current.rows[0];
  const kind = input.kind ?? before.kind;
  const categoryId = input.categoryId ?? before.category_id;
  const valid = await db.query(
    `SELECT 1 FROM categories WHERE id=$1 AND workspace_id=$2 AND kind IN ($3,'both') AND archived_at IS NULL AND (wallet_id IS NULL OR wallet_id=$4)`,
    [categoryId, before.workspace_id, kind, before.wallet_id],
  );
  if (!valid.rowCount)
    return reply.code(400).send({
      code: "INVALID_CATEGORY",
      message: "Choose an active category.",
    });
  const result = await db.query(
    `UPDATE transactions SET title=COALESCE($1,title),kind=COALESCE($2,kind),amount_minor=COALESCE($3,amount_minor),category_id=COALESCE($4,category_id),occurred_at=COALESCE($5,occurred_at),payment_mode=COALESCE($6,payment_mode),note=CASE WHEN $7::boolean THEN $8 ELSE note END,updated_at=now() WHERE id=$9 RETURNING *`,
    [
      input.title,
      input.kind,
      input.amountMinor,
      input.categoryId,
      input.occurredAt,
      input.paymentMode,
      input.note !== undefined,
      input.note ?? null,
      entryId,
    ],
  );
  return { entry: mapEntry(result.rows[0]) };
});
app.delete("/v1/entries/:entryId", auth, async (request, reply) => {
  const { entryId } = entryParams.parse(request.params);
  const result = await db.query(
    `UPDATE transactions t SET deleted_at=now(),updated_at=now() FROM workspace_members m WHERE t.id=$1 AND m.workspace_id=t.workspace_id AND m.user_id=$2 AND t.deleted_at IS NULL AND t.is_system=false RETURNING t.id`,
    [entryId, userOf(request).id],
  );
  if (!result.rowCount)
    return reply
      .code(404)
      .send({ code: "NOT_FOUND", message: "Entry not found." });
  return reply.code(204).send();
});
app.post("/v1/entries/:entryId/restore", auth, async (request, reply) => {
  const { entryId } = entryParams.parse(request.params);
  const result = await db.query(
    `UPDATE transactions t SET deleted_at=NULL,updated_at=now() FROM workspace_members m WHERE t.id=$1 AND m.workspace_id=t.workspace_id AND m.user_id=$2 AND t.deleted_at IS NOT NULL RETURNING t.id`,
    [entryId, userOf(request).id],
  );
  if (!result.rowCount)
    return reply
      .code(404)
      .send({ code: "NOT_FOUND", message: "Deleted entry not found." });
  return { restored: true };
});

app.post(
  "/v1/workspaces/:workspaceId/categories",
  auth,
  async (request, reply) => {
    const { workspaceId } = workspaceParams.parse(request.params);
    const user = userOf(request);
    if (!(await workspaceFor(user.id, workspaceId)))
      return reply
        .code(404)
        .send({ code: "NOT_FOUND", message: "Workspace not found." });
    const input = z
      .object({
        name: z.string().trim().min(1).max(80),
        color: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .default("#737373"),
        icon: z.string().trim().min(1).max(12).default("•"),
        bookId: z.string().uuid().optional().nullable(),
      })
      .parse(request.body);
    if (input.bookId && !(await ownedBook(user.id, input.bookId)))
      return reply
        .code(400)
        .send({ code: "INVALID_BOOK", message: "Book is invalid." });
    try {
      const result = await db.query(
        `INSERT INTO categories(workspace_id,name,kind,color,icon,wallet_id) VALUES($1,$2,'both',$3,$4,$5) RETURNING *`,
        [
          workspaceId,
          input.name,
          input.color,
          input.icon,
          input.bookId || null,
        ],
      );
      return reply.code(201).send({
        category: {
          id: result.rows[0].id,
          name: result.rows[0].name,
          kind: result.rows[0].kind,
          color: result.rows[0].color,
          icon: result.rows[0].icon,
          bookId: result.rows[0].wallet_id,
        },
      });
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "23505")
        return reply.code(409).send({
          code: "CATEGORY_EXISTS",
          message: "That category already exists.",
        });
      throw error;
    }
  },
);
app.patch("/v1/categories/:categoryId", auth, async (request, reply) => {
  const { categoryId } = categoryParams.parse(request.params);
  const input = z
    .object({
      name: z.string().trim().min(1).max(80).optional(),
      color: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .optional(),
      icon: z.string().trim().min(1).max(12).optional(),
      archived: z.boolean().optional(),
    })
    .parse(request.body);
  const result = await db.query(
    `UPDATE categories c SET name=COALESCE($1,name),color=COALESCE($2,color),icon=COALESCE($3,icon),archived_at=CASE WHEN $4::boolean IS TRUE THEN now() WHEN $4::boolean IS FALSE THEN NULL ELSE archived_at END,updated_at=now() FROM workspace_members m WHERE c.id=$5 AND m.workspace_id=c.workspace_id AND m.user_id=$6 RETURNING c.id`,
    [
      input.name,
      input.color,
      input.icon,
      input.archived,
      categoryId,
      userOf(request).id,
    ],
  );
  if (!result.rowCount)
    return reply
      .code(404)
      .send({ code: "NOT_FOUND", message: "Category not found." });
  return { updated: true };
});

app.get("/health", async () => {
  await db.query("SELECT 1");
  return { status: "ok" };
});
app.setNotFoundHandler((request, reply) => {
  if (
    env.NODE_ENV === "production" &&
    request.method === "GET" &&
    !request.url.startsWith("/v1/") &&
    request.headers.accept?.includes("text/html")
  )
    return reply.sendFile("index.html");
  return reply
    .code(404)
    .send({ code: "NOT_FOUND", message: "Route not found." });
});
app.setErrorHandler((error, request, reply) => {
  if (error instanceof ZodError)
    return reply.code(400).send({
      code: "INVALID_INPUT",
      message: error.issues[0]?.message ?? "Invalid input.",
    });
  request.log.error(error);
  return reply
    .code(500)
    .send({ code: "INTERNAL_ERROR", message: "Something went wrong." });
});
const close = async () => {
  await app.close();
  await db.end();
};
process.on("SIGINT", close);
process.on("SIGTERM", close);
if (env.NODE_ENV !== "test")
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
export { app, db };
