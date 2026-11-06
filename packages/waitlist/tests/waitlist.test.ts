// Runtime behaviour of the generated Waitlist client over the generated mock
// fetch: the keyless public scope, the browser guard, idempotency keys,
// auto-pagination, the CSV export, errors with request ids and webhooks.
import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfigurationError, NotFoundError, Waitlist, WebhookVerificationError } from "../src/index.js";
import { createMockFetch } from "../src/testing.js";

const WORKSPACE_ID = "9b2f6c1e-0d6a-4a63-9a43-2f1c3e4d5a6b";
const LIST_ID = "3f0c2a1b-7d4e-4c5f-8a9b-0c1d2e3f4a5b";
const KEY = /^pc_[0-9a-f-]{36}$/;

/** A fake browser global: `window.document` plus `navigator` (Node 20 has no global navigator). */
function fakeBrowser(): void {
  vi.stubGlobal("window", { document: {} });
  vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0" });
}

describe("@productcraft/waitlist", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("creates, updates the status of and deletes a list under the workspace", async () => {
    const fetch = createMockFetch();
    const waitlist = new Waitlist({ apiKey: "pcft_test", workspaceId: WORKSPACE_ID, fetch, maxRetries: 0 });
    await waitlist.lists.create({ display_name: "Beta", slug: "beta" });
    await waitlist.lists.updateStatus(LIST_ID, { status: "active" });
    await waitlist.lists.delete(LIST_ID);
    expect(fetch.calls.map((c) => [c.method, c.url.pathname])).toEqual([
      ["POST", `/v1/workspaces/${WORKSPACE_ID}/waitlists`],
      ["PATCH", `/v1/workspaces/${WORKSPACE_ID}/waitlists/${LIST_ID}/status`],
      ["DELETE", `/v1/workspaces/${WORKSPACE_ID}/waitlists/${LIST_ID}`],
    ]);
    expect(fetch.calls[0]!.headers.get("authorization")).toBe("Bearer pcft_test");
    expect(fetch.calls[0]!.headers.get("idempotency-key")).toMatch(KEY);
  });

  it("public() needs no key, sends no Authorization header, and binds both slugs", async () => {
    vi.stubEnv("PRODUCTCRAFT_API_KEY", "");
    const fetch = createMockFetch();
    const pub = new Waitlist({ fetch, maxRetries: 0 }).public({ workspace: "acme", waitlist: "beta" });
    await pub.entries.create({ email: "success@simulator.amazonses.com", name: "SDK smoke" });
    await pub.info.retrieve();
    await pub.leaderboard.list();
    expect(fetch.calls.map((c) => c.url.pathname)).toEqual([
      "/v1/waitlists/acme/beta/entries",
      "/v1/waitlists/acme/beta",
      "/v1/waitlists/acme/beta/leaderboard/top",
    ]);
    for (const c of fetch.calls) expect(c.headers.get("authorization")).toBeNull();
    // The spec declares Idempotency-Key on the public submit (a retried signup is not a second signup); reads get none.
    expect(fetch.calls[0]!.headers.get("idempotency-key")).toMatch(KEY);
    expect(fetch.calls[1]!.headers.get("idempotency-key")).toBeNull();
  });

  it("public() on a keyed client still sends no credential", async () => {
    const fetch = createMockFetch();
    const waitlist = new Waitlist({ apiKey: "pcft_test", workspaceId: WORKSPACE_ID, fetch, maxRetries: 0 });
    await waitlist.public({ workspace: "acme", waitlist: "beta" }).entries.create({ email: "success@simulator.amazonses.com", name: "SDK smoke" });
    expect(fetch.calls[0]!.headers.get("authorization")).toBeNull();
  });

  it("in a browser: a keyless client works for public routes, a keyed one throws without dangerouslyAllowBrowser", async () => {
    fakeBrowser();
    const fetch = createMockFetch();
    const pub = new Waitlist({ fetch, maxRetries: 0 }).public({ workspace: "acme", waitlist: "beta" });
    await pub.entries.create({ email: "success@simulator.amazonses.com", name: "SDK smoke" });
    expect(fetch.calls[0]!.headers.get("authorization")).toBeNull();
    expect(fetch.calls[0]!.headers.get("user-agent")).toBeNull();

    expect(() => new Waitlist({ apiKey: "pcft_test", workspaceId: WORKSPACE_ID })).toThrow(ConfigurationError);
    expect(() => new Waitlist({ apiKey: "pcft_test", workspaceId: WORKSPACE_ID, dangerouslyAllowBrowser: true })).not.toThrow();
  });

  it("auto-paginates lists.entries.list over next_cursor", async () => {
    const fetch = createMockFetch({
      "lists.entries.list": (call: { url: URL }) =>
        call.url.searchParams.get("cursor") === null
          ? { data: [{ id: "e1", email: "a@example.com" }], pagination: { next_cursor: "c2", has_more: true } }
          : { data: [{ id: "e2", email: "b@example.com" }], pagination: { next_cursor: null, has_more: false } },
    });
    const waitlist = new Waitlist({ apiKey: "pcft_test", workspaceId: WORKSPACE_ID, fetch, maxRetries: 0 });
    const emails: string[] = [];
    for await (const e of waitlist.lists.entries.list(LIST_ID, { limit: 1 })) emails.push(e.email);
    expect(emails).toEqual(["a@example.com", "b@example.com"]);
    expect(fetch.calls[0]!.url.pathname).toBe(`/v1/workspaces/${WORKSPACE_ID}/waitlists/${LIST_ID}/entries`);
    expect(fetch.calls[1]!.url.searchParams.get("cursor")).toBe("c2");
  });

  it("returns the raw Response for the CSV export and counts entries", async () => {
    const fetch = createMockFetch({ "lists.entries.export": "email,status\na@example.com,approved\n" });
    const waitlist = new Waitlist({ apiKey: "pcft_test", workspaceId: WORKSPACE_ID, fetch, maxRetries: 0 });
    const res = await waitlist.lists.entries.export(LIST_ID);
    expect(res).toBeInstanceOf(Response);
    expect(await res.text()).toContain("a@example.com,approved");
    await waitlist.lists.entries.count(LIST_ID);
    expect(fetch.calls[1]!.url.pathname).toBe(`/v1/workspaces/${WORKSPACE_ID}/waitlists/${LIST_ID}/entries/count`);
  });

  it("throws NotFoundError with the request id and doc url", async () => {
    const fetch = createMockFetch({
      "lists.retrieve": () =>
        new Response(JSON.stringify({ status_code: 404, code: "NOT_FOUND", message: "Waitlist not found", request_id: "req_body" }), {
          status: 404,
          headers: { "content-type": "application/json", "x-request-id": "req_header" },
        }),
    });
    const waitlist = new Waitlist({ apiKey: "pcft_test", workspaceId: WORKSPACE_ID, fetch, maxRetries: 0 });
    const err = await waitlist.lists.retrieve("00000000-0000-0000-0000-000000000000").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NotFoundError);
    expect((err as NotFoundError).requestId).toBe("req_header");
    expect((err as NotFoundError).docUrl).toBe("https://productcraft.co/docs/errors#NOT_FOUND");
  });

  it("unwraps a webhook signed with Standard Webhooks or the legacy X-Waitlist-Signature", async () => {
    const waitlist = new Waitlist({ apiKey: "pcft_test", workspaceId: WORKSPACE_ID, webhookSecret: ["whsec_" + Buffer.from("k1").toString("base64"), "legacy-secret"] });
    const payload = JSON.stringify({ type: "entry.created", data: { entry: { id: "e1" } } });
    const t = Math.floor(Date.now() / 1000);
    const sig = createHmac("sha256", Buffer.from("k1")).update(`msg_1.${t}.${payload}`).digest("base64");
    const std = await waitlist.webhooks.unwrap({ payload, headers: { "webhook-id": "msg_1", "webhook-timestamp": String(t), "webhook-signature": `v1,${sig}` } });
    expect(std.type).toBe("entry.created");

    const legacy = createHmac("sha256", "legacy-secret").update(`${t}.${payload}`).digest("hex");
    const old = await waitlist.webhooks.unwrap({ payload, headers: { "x-waitlist-signature": `t=${t},v1=${legacy}` } });
    expect(old.type).toBe("entry.created");

    await expect(waitlist.webhooks.unwrap({ payload, headers: { "webhook-id": "msg_1", "webhook-timestamp": String(t), "webhook-signature": "v1,AAAA" } })).rejects.toBeInstanceOf(WebhookVerificationError);
  });

  it("keeps .client typed by the same paths", async () => {
    const fetch = createMockFetch();
    const waitlist = new Waitlist({ apiKey: "pcft_test", workspaceId: WORKSPACE_ID, fetch, maxRetries: 0 });
    const { data } = await waitlist.client.GET("/v1/workspaces/{workspace_id}/waitlists", { params: { path: { workspace_id: WORKSPACE_ID } } });
    expect(data).toBeDefined();
  });
});
