import { afterEach, describe, expect, it, vi } from "vitest";
import { backoff, POLL_MS, Realtime, type RealtimeStatus, type VisibilitySource } from "../src/realtime.js";
import { TokenManager } from "../src/tokens.js";
import { fakeApi, json } from "./helpers.js";

const BASE = "https://api.notify.test";
afterEach(() => vi.useRealTimers());

function setup(opts: { document?: VisibilitySource } = {}) {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const api = fakeApi();
  let n = 0;
  const getToken = vi.fn(async () => `rt_${++n}`);
  const events: [string, unknown][] = [];
  const statuses: RealtimeStatus[] = [];
  const polled: unknown[] = [];
  const rt = new Realtime({
    baseUrl: BASE,
    fetch: api.fetch,
    tokens: new TokenManager(getToken),
    document: opts.document,
    random: () => 0.5,
    handlers: { event: (name, data) => events.push([name, data]), polled: (c) => polled.push(c), status: (s) => statuses.push(s) },
  });
  return { api, rt, getToken, events, statuses, polled };
}

const tick = (ms = 0) => vi.advanceTimersByTimeAsync(ms);

function fakeDocument() {
  const listeners = new Set<() => void>();
  return {
    visibilityState: "visible",
    addEventListener: (_: string, cb: () => void) => void listeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => void listeners.delete(cb),
    fire() {
      for (const l of listeners) l();
    },
  };
}

describe("backoff", () => {
  it("doubles from 1 s to 30 s and adds up to 1 s of jitter", () => {
    expect([1, 2, 3, 4, 5, 6, 9].map((n) => backoff(n, () => 0))).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000]);
    expect(backoff(1, () => 0.999)).toBe(1999);
    const spread = new Set(Array.from({ length: 50 }, () => backoff(3)));
    expect(spread.size).toBeGreaterThan(1);
  });
});

