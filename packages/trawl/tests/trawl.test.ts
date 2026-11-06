// Runtime behaviour of the generated Trawl client over the generated mock
// fetch: polling, createAndPoll's idempotency key, errors with request ids.
import { describe, expect, it } from "vitest";
import { NotFoundError, Trawl } from "../src/index.js";
import { createMockFetch } from "../src/testing.js";

const WORKSPACE_ID = "9b2f6c1e-0d6a-4a63-9a43-2f1c3e4d5a6b";
type Tiers = { tiers: { name: string }[] };

describe("@productcraft/trawl", () => {
  it("createAndPoll<T> sends the key on the create only and resolves at a terminal status", async () => {
    let polls = 0;
    const fetch = createMockFetch({
      "jobs.create": { id: "job-1", status: "queued", result: null },
      "jobs.retrieve": () => {
        polls += 1;
        return polls < 3 ? { id: "job-1", status: "running", result: null } : { id: "job-1", status: "succeeded", result: { tiers: [{ name: "Pro" }] } };
      },
    });
    const trawl = new Trawl({ apiKey: "pcft_test", workspaceId: WORKSPACE_ID, fetch, maxRetries: 0 });
    const job = await trawl.jobs.createAndPoll<Tiers>(
      { description: "Pricing tiers", json_schema: { type: "object" } },
      { intervalMs: 1, idempotencyKey: "order-1" },
    );
    expect(job.status).toBe("succeeded");
    expect(job.result?.tiers[0]?.name).toBe("Pro");
    expect(fetch.calls.map((c) => c.operation)).toEqual(["jobs.create", "jobs.retrieve", "jobs.retrieve", "jobs.retrieve"]);
    expect(fetch.calls[0]!.headers.get("idempotency-key")).toBe("order-1");
    expect(fetch.calls.slice(1).every((c) => !c.headers.has("idempotency-key"))).toBe(true);
    expect(fetch.calls[1]!.url.pathname).toBe(`/v1/workspaces/${WORKSPACE_ID}/jobs/job-1`);
  });

  it("createAndPoll over the default mock finishes (a polled retrieve answers with a terminal status)", async () => {
    const trawl = new Trawl({ apiKey: "pcft_test", workspaceId: WORKSPACE_ID, fetch: createMockFetch(), maxRetries: 0 });
    const job = await trawl.jobs.createAndPoll<Tiers>({ description: "x", json_schema: { type: "object" } }, { intervalMs: 1, timeoutMs: 1_000 });
    expect(job.status).toBe("succeeded");
    const listed = await trawl.jobs.list();
    expect(typeof listed.data[0]?.status).toBe("string");
  });

  it("generates an Idempotency-Key for a create and keeps .client typed", async () => {
    const fetch = createMockFetch();
    const trawl = new Trawl({ apiKey: "pcft_test", workspaceId: WORKSPACE_ID, fetch, maxRetries: 0 });
    await trawl.jobs.create({ description: "x", json_schema: { type: "object" } });
    expect(fetch.calls[0]!.headers.get("idempotency-key")).toMatch(/^pc_[0-9a-f-]{36}$/);
    const { data } = await trawl.client.GET("/v1/workspaces/{workspace_id}/credits", { params: { path: { workspace_id: WORKSPACE_ID } } });
    expect(data).toBeDefined();
  });

  it("throws NotFoundError with the request id", async () => {
    const fetch = createMockFetch({
      "jobs.retrieve": () =>
        new Response(JSON.stringify({ status_code: 404, code: "NOT_FOUND", message: "Job not found", request_id: "req_body" }), {
          status: 404,
          headers: { "content-type": "application/json", "x-request-id": "req_header" },
        }),
    });
    const trawl = new Trawl({ apiKey: "pcft_test", workspaceId: WORKSPACE_ID, fetch, maxRetries: 0 });
    const err = await trawl.jobs.retrieve("00000000-0000-0000-0000-000000000000").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NotFoundError);
    expect((err as NotFoundError).requestId).toBe("req_header");
    expect((err as NotFoundError).docUrl).toBe("https://productcraft.co/docs/errors#NOT_FOUND");
  });
});
