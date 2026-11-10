// Runtime behaviour of the generated Notify client over the generated mock fetch:
// the recipient-token scope `notify.client({ token })`, idempotency on send, and
// webhook verification with a catalogue event.
import { describe, expect, it } from "vitest";
import { ConfigurationError, Notify, WebhookVerificationError } from "../src/index.js";
import { createMockFetch, type MockCall } from "../src/testing.js";

const WORKSPACE_ID = "9b2f6c1e-0d6a-4a63-9a43-2f1c3e4d5a6b";
const SECRET = "whsec_" + Buffer.from("notify-test-secret-32-bytes-long!").toString("base64");

describe("@productcraft/notify", () => {
  it("notifications.send always carries an Idempotency-Key, and uses the caller's when given", async () => {
    const fetch = createMockFetch();
    const notify = new Notify({ apiKey: "pcft_test", workspaceId: WORKSPACE_ID, fetch, maxRetries: 0 });
    await notify.notifications.send({ type: "comment_created", recipients: ["user_123"] });
    await notify.notifications.send({ type: "comment_created", recipients: ["user_123"] }, { idempotencyKey: "event-42" });
    expect(fetch.calls[0]!.headers.get("idempotency-key")).toMatch(/^pc_[0-9a-f-]{36}$/);
    expect(fetch.calls[1]!.headers.get("idempotency-key")).toBe("event-42");
    expect(fetch.calls[0]!.url.pathname).toBe(`/v1/workspaces/${WORKSPACE_ID}/notifications`);
  });

  it("notifications.send resolves to the accepted notification or, with dry_run, the plan", async () => {
    const accepted = { id: "n1", type: "comment_created", recipient_count: 1, status: "accepted", skipped: [] };
    const fetch = createMockFetch({ "notifications.send": (call: MockCall) => ((call.body as { dry_run?: boolean }).dry_run ? { dry_run: true, type: "comment_created", plan: [], skipped: [] } : new Response(JSON.stringify(accepted), { status: 202, headers: { "content-type": "application/json" } })) });
    const notify = new Notify({ apiKey: "pcft_test", workspaceId: WORKSPACE_ID, fetch, maxRetries: 0 });
    const sent = await notify.notifications.send({ type: "comment_created", recipients: ["user_123"] });
    expect("id" in sent && sent.id).toBe("n1");
    const plan = await notify.notifications.send({ type: "comment_created", recipients: ["user_123"], dry_run: true });
    expect("dry_run" in plan && plan.dry_run).toBe(true);
  });

  it("client({ token }) sends only the recipient token, on /v1/client, with no workspace or API key", async () => {
    const fetch = createMockFetch();
    const notify = new Notify({ apiKey: "pcft_test", workspaceId: WORKSPACE_ID, fetch, maxRetries: 0, defaultHeaders: { "x-trace": "t1" } });
    const me = notify.client({ token: "rt_abc" });
    const page = await me.inbox.list({ status: "unread" });
    expect(Array.isArray(page.data)).toBe(true);
    await me.inbox.mark({ ids: ["0193a5f2-7c1e-7b3a-9f10-2b6c4d8e9a02"], action: "read" });
    await me.preferences.update({ preferences: [] });
    for (const call of fetch.calls) {
      expect(call.headers.get("authorization")).toBe("Bearer rt_abc");
      expect(call.url.pathname.startsWith("/v1/client/")).toBe(true);
      expect(call.headers.get("x-trace")).toBe("t1");
    }
    expect(fetch.calls.map((c) => c.operation)).toEqual(["me.inbox.list", "me.inbox.mark", "me.preferences.update"]);
    expect(fetch.calls[0]!.url.searchParams.get("status")).toBe("unread");
  });

  it("client({ token }) works without any API key (browser), and never reads PRODUCTCRAFT_API_KEY", async () => {
    const before = process.env.PRODUCTCRAFT_API_KEY;
    process.env.PRODUCTCRAFT_API_KEY = "pcft_live_from_env";
    try {
      const fetch = createMockFetch();
      const me = new Notify({ fetch, maxRetries: 0, credentialFromEnv: false }).client({ token: "rt_browser" });
      await me.inbox.counts();
      expect(fetch.calls[0]!.headers.get("authorization")).toBe("Bearer rt_browser");
      // Even a client built from the environment key hands the scope only the token.
      const fromEnv = new Notify({ fetch, maxRetries: 0 }).client({ token: "rt_env" });
      await fromEnv.inbox.counts();
      expect(fetch.calls[1]!.headers.get("authorization")).toBe("Bearer rt_env");
    } finally {
      if (before === undefined) delete process.env.PRODUCTCRAFT_API_KEY;
      else process.env.PRODUCTCRAFT_API_KEY = before;
    }
  });

  it("client({ token }) refuses an empty token and a workspace API key", () => {
    const notify = new Notify({ apiKey: "pcft_test", workspaceId: WORKSPACE_ID });
    expect(() => notify.client({ token: "" })).toThrow(ConfigurationError);
    expect(() => notify.client({ token: "pcft_live_oops" })).toThrow(/workspace API key/);
  });

  it("client stays the typed openapi-fetch escape hatch", async () => {
    const fetch = createMockFetch();
    const notify = new Notify({ apiKey: "pcft_test", workspaceId: WORKSPACE_ID, fetch, maxRetries: 0 });
    expect(notify.client).toBe(notify.client);
    const { data } = await notify.client.GET("/v1/workspaces/{workspace_id}/settings", { params: { path: { workspace_id: WORKSPACE_ID } } });
    expect(data).toBeDefined();
    expect(fetch.calls[0]!.headers.get("authorization")).toBe("Bearer pcft_test");
  });

  it("webhooks.unwrap verifies a signed catalogue event and narrows it by type", async () => {
    const notify = new Notify({ apiKey: "pcft_test", workspaceId: WORKSPACE_ID, webhookSecret: SECRET });
    const event = {
      id: "evt_1",
      type: "delivery.failed",
      created_at: "2026-11-05T09:00:00.000Z",
      workspace_id: WORKSPACE_ID,
      data: { delivery_id: "d1", notification_id: "n1", channel: "push", provider: "apns", state: "failed", reason: "expired", attempts: 6, is_fallback: false, type_key: "invoice.paid", recipient: { id: "r1", external_id: "user_123" } },
    };
    const signed = await notify.webhooks.sign({ payload: event });
    const got = await notify.webhooks.unwrap({ payload: signed.payload, headers: signed.headers });
    expect(got.type).toBe("delivery.failed");
    if (got.type === "delivery.failed") expect(got.data.reason).toBe("expired");
    await expect(notify.webhooks.unwrap({ payload: signed.payload + " ", headers: signed.headers })).rejects.toBeInstanceOf(WebhookVerificationError);
  });
});
