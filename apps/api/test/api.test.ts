import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";
import { app, db } from "../src/server.ts";
import { api } from "../../../src/api.ts";

test("frontend logout sends an empty POST and clears the session cookie", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    assert.equal(input, "/v1/auth/logout");
    assert.equal(init?.method, "POST");
    assert.equal(init?.credentials, "include");
    assert.equal(new Headers(init?.headers).has("Content-Type"), false);
    const response = await app.inject({
      method: "POST",
      url: String(input),
      headers: Object.fromEntries(new Headers(init?.headers)),
    });
    assert.equal(response.statusCode, 204);
    const sessionCookie = response.cookies.find(
      (cookie) => cookie.name === "daybook_session",
    );
    assert.ok(sessionCookie);
    assert.equal(sessionCookie.value, "");
    assert.equal(sessionCookie.path, "/");
    assert.ok(new Date(sessionCookie.expires!).getTime() < Date.now());
    return new Response(null, { status: response.statusCode });
  };
  try {
    await api.logout();
    const me = await app.inject({ method: "GET", url: "/v1/auth/me" });
    assert.equal(me.statusCode, 401);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

const userEmails: string[] = [];
async function register() {
  const email = `daybook-test-${randomUUID()}@example.com`;
  userEmails.push(email);
  const response = await app.inject({
    method: "POST",
    url: "/v1/auth/register",
    payload: { email, password: "Integration-password-2026" },
  });
  assert.equal(response.statusCode, 201);
  return {
    body: response.json<{ workspaceId: string }>(),
    cookie: `${response.cookies[0].name}=${response.cookies[0].value}`,
  };
}

test("books are private and duplicate retries do not change the balance twice", async () => {
  const owner = await register();
  const stranger = await register();
  const created = await app.inject({
    method: "POST",
    url: `/v1/workspaces/${owner.body.workspaceId}/books`,
    headers: { cookie: owner.cookie },
    payload: {
      name: "Test bank",
      kind: "bank",
      currency: "INR",
      openingBalanceMinor: 100000,
      color: "#456789",
      icon: "B",
    },
  });
  assert.equal(created.statusCode, 201);
  const bookId = created.json<{ bookId: string }>().bookId;
  const forbidden = await app.inject({
    method: "GET",
    url: `/v1/books/${bookId}`,
    headers: { cookie: stranger.cookie },
  });
  assert.equal(forbidden.statusCode, 404);
  const detail = await app.inject({
    method: "GET",
    url: `/v1/books/${bookId}`,
    headers: { cookie: owner.cookie },
  });
  const categoryId = detail.json<{
    categories: Array<{ id: string; kind: string }>;
  }>().categories[0]?.id;
  assert.ok(categoryId);
  const payload = {
    title: "Lunch",
    kind: "expense",
    amountMinor: 12500,
    categoryId,
    occurredAt: new Date().toISOString(),
    paymentMode: "upi",
    note: "Team lunch",
    idempotencyKey: randomUUID(),
  };
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: `/v1/books/${bookId}/entries`,
        headers: { cookie: owner.cookie },
        payload,
      })
    ).statusCode,
    201,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: `/v1/books/${bookId}/entries`,
        headers: { cookie: owner.cookie },
        payload,
      })
    ).statusCode,
    201,
  );
  const incomePayload = {
    ...payload,
    title: "Reimbursement",
    kind: "income",
    amountMinor: 5000,
    idempotencyKey: randomUUID(),
  };
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: `/v1/books/${bookId}/entries`,
        headers: { cookie: owner.cookie },
        payload: incomePayload,
      })
    ).statusCode,
    201,
  );
  const final = await app.inject({
    method: "GET",
    url: `/v1/books/${bookId}`,
    headers: { cookie: owner.cookie },
  });
  const finalBook = final.json<{
    book: {
      balanceMinor: number;
      incomeMinor: number;
      expenseMinor: number;
      entryCount: number;
    };
  }>().book;
  assert.deepEqual(
    {
      balanceMinor: finalBook.balanceMinor,
      incomeMinor: finalBook.incomeMinor,
      expenseMinor: finalBook.expenseMinor,
      entryCount: finalBook.entryCount,
    },
    {
      balanceMinor: 92500,
      incomeMinor: 105000,
      expenseMinor: 12500,
      entryCount: 3,
    },
  );
  const emptyRange = await app.inject({
    method: "GET",
    url: `/v1/books/${bookId}?from=2099-01-01&to=2099-01-31`,
    headers: { cookie: owner.cookie },
  });
  assert.equal(emptyRange.json<{ entries: unknown[] }>().entries.length, 0);
  const dashboard = await app.inject({
    method: "GET",
    url: `/v1/workspaces/${owner.body.workspaceId}/dashboard`,
    headers: { cookie: owner.cookie },
  });
  assert.equal(dashboard.statusCode, 200);
  assert.equal(
    dashboard.json<{ books: Array<{ id: string }> }>().books[0].id,
    bookId,
  );
  const pdf = await app.inject({
    method: "GET",
    url: `/v1/books/${bookId}/export.pdf?categoryId=${categoryId}`,
    headers: { cookie: owner.cookie },
  });
  assert.equal(pdf.statusCode, 200);
  assert.equal(pdf.headers["content-type"], "application/pdf");
  assert.equal(pdf.rawPayload.subarray(0, 4).toString(), "%PDF");
});

after(async () => {
  await db.query(
    "DELETE FROM workspaces WHERE owner_id IN (SELECT id FROM users WHERE email = ANY($1))",
    [userEmails],
  );
  await db.query("DELETE FROM users WHERE email = ANY($1)", [userEmails]);
  await app.close();
  await db.end();
});