describe("Realtime stream reader", () => {
  it("connects with a Bearer header, parses events, and reconnects with Last-Event-ID after the server's retry", async () => {
    const { api, rt, events, statuses } = setup();
    rt.start();
    await tick();
    expect(api.calls[0]?.headers.authorization).toBe("Bearer rt_1");
    expect(api.calls[0]?.url).toBe(`${BASE}/v1/client/inbox/stream`);
    expect(api.calls[0]?.headers["last-event-id"]).toBeUndefined();
    expect(statuses).toEqual(["connecting", "open"]);
    api.lastStream.raw("retry: 5000\n\n: comment\n");
    api.lastStream.send("counts", { unseen: 1, unread: 2 });
    // A frame split across chunks, with a multi-line data field.
    api.lastStream.raw('event: item.created\nid: item-9\ndata: {"item":\ndata: {"id":"item-9"}}\n');
    api.lastStream.raw("\n");
    api.lastStream.send("heartbeat", {});
    await tick();
    expect(events).toEqual([
      ["counts", { unseen: 1, unread: 2 }],
      ["item.created", { item: { id: "item-9" } }],
      ["heartbeat", {}],
    ]);
    api.lastStream.end();
    await tick(4_900);
    expect(api.streams).toHaveLength(1); // waits the server's retry (5 s), not the 1 s backoff
    await tick(200);
    expect(api.streams).toHaveLength(2);
    expect(api.calls[1]?.headers["last-event-id"]).toBe("item-9");
    rt.stop();
  });

  it("gets a new token on auth_expired and on a 401 at connect, then reconnects at once", async () => {
    const { api, rt, getToken } = setup();
    let refuse = false;
    api.stream(() => (refuse ? ((refuse = false), json({ code: "RECIPIENT_TOKEN_EXPIRED" }, 401)) : null));
    rt.start();
    await tick();
    api.lastStream.send("auth_expired", { reason: "expired" });
    await tick();
    expect(getToken).toHaveBeenCalledTimes(2);
    expect(api.calls.map((c) => c.headers.authorization)).toEqual(["Bearer rt_1", "Bearer rt_2"]);
    refuse = true;
    api.lastStream.end();
    await tick(3_000);
    expect(api.calls.map((c) => c.headers.authorization)).toEqual(["Bearer rt_1", "Bearer rt_2", "Bearer rt_2", "Bearer rt_3"]);
    expect(rt.status).toBe("open");
    rt.stop();
  });

  it("backs off on failures, polls counts with ETag every 30 s after 3, and stops polling once the stream opens", async () => {
    const { api, rt, polled, statuses } = setup();
    let fail = true;
    api.stream(() => (fail ? json({ code: "SERVICE_UNAVAILABLE" }, 503) : null));
    let etagSeen: string[] = [];
    api.on("GET /v1/client/inbox/counts", (c) => {
      etagSeen.push(c.headers["if-none-match"] ?? "");
      return c.headers["if-none-match"] === 'W/"c-1-1"' ? new Response(null, { status: 304 }) : json({ unseen: 1, unread: 1 }, 200, { etag: 'W/"c-1-1"' });
    });
    rt.start();
    await tick(); // failure 1
    await tick(1_500); // failure 2 (after 1.5 s)
    expect(api.calls.filter((c) => c.path.endsWith("/stream"))).toHaveLength(2);
    expect(statuses).not.toContain("polling");
    await tick(2_500); // failure 3 → polling
    expect(statuses).toContain("polling");
    await tick(10);
    await tick(10);
    expect(polled).toEqual([{ unseen: 1, unread: 1 }]);
    expect(etagSeen).toEqual([""]);
    await tick(POLL_MS);
    expect(etagSeen).toEqual(["", 'W/"c-1-1"']);
    expect(polled).toHaveLength(1); // 304: nothing new
    fail = false;
    await tick(30_000);
    expect(rt.status).toBe("open");
    const before = etagSeen.length;
    await tick(POLL_MS * 2);
    expect(etagSeen.length).toBe(before);
    etagSeen = [];
    rt.stop();
  });

  it("pauses while the document is hidden and reconnects when it is visible again", async () => {
    const doc = fakeDocument();
    const { api, rt, statuses } = setup({ document: doc });
    rt.start();
    await tick();
    const first = api.lastStream;
    doc.visibilityState = "hidden";
    doc.fire();
    await tick();
    expect(first.closed).toBe(true);
    expect(rt.status).toBe("paused");
    await tick(60_000);
    expect(api.streams).toHaveLength(1);
    doc.visibilityState = "visible";
    doc.fire();
    await tick();
    expect(api.streams).toHaveLength(2);
    expect(statuses).toEqual(["connecting", "open", "paused", "connecting", "open"]);
    rt.pause();
    expect(rt.status).toBe("paused");
    rt.resume();
    await tick();
    expect(rt.status).toBe("open");
    rt.stop();
    expect(api.lastStream.closed).toBe(true);
  });

  it("honours Retry-After on a refused stream (429 STREAM_LIMIT)", async () => {
    const { api, rt } = setup();
    let first = true;
    api.stream(() => (first ? ((first = false), json({ code: "STREAM_LIMIT" }, 429, { "retry-after": "20" })) : null));
    rt.start();
    await tick(19_000);
    expect(api.calls).toHaveLength(1);
    await tick(1_100);
    expect(api.calls).toHaveLength(2);
    rt.stop();
  });
});

describe("Realtime start", () => {
  it("starts paused when the page is hidden, and connects once it is shown", async () => {
    const doc = fakeDocument();
    doc.visibilityState = "hidden";
    const { api, rt } = setup({ document: doc });
    rt.start();
    await tick();
    expect(rt.status).toBe("paused");
    expect(api.calls).toHaveLength(0);
    doc.visibilityState = "visible";
    doc.fire();
    await tick();
    expect(rt.status).toBe("open");
    rt.stop();
  });
});
