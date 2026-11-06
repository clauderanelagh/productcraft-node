// Runtime behaviour of the generated Mail client over the generated mock
// fetch: idempotency keys on sends, auto-pagination, non-JSON responses,
// errors with request ids, domain polling and multi-secret webhooks.
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { Mail, NotFoundError, WebhookVerificationError } from "../src/index.js";
import { createMockFetch } from "../src/testing.js";

const WORKSPACE_ID = "9b2f6c1e-0d6a-4a63-9a43-2f1c3e4d5a6b";
const KEY = /^pc_[0-9a-f-]{36}$/;

describe("@productcraft/mail", () => {
  it("sends an Idempotency-Key on emails.send and templates.send, and honours an override", async () => {
    const fetch = createMockFetch();
    const mail = new Mail({ apiKey: "pcft_test", workspaceId: WORKSPACE_ID, fetch, maxRetries: 0 });
    await mail.emails.send({ from: "Acme <hello@mail.acme.com>", to: "success@simulator.amazonses.com", subject: "Hi", html: "<p>ok</p>" });
    await mail.templates.send("welcome", { to: "success@simulator.amazonses.com", data: { first_name: "Ada" } }, { idempotencyKey: "order-1" });
    expect(fetch.calls.map((c) => c.operation)).toEqual(["emails.send", "templates.send"]);
    expect(fetch.calls[0]!.headers.get("idempotency-key")).toMatch(KEY);
    expect(fetch.calls[0]!.url.pathname).toBe(`/v1/workspaces/${WORKSPACE_ID}/emails`);
    expect(fetch.calls[1]!.headers.get("idempotency-key")).toBe("order-1");
    expect(fetch.calls[1]!.url.pathname).toBe(`/v1/workspaces/${WORKSPACE_ID}/templates/welcome/send`);
    expect(fetch.calls[1]!.body).toEqual({ to: "success@simulator.amazonses.com", data: { first_name: "Ada" } });
  });

  it("auto-paginates messages.list over next_cursor and sends status as repeated query values", async () => {
    const fetch = createMockFetch({
      "messages.list": (call: { url: URL }) => {
        const cursor = call.url.searchParams.get("cursor");
        return cursor === null
          ? { data: [{ id: "m1" }], pagination: { next_cursor: "c2", has_more: true } }
          : { data: [{ id: "m2" }], pagination: { next_cursor: null, has_more: false } };
      },
    });
    const mail = new Mail({ apiKey: "pcft_test", workspaceId: WORKSPACE_ID, fetch, maxRetries: 0 });
    const ids: string[] = [];
    for await (const m of mail.messages.list({ limit: 1, status: ["delivered", "bounced"] })) ids.push(m.id);
    expect(ids).toEqual(["m1", "m2"]);
    expect(fetch.calls[0]!.url.searchParams.getAll("status").join(",")).toContain("delivered");
    expect(fetch.calls[1]!.url.searchParams.get("cursor")).toBe("c2");
  });

  it("returns the raw Response for the CSV export and erases by recipient", async () => {
    const fetch = createMockFetch({ "messages.export": "id,status\nm1,delivered\n" });
    const mail = new Mail({ apiKey: "pcft_test", workspaceId: WORKSPACE_ID, fetch, maxRetries: 0 });
    const res = await mail.messages.export({});
    expect(res).toBeInstanceOf(Response);
    expect(await res.text()).toContain("m1,delivered");
    await mail.messages.erase({ recipient: "success@simulator.amazonses.com" });
    const erase = fetch.calls[1]!;
    expect(erase.method).toBe("DELETE");
    expect(erase.url.searchParams.get("recipient")).toBe("success@simulator.amazonses.com");
  });

  it("polls a domain until a terminal status", async () => {
    let n = 0;
    const fetch = createMockFetch({
      "domains.retrieve": () => {
        n += 1;
        return { id: "d1", name: "mail.acme.com", status: n < 3 ? "pending" : "active" };
      },
    });
    const mail = new Mail({ apiKey: "pcft_test", workspaceId: WORKSPACE_ID, fetch, maxRetries: 0 });
    const domain = await mail.domains.poll("d1", { intervalMs: 1 });
    expect(domain.status).toBe("active");
    expect(n).toBe(3);
  });

  it("throws NotFoundError with the request id and doc url", async () => {
    const fetch = createMockFetch({
      "domains.retrieve": () =>
        new Response(JSON.stringify({ status_code: 404, code: "NOT_FOUND", message: "Domain not found", request_id: "req_body" }), {
          status: 404,
          headers: { "content-type": "application/json", "x-request-id": "req_header" },
        }),
    });
    const mail = new Mail({ apiKey: "pcft_test", workspaceId: WORKSPACE_ID, fetch, maxRetries: 0 });
    const err = await mail.domains.retrieve("00000000-0000-0000-0000-000000000000").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NotFoundError);
    expect((err as NotFoundError).requestId).toBe("req_header");
    expect((err as NotFoundError).docUrl).toBe("https://productcraft.co/docs/errors#NOT_FOUND");
  });

  it("unwraps a webhook signed by any one of several secrets, Standard Webhooks or X-Mail-Signature", async () => {
    const mail = new Mail({ apiKey: "pcft_test", workspaceId: WORKSPACE_ID, webhookSecret: ["whsec_" + Buffer.from("other").toString("base64"), "legacy-secret"] });
    const payload = JSON.stringify({ type: "email.delivered", data: { email_id: "e1" } });
    const t = Math.floor(Date.now() / 1000);
    const legacy = createHmac("sha256", "legacy-secret").update(`${t}.${payload}`).digest("hex");
    const event = await mail.webhooks.unwrap({ payload, headers: { "x-mail-signature": `t=${t},v1=${legacy}` } });
    expect(event.type).toBe("email.delivered");

    const key = Buffer.from("other");
    const sig = createHmac("sha256", key).update(`msg_1.${t}.${payload}`).digest("base64");
    const std = await mail.webhooks.unwrap({ payload, headers: { "webhook-id": "msg_1", "webhook-timestamp": String(t), "webhook-signature": `v1,${sig}` } });
    expect(std.type).toBe("email.delivered");

    await expect(mail.webhooks.unwrap({ payload, headers: { "webhook-id": "msg_1", "webhook-timestamp": String(t), "webhook-signature": "v1,AAAA" } })).rejects.toBeInstanceOf(WebhookVerificationError);
  });

  it("keeps .client typed by the same paths", async () => {
    const fetch = createMockFetch();
    const mail = new Mail({ apiKey: "pcft_test", workspaceId: WORKSPACE_ID, fetch, maxRetries: 0 });
    const { data } = await mail.client.GET("/v1/workspaces/{workspace_id}/brand", { params: { path: { workspace_id: WORKSPACE_ID } } });
    expect(data).toBeDefined();
  });
});
