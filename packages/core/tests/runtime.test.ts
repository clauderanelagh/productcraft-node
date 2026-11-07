import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  APIClient,
  APIConnectionError,
  APIError,
  APITimeoutError,
  APIUserAbortError,
  AuthenticationError,
  BadRequestError,
  ConfigurationError,
  ConflictError,
  IdempotencyKeyReuseError,
  InternalServerError,
  NotFoundError,
  Page,
  PagePromise,
  PermissionDeniedError,
  RateLimitError,
  UnprocessableEntityError,
  _resetWorkspaceCache,
  createOpenAPIClient,
  type ClientOptions,
  type RequestSpec,
} from "../src/index.js";
import { startMockServer, type MockServer } from "./mock-server.js";

let server: MockServer;
beforeAll(async () => {
  server = await startMockServer();
});
afterAll(async () => {
  await server.close();
});
beforeEach(() => {
  // Zero backoff: full jitter * 0.
  vi.spyOn(Math, "random").mockReturnValue(0);
  _resetWorkspaceCache();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const WS = "9b2f6c1e-0000-4000-8000-000000000001";
const make = (o: ClientOptions = {}) => new APIClient({ apiKey: "pcft_test_key", workspaceId: WS, ...o }, server.url);
const get = (path = "/v1/things"): RequestSpec => ({ method: "GET", path });
const post = (idempotent: boolean, path = "/v1/things"): RequestSpec => ({ method: "POST", path, body: { a: 1 }, idempotent });

describe("retries", () => {
  const retried = [408, 429, 500, 502, 503, 504];
  for (const status of retried) {
    it(`GET retries ${status} then succeeds`, async () => {
      server.reply({ status, body: { code: "X", message: "nope" } }, { status: 200, body: { ok: true } });
      const data = await make().request<{ ok: boolean }>(get());
      expect(data.ok).toBe(true);
      expect(server.requests).toHaveLength(2);
      expect(server.requests[1]?.headers["x-pc-sdk-retry-count"]).toBe("1");
      expect(server.requests[0]?.headers["x-pc-sdk-retry-count"]).toBeUndefined();
    });
  }

  for (const status of [400, 401, 403, 404, 409, 422]) {
    it(`does not retry ${status}`, async () => {
      server.reply({ status, body: { code: "X", message: "nope" } });
      await expect(make().request(get())).rejects.toBeInstanceOf(APIError);
      expect(server.requests).toHaveLength(1);
    });
  }

  it("gives up after maxRetries (default 2) and throws the last error", async () => {
    server.reply({ status: 503, body: { code: "UNAVAILABLE", message: "down" } });
    const err = await make().request(get()).catch((e) => e);
    expect(err).toBeInstanceOf(InternalServerError);
    expect(server.requests).toHaveLength(3);
  });

  it("maxRetries per request overrides the client", async () => {
    server.reply({ status: 500, body: {} });
    await expect(make({ maxRetries: 5 }).request(get(), { maxRetries: 0 })).rejects.toBeInstanceOf(InternalServerError);
    expect(server.requests).toHaveLength(1);
  });

  it("PUT and DELETE are retried", async () => {
    for (const method of ["PUT", "DELETE"] as const) {
      server.reply({ status: 502, body: {} }, { status: 204 });
      await make().request({ method, path: "/v1/things/1" });
      expect(server.requests).toHaveLength(2);
    }
  });

  it("a POST without an idempotency key is never retried, on 5xx or connection errors", async () => {
    server.reply({ status: 503, body: {} });
    await expect(make().request(post(false))).rejects.toBeInstanceOf(InternalServerError);
    expect(server.requests).toHaveLength(1);

    server.reply({ destroy: true });
    await expect(make().request(post(false))).rejects.toBeInstanceOf(APIConnectionError);
    expect(server.requests).toHaveLength(1);

    server.reply({ status: 429, body: {} });
    await expect(make().request({ method: "PATCH", path: "/v1/things/1", body: {} })).rejects.toBeInstanceOf(RateLimitError);
    expect(server.requests).toHaveLength(1);
  });

  it("a POST with a declared key is retried, and a connection error on GET is retried", async () => {
    server.reply({ status: 500, body: {} }, { status: 201, body: { id: "1" } });
    await make().request(post(true));
    expect(server.requests).toHaveLength(2);

    server.reply({ destroy: true }, { status: 200, body: { ok: 1 } });
    await make().request(get());
    expect(server.requests).toHaveLength(2);
  });

  it("a caller-supplied idempotencyKey makes an undeclared POST retryable", async () => {
    server.reply({ status: 500, body: {} }, { status: 200, body: {} });
    await make().request(post(false), { idempotencyKey: "mine-1" });
    expect(server.requests).toHaveLength(2);
    expect(server.requests.map((r) => r.headers["idempotency-key"])).toEqual(["mine-1", "mine-1"]);
  });

  it("retries 409 only for IDEMPOTENCY_IN_PROGRESS", async () => {
    server.reply({ status: 409, headers: { "retry-after": "0" }, body: { code: "IDEMPOTENCY_IN_PROGRESS", message: "busy" } }, { status: 201, body: { id: "1" } });
    await make().request(post(true));
    expect(server.requests).toHaveLength(2);

    server.reply({ status: 409, body: { code: "SLUG_TAKEN", message: "taken" } });
    await expect(make().request(post(true))).rejects.toBeInstanceOf(ConflictError);
    expect(server.requests).toHaveLength(1);
  });
});

describe("Retry-After", () => {
  it("honours seconds", async () => {
    server.reply({ status: 429, headers: { "retry-after": "1" }, body: {} }, { status: 200, body: {} });
    const t0 = Date.now();
    await make().request(get());
    expect(Date.now() - t0).toBeGreaterThanOrEqual(950);
  });

  it("honours an HTTP date", async () => {
    server.reply(() => ({ status: 503, headers: { "retry-after": new Date(Date.now() + 2_000).toUTCString() }, body: {} }), { status: 200, body: {} });
    const t0 = Date.now();
    await make().request(get());
    // HTTP dates have 1 s resolution: at least ~1 s of the 2 s survives truncation.
    expect(Date.now() - t0).toBeGreaterThanOrEqual(900);
    expect(server.requests).toHaveLength(2);
  });

  it("honours retry-after-ms over retry-after", async () => {
    server.reply({ status: 429, headers: { "retry-after-ms": "150", "retry-after": "30" }, body: {} }, { status: 200, body: {} });
    const t0 = Date.now();
    await make().request(get());
    const took = Date.now() - t0;
    expect(took).toBeGreaterThanOrEqual(140);
    expect(took).toBeLessThan(5_000);
  });

  it("above 60 s fails fast with RateLimitError carrying retryAfter", async () => {
    server.reply({ status: 429, headers: { "retry-after": "120" }, body: { code: "RATE_LIMITED", message: "slow down" } });
    const err = (await make().request(get()).catch((e) => e)) as RateLimitError;
    expect(err).toBeInstanceOf(RateLimitError);
    expect(err.retryAfter).toBe(120);
    expect(server.requests).toHaveLength(1);
  });

  it("exactly 60 s is still honoured (cap is inclusive)", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    try {
      server.reply({ status: 429, headers: { "retry-after": "60" }, body: {} }, { status: 200, body: { ok: 1 } });
      const p = make().request<{ ok: number }>(get());
      await vi.waitFor(() => expect(server.requests).toHaveLength(1));
      await vi.advanceTimersByTimeAsync(60_000);
      await expect(p).resolves.toEqual({ ok: 1 });
      expect(server.requests).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("backoff without Retry-After is full jitter capped at min(8 s, 0.5 s * 2^n)", async () => {
    const { backoffMs } = await import("../src/client.js");
    vi.spyOn(Math, "random").mockReturnValue(0.999999);
    expect(backoffMs(0)).toBeCloseTo(500, -1);
    expect(backoffMs(1)).toBeCloseTo(1000, -1);
    expect(backoffMs(4)).toBeCloseTo(8000, -1);
    expect(backoffMs(10)).toBeCloseTo(8000, -1);
  });
});

describe("idempotency keys", () => {
  it("generates pc_<uuid> once per call and reuses it on every retry", async () => {
    server.reply({ status: 500, body: {} }, { status: 503, body: {} }, { status: 201, body: {} });
    await make().request(post(true));
    const keys = server.requests.map((r) => r.headers["idempotency-key"]);
    expect(keys).toHaveLength(3);
    expect(keys[0]).toMatch(/^pc_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(new Set(keys).size).toBe(1);
  });

  it("differs between calls", async () => {
    server.reply({ status: 201, body: {} });
    const c = make();
    await c.request(post(true));
    await c.request(post(true));
    // reply() reset the log only once, so both calls are recorded.
    expect(server.requests[0]?.headers["idempotency-key"]).not.toBe(server.requests[1]?.headers["idempotency-key"]);
  });

  it("is overridable and absent when the op does not declare it", async () => {
    server.reply({ status: 201, body: {} });
    await make().request(post(true), { idempotencyKey: "order-1234" });
    expect(server.requests[0]?.headers["idempotency-key"]).toBe("order-1234");
    server.reply({ status: 201, body: {} });
    await make().request(post(false));
    expect(server.requests[0]?.headers["idempotency-key"]).toBeUndefined();
  });
});

describe("pagination", () => {
  const pages = (r: { query: URLSearchParams }) => {
    const cursor = r.query.get("cursor");
    const n = cursor === null ? 1 : Number(cursor.replace("c", ""));
    const items = [1, 2].map((i) => ({ id: `${n}-${i}` }));
    return { status: 200, body: { data: items, pagination: { next_cursor: n < 3 ? `c${n + 1}` : null, has_more: n < 3 } } };
  };
  const spec: RequestSpec = { method: "GET", path: "/v1/workspaces/{workspace_id}/things", query: { limit: 2 } };

  it("await gives one Page with navigation", async () => {
    server.reply(pages);
    const page = await make().list<{ id: string }>(spec);
    expect(page).toBeInstanceOf(Page);
    expect(page.data.map((d) => d.id)).toEqual(["1-1", "1-2"]);
    expect(page.has_more).toBe(true);
    expect(page.next_cursor).toBe("c2");
    expect(page.hasNextPage()).toBe(true);
    const second = await page.getNextPage();
    expect(second.data[0]?.id).toBe("2-1");
    expect(server.requests[1]?.query.get("cursor")).toBe("c2");
    expect(server.requests[1]?.query.get("limit")).toBe("2");
    expect(server.requests[1]?.path).toBe(`/v1/workspaces/${WS}/things`);
    expect(page.lastResponse.status).toBe(200);
    expect(JSON.stringify(page)).toBe(JSON.stringify({ data: page.data, pagination: { next_cursor: "c2", has_more: true } }));
  });

  it("for await iterates every item across 3 pages", async () => {
    server.reply(pages);
    const ids: string[] = [];
    for await (const item of make().list<{ id: string }>(spec)) ids.push(item.id);
    expect(ids).toEqual(["1-1", "1-2", "2-1", "2-2", "3-1", "3-2"]);
    expect(server.requests).toHaveLength(3);
  });

  it(".pages() iterates pages", async () => {
    server.reply(pages);
    const sizes: number[] = [];
    for await (const page of make().list(spec).pages()) sizes.push(page.data.length);
    expect(sizes).toEqual([2, 2, 2]);
  });

  it("toArray stops at maxItems and fetches no further pages", async () => {
    server.reply(pages);
    const items = await make().list<{ id: string }>(spec).toArray({ maxItems: 3 });
    expect(items.map((i) => i.id)).toEqual(["1-1", "1-2", "2-1"]);
    expect(server.requests).toHaveLength(2);
    // @ts-expect-error maxItems is required
    await expect(make().list(spec).toArray({})).rejects.toBeInstanceOf(Error);
  });

  it("getNextPage on the last page throws", async () => {
    server.reply({ status: 200, body: { data: [], pagination: { next_cursor: null, has_more: false } } });
    const page = await make().list(spec);
    expect(page.hasNextPage()).toBe(false);
    expect(() => page.getNextPage()).toThrow(/No next page/);
  });

  it("is a PagePromise with withResponse", async () => {
    server.reply(pages);
    const p = make().list(spec);
    expect(p).toBeInstanceOf(PagePromise);
    const { data, response } = await p.withResponse();
    expect(data.data).toHaveLength(2);
    expect(response.status).toBe(200);
  });
});

describe("polling", () => {
  const retrieve: RequestSpec = { method: "GET", path: "/v1/workspaces/{workspace_id}/jobs/{id}", pathParams: { id: "j1" } };
  const cfg = { field: "status", terminal: ["completed", "failed", "cancelled"] };

  it("polls until a terminal status", async () => {
    server.reply({ status: 200, body: { id: "j1", status: "queued" } }, { status: 200, body: { id: "j1", status: "running" } }, { status: 200, body: { id: "j1", status: "completed" } });
    const job = await make().poll<{ status: string }>(retrieve, cfg, { intervalMs: 10 });
    expect(job.status).toBe("completed");
    expect(server.requests).toHaveLength(3);
  });

  it("respects Retry-After on a non-terminal response", async () => {
    server.reply({ status: 200, headers: { "retry-after-ms": "200" }, body: { status: "running" } }, { status: 200, body: { status: "failed" } });
    const t0 = Date.now();
    await make().poll(retrieve, cfg, { intervalMs: 1 });
    expect(Date.now() - t0).toBeGreaterThanOrEqual(190);
  });

  it("throws APITimeoutError when timeoutMs passes", async () => {
    server.reply({ status: 200, body: { status: "running" } });
    const err = await make().poll(retrieve, cfg, { intervalMs: 20, timeoutMs: 100 }).catch((e) => e);
    expect(err).toBeInstanceOf(APITimeoutError);
    expect(String(err.message)).toMatch(/running/);
  });

  it("createAndPoll creates once with an idempotency key, then polls without it", async () => {
    server.reply(
      { status: 201, body: { id: "j9", status: "queued" } },
      { status: 200, body: { id: "j9", status: "running" } },
      { status: 200, body: { id: "j9", status: "completed" } },
    );
    const job = await make().createAndPoll<{ id: string; status: string }>(
      { method: "POST", path: "/v1/workspaces/{workspace_id}/jobs", body: { urls: [] }, idempotent: true },
      (created) => ({ method: "GET", path: "/v1/workspaces/{workspace_id}/jobs/{id}", pathParams: { id: created.id } }),
      cfg,
      { intervalMs: 5 },
    );
    expect(job.status).toBe("completed");
    expect(server.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      `POST /v1/workspaces/${WS}/jobs`,
      `GET /v1/workspaces/${WS}/jobs/j9`,
      `GET /v1/workspaces/${WS}/jobs/j9`,
    ]);
    expect(server.requests[0]?.headers["idempotency-key"]).toMatch(/^pc_/);
    expect(server.requests[1]?.headers["idempotency-key"]).toBeUndefined();
  });

  it("an abort during the wait stops the poll", async () => {
    server.reply({ status: 200, body: { status: "running" } });
    const ctl = new AbortController();
    setTimeout(() => ctl.abort(), 50);
    await expect(make().poll(retrieve, cfg, { intervalMs: 10_000, signal: ctl.signal })).rejects.toBeInstanceOf(APIUserAbortError);
  });
});

describe("timeouts and aborts", () => {
  it("a slow response throws APITimeoutError", async () => {
    server.reply({ status: 200, body: {}, delayMs: 500 });
    const err = await make({ timeout: 50, maxRetries: 0 }).request(get()).catch((e) => e);
    expect(err).toBeInstanceOf(APITimeoutError);
    expect(err).toBeInstanceOf(APIConnectionError);
  });

  it("a timed-out GET is retried", async () => {
    server.reply({ status: 200, body: {}, delayMs: 300 }, { status: 200, body: { ok: 1 } });
    await expect(make({ timeout: 50 }).request(get())).resolves.toEqual({ ok: 1 });
    expect(server.requests).toHaveLength(2);
  });

  it("the per-request timeout wins", async () => {
    server.reply({ status: 200, body: {}, delayMs: 300 });
    await expect(make({ timeout: 10_000 }).request(get(), { timeout: 30, maxRetries: 0 })).rejects.toBeInstanceOf(APITimeoutError);
  });

  it("a caller abort throws APIUserAbortError and is not retried", async () => {
    server.reply({ status: 200, body: {}, delayMs: 500 });
    const ctl = new AbortController();
    setTimeout(() => ctl.abort(), 30);
    const err = await make().request(get(), { signal: ctl.signal }).catch((e) => e);
    expect(err).toBeInstanceOf(APIUserAbortError);
    expect(err).not.toBeInstanceOf(APITimeoutError);
    expect(server.requests).toHaveLength(1);
  });

  it("an already-aborted signal sends nothing", async () => {
    server.reply({ status: 200, body: {} });
    await expect(make().request(get(), { signal: AbortSignal.abort() })).rejects.toBeInstanceOf(APIUserAbortError);
    expect(server.requests).toHaveLength(0);
  });
});

describe("error mapping", () => {
  const cases: [number, unknown][] = [
    [400, BadRequestError],
    [401, AuthenticationError],
    [403, PermissionDeniedError],
    [404, NotFoundError],
    [409, ConflictError],
    [422, UnprocessableEntityError],
    [429, RateLimitError],
    [500, InternalServerError],
    [418, APIError],
  ];
  for (const [status, cls] of cases) {
    it(`${status} maps to ${(cls as { name: string }).name}`, async () => {
      server.reply({ status, body: { code: "SOME_CODE", message: "m", request_id: "req_body" } });
      const err = await make({ maxRetries: 0 }).request(get()).catch((e) => e);
      expect(err).toBeInstanceOf(cls as typeof APIError);
      expect(err.status).toBe(status);
      expect(err.code).toBe("SOME_CODE");
    });
  }

  it("409 IDEMPOTENCY_KEY_REUSE is IdempotencyKeyReuseError, also a ConflictError", async () => {
    server.reply({ status: 409, body: { code: "IDEMPOTENCY_KEY_REUSE", message: "Idempotency key reused with a different body" } });
    const err = await make().request(post(true)).catch((e) => e);
    expect(err).toBeInstanceOf(IdempotencyKeyReuseError);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.name).toBe("IdempotencyKeyReuseError");
  });

  it("joins an array message and maps envelope errors and details", async () => {
    server.reply({
      status: 400,
      headers: { "x-request-id": "req_header" },
      body: {
        status_code: 400,
        code: "VALIDATION_ERROR",
        message: ["to must be an email", "subject should not be empty"],
        request_id: "req_body",
        errors: [
          { param: "to", message: "to must be an email", code: "isEmail" },
          { param: "subject", message: "subject should not be empty" },
        ],
        details: { fqdn: "mail.example.com", reason: "not_verified" },
      },
    });
    const err = (await make().request(post(false)).catch((e) => e)) as BadRequestError;
    expect(err.message).toBe("to must be an email; subject should not be empty");
    expect(err.errors).toEqual([
      { param: "to", message: "to must be an email", code: "isEmail" },
      { param: "subject", message: "subject should not be empty" },
    ]);
    expect(err.details).toEqual({ fqdn: "mail.example.com", reason: "not_verified" });
    expect(err.docUrl).toBe("https://productcraft.co/docs/errors#VALIDATION_ERROR");
    expect(err.requestId).toBe("req_header");
    expect(err.headers.get("x-request-id")).toBe("req_header");
    expect((err.body as { status_code: number }).status_code).toBe(400);
  });

  it("requestId falls back to the envelope's request_id", async () => {
    server.reply({ status: 404, body: { code: "NOT_FOUND", message: "Job not found", request_id: "req_from_body" } });
    const err = await make().request(get()).catch((e) => e);
    expect(err.requestId).toBe("req_from_body");
    expect(err.errors).toEqual([]);
    expect(err.details).toBeUndefined();
  });

  it("a non-JSON error body is kept as text", async () => {
    server.reply({ status: 502, headers: { "content-type": "text/html" }, body: "<html>Bad gateway</html>" });
    const err = await make({ maxRetries: 0 }).request(get()).catch((e) => e);
    expect(err).toBeInstanceOf(InternalServerError);
    expect(err.body).toBe("<html>Bad gateway</html>");
    expect(err.code).toBeUndefined();
    expect(err.docUrl).toBeUndefined();
  });
});

describe("responses", () => {
  it("lastResponse is attached, non-enumerable and absent from JSON.stringify", async () => {
    server.reply({ status: 200, headers: { "x-request-id": "req_123" }, body: { id: "d1", name: "x" } });
    const d = await make().request<{ id: string; name: string; lastResponse: { requestId: string; status: number } }>(get());
    expect(d.lastResponse.requestId).toBe("req_123");
    expect(d.lastResponse.status).toBe(200);
    expect(JSON.stringify(d)).toBe('{"id":"d1","name":"x"}');
    expect(Object.keys(d)).toEqual(["id", "name"]);
    expect({ ...d }).toEqual({ id: "d1", name: "x" });
  });

  it("withResponse gives data, response, requestId and rateLimit", async () => {
    server.reply({ status: 200, headers: { "x-request-id": "req_9", "x-ratelimit-limit": "100", "x-ratelimit-remaining": "99", "x-ratelimit-reset": "30" }, body: { ok: true } });
    const { data, response, requestId, rateLimit } = await make().request<{ ok: boolean }>(get()).withResponse();
    expect(data.ok).toBe(true);
    expect(response.status).toBe(200);
    expect(requestId).toBe("req_9");
    expect(rateLimit).toEqual({ limit: 100, remaining: 99, reset: 30 });
  });

  it("asResponse gives the unread Response", async () => {
    server.reply({ status: 200, body: { ok: true } });
    const res = await make().request(get()).asResponse();
    expect(await res.json()).toEqual({ ok: true });
  });

  it("a non-JSON success resolves to the Response", async () => {
    server.reply({ status: 200, headers: { "content-type": "text/csv" }, body: "a,b\n1,2\n" });
    const res = await make().request<Response>(get("/v1/things/export.csv"));
    expect(res).toBeInstanceOf(Response);
    expect(await res.text()).toBe("a,b\n1,2\n");
  });

  it("raw ops resolve to the Response even for JSON content", async () => {
    server.reply({ status: 200, body: { looks: "json" } });
    const res = await make().request<Response>({ ...get(), raw: true });
    expect(res).toBeInstanceOf(Response);
  });

  it("204 resolves to undefined", async () => {
    server.reply({ status: 204 });
    await expect(make().request({ method: "DELETE", path: "/v1/things/1" })).resolves.toBeUndefined();
  });

  it("is a real Promise", async () => {
    server.reply({ status: 200, body: {} });
    const p = make().request(get());
    expect(p).toBeInstanceOf(Promise);
    await p;
  });
});

describe("request shape", () => {
  it("sends auth, JSON body, query arrays, encoded path params and User-Agent", async () => {
    server.reply({ status: 200, body: {} });
    await make().request({
      method: "POST",
      path: "/v1/workspaces/{workspace_id}/templates/{name}/send",
      pathParams: { name: "welcome mail/1" },
      query: { status: ["bounced", "delivered"], limit: 5, skip: undefined },
      body: { to: "success@simulator.amazonses.com" },
    }, { headers: { "X-Trace": "abc" } });
    const r = server.requests[0]!;
    expect(r.path).toBe(`/v1/workspaces/${WS}/templates/welcome%20mail%2F1/send`);
    expect(r.query.getAll("status")).toEqual(["bounced", "delivered"]);
    expect(r.query.get("limit")).toBe("5");
    expect(r.query.has("skip")).toBe(false);
    expect(r.headers.authorization).toBe("Bearer pcft_test_key");
    expect(r.headers["content-type"]).toBe("application/json");
    expect(JSON.parse(r.body)).toEqual({ to: "success@simulator.amazonses.com" });
    expect(r.headers["x-trace"]).toBe("abc");
    expect(r.headers["user-agent"]).toMatch(/^productcraft-node\/core@\S+ node\/\d+\.\d+\.\d+$/);
  });

  it("uses the product identity in User-Agent", async () => {
    server.reply({ status: 200, body: {} });
    await new APIClient({ apiKey: "k", workspaceId: WS }, server.url, { name: "mail", version: "1.0.0" }).request(get());
    expect(server.requests[0]?.headers["user-agent"]).toMatch(/^productcraft-node\/mail@1\.0\.0 node\//);
  });

  it("public ops send no credential; bearer and cookie credentials are sent as configured", async () => {
    server.reply({ status: 200, body: {} });
    await make().request({ ...get(), public: true });
    expect(server.requests[0]?.headers.authorization).toBeUndefined();
    server.reply({ status: 200, body: {} });
    await new APIClient({ auth: { type: "bearer", token: "jwt" }, workspaceId: WS }, server.url).request(get());
    expect(server.requests[0]?.headers.authorization).toBe("Bearer jwt");
    server.reply({ status: 200, body: {} });
    await new APIClient({ auth: { type: "cookie", value: "c1" } }, server.url).request(get());
    expect(server.requests[0]?.headers.cookie).toBe("auth_token=c1");
  });

  it("falls back to PRODUCTCRAFT_API_KEY", async () => {
    vi.stubEnv("PRODUCTCRAFT_API_KEY", "pcft_from_env");
    server.reply({ status: 200, body: {} });
    await new APIClient({ workspaceId: WS }, server.url).request(get());
    expect(server.requests[0]?.headers.authorization).toBe("Bearer pcft_from_env");
  });

  it("credentialFromEnv: false never reads PRODUCTCRAFT_API_KEY, but an explicit credential is still sent", async () => {
    vi.stubEnv("PRODUCTCRAFT_API_KEY", "pcft_from_env");
    server.reply({ status: 200, body: {} });
    await new APIClient({ workspaceId: WS, credentialFromEnv: false }, server.url).request(get());
    expect(server.requests[0]?.headers.authorization).toBeUndefined();
    server.reply({ status: 200, body: {} });
    await new APIClient({ workspaceId: WS, apiKey: "pcft_explicit", credentialFromEnv: false }, server.url).request(get());
    expect(server.requests[0]?.headers.authorization).toBe("Bearer pcft_explicit");
  });

  it("missing path params throw before sending", async () => {
    server.reply({ status: 200, body: {} });
    await expect(make().request({ method: "GET", path: "/v1/things/{id}" })).rejects.toThrow(/Missing path parameter "id"/);
    expect(server.requests).toHaveLength(0);
  });

  it("the per-request fetch option is used", async () => {
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      calls.push(String(input));
      return globalThis.fetch(input, init);
    };
    server.reply({ status: 200, body: {} });
    await make().request(get(), { fetch: fetchImpl });
    expect(calls).toEqual([`${server.url}/v1/things`]);
  });
});

describe("workspace id resolution", () => {
  const scoped: RequestSpec = { method: "GET", path: "/v1/workspaces/{workspace_id}/domains" };
  const selfOk = (r: { path: string }) =>
    r.path === "/v1/api-keys/self"
      ? { status: 200, body: { key_id: "k", name: "n", workspace: { id: "ws-from-key", slug: "acme", name: "Acme" } } }
      : { status: 200, body: { data: [] } };

  it("option, then per-request override", async () => {
    server.reply({ status: 200, body: {} });
    await make().request(scoped, { workspaceId: "ws-override" });
    expect(server.requests[0]?.path).toBe("/v1/workspaces/ws-override/domains");
  });

  it("reads PRODUCTCRAFT_WORKSPACE_ID", async () => {
    vi.stubEnv("PRODUCTCRAFT_WORKSPACE_ID", "ws-env");
    server.reply({ status: 200, body: {} });
    await new APIClient({ apiKey: "k" }, server.url).request(scoped);
    expect(server.requests[0]?.path).toBe("/v1/workspaces/ws-env/domains");
  });

  it("looks the workspace up once per process for a workspace key, shared across clients", async () => {
    server.reply(selfOk);
    const opts = { apiKey: "pcft_lookup_once", platformAuthBaseUrl: server.url };
    const a = new APIClient(opts, server.url);
    const b = new APIClient(opts, server.url);
    await Promise.all([a.request(scoped), a.request(scoped), b.request(scoped)]);
    const lookups = server.requests.filter((r) => r.path === "/v1/api-keys/self");
    expect(lookups).toHaveLength(1);
    expect(lookups[0]?.headers.authorization).toBe("Bearer pcft_lookup_once");
    expect(server.requests.filter((r) => r.path === "/v1/workspaces/ws-from-key/domains")).toHaveLength(3);
  });

  it("a failed lookup throws ConfigurationError and is not cached", async () => {
    server.reply((r) => (r.path === "/v1/api-keys/self" ? { status: 403, body: { code: "WORKSPACE_KEY_REQUIRED", message: "no" } } : { status: 200, body: {} }));
    const c = new APIClient({ apiKey: "pcft_lookup_fails", platformAuthBaseUrl: server.url }, server.url);
    const err = await c.request(scoped).catch((e) => e);
    expect(err).toBeInstanceOf(ConfigurationError);
    expect(err.message).toMatch(/pass workspaceId/);
    expect(err.cause).toBeInstanceOf(PermissionDeniedError);
    server.reply(selfOk);
    await c.request(scoped);
    expect(server.requests.map((r) => r.path)).toEqual(["/v1/api-keys/self", "/v1/workspaces/ws-from-key/domains"]);
  });

  it("bearer and cookie credentials never auto-resolve", async () => {
    server.reply(selfOk);
    for (const auth of [{ type: "bearer", token: "t" }, { type: "cookie", value: "v" }] as const) {
      const err = await new APIClient({ auth, platformAuthBaseUrl: server.url }, server.url).request(scoped).catch((e) => e);
      expect(err).toBeInstanceOf(ConfigurationError);
      expect(err.message).toMatch(/pass workspaceId/);
    }
    expect(server.requests).toHaveLength(0);
  });
});

describe("browser guard", () => {
  const asBrowser = () => {
    vi.stubGlobal("window", { document: {} });
    vi.stubGlobal("navigator", { userAgent: "test" });
  };

  it("a workspace key in a browser throws ConfigurationError", () => {
    asBrowser();
    expect(() => new APIClient({ apiKey: "pcft_live_x" }, server.url)).toThrow(ConfigurationError);
  });

  it("dangerouslyAllowBrowser opts in; keyless and bearer clients need no flag", () => {
    asBrowser();
    expect(() => new APIClient({ apiKey: "pcft_live_x", dangerouslyAllowBrowser: true }, server.url)).not.toThrow();
    expect(() => new APIClient({}, server.url)).not.toThrow();
    expect(() => new APIClient({ auth: { type: "bearer", token: "t" } }, server.url)).not.toThrow();
  });
});

describe("logging", () => {
  it("debug logs method, path, status and request id, never headers or bodies", async () => {
    const lines: unknown[][] = [];
    const logger = { debug: (...a: unknown[]) => lines.push(a), info: () => {}, warn: (...a: unknown[]) => lines.push(a), error: () => {} };
    server.reply({ status: 500, body: {} }, { status: 200, headers: { "x-request-id": "req_log" }, body: { secret: "body-secret" } });
    await make({ logLevel: "debug", logger }).request(get());
    const text = JSON.stringify(lines);
    expect(text).toContain("/v1/things");
    expect(text).toContain("req_log");
    expect(text).not.toContain("pcft_test_key");
    expect(text).not.toContain("body-secret");
  });

  it("is off by default and honours PRODUCTCRAFT_LOG", async () => {
    const lines: unknown[] = [];
    const logger = { debug: (...a: unknown[]) => lines.push(a), info: () => {}, warn: () => {}, error: () => {} };
    server.reply({ status: 200, body: {} });
    await make({ logger }).request(get());
    expect(lines).toHaveLength(0);
    vi.stubEnv("PRODUCTCRAFT_LOG", "debug");
    await make({ logger }).request(get());
    expect(lines.length).toBeGreaterThan(0);
  });
});

describe("createOpenAPIClient escape hatch", () => {
  it("shares credential and base URL", async () => {
    server.reply({ status: 200, body: { ok: 1 } });
    type P = { "/v1/things": { get: { responses: { 200: { content: { "application/json": { ok: number } } } } } } };
    const raw = createOpenAPIClient<P>(make());
    const { data } = await raw.GET("/v1/things");
    expect(data).toEqual({ ok: 1 });
    expect(server.requests[0]?.headers.authorization).toBe("Bearer pcft_test_key");
  });

  it("the credential is not enumerable on the client", () => {
    const c = make();
    expect(Object.keys(c)).not.toContain("auth");
    expect(JSON.stringify(c)).not.toContain("pcft_test_key");
    expect(c.auth).toEqual({ type: "apiKey", key: "pcft_test_key" });
  });
});
