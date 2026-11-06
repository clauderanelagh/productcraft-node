// Runtime behaviour of the generated Social client over the generated mock
// fetch: the community scope, `.as(actorId)` filling actor_id in bodies and
// queries, workspace-level routes, auto-pagination, errors with request ids
// and the `.client` escape hatch.
import { afterEach, describe, expect, it, vi } from "vitest";
import { BadRequestError, NotFoundError, Social } from "../src/index.js";
import { createMockFetch } from "../src/testing.js";

const WORKSPACE_ID = "9b2f6c1e-0d6a-4a63-9a43-2f1c3e4d5a6b";
const COMMUNITY_ID = "3f0c2a1b-7d4e-4c5f-8a9b-0c1d2e3f4a5b";
const ADA = "7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d";
const GRACE = "aaaaaaaa-0000-0000-0000-000000000002";
const POST_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const IDEMPOTENCY_KEY = /^pc_[0-9a-f-]{36}$/;

const client = (fetch: ReturnType<typeof createMockFetch>) => new Social({ apiKey: "pcft_test", workspaceId: WORKSPACE_ID, fetch, maxRetries: 0 });

describe("@productcraft/social", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("community(id) binds community_id into the path", async () => {
    const fetch = createMockFetch();
    const social = client(fetch);
    await social.community(COMMUNITY_ID).posts.retrieve(POST_ID);
    await social.community(COMMUNITY_ID).posts.delete(POST_ID);
    expect(fetch.calls.map((c) => [c.method, c.url.pathname + c.url.search])).toEqual([
      ["GET", `/v1/communities/${COMMUNITY_ID}/posts/${POST_ID}`],
      ["DELETE", `/v1/communities/${COMMUNITY_ID}/posts/${POST_ID}`],
    ]);
    for (const c of fetch.calls) expect(c.headers.get("authorization")).toBe("Bearer pcft_test");
  });

  it(".as(actorId) fills actor_id in a body that declares it, with an Idempotency-Key", async () => {
    const fetch = createMockFetch();
    const c = client(fetch).community(COMMUNITY_ID).as(ADA);
    await c.posts.create({ body: "hello" });
    await c.posts.comments.create(POST_ID, { body: "first" });
    expect(fetch.calls[0]!.url.pathname).toBe(`/v1/communities/${COMMUNITY_ID}/posts`);
    expect(fetch.calls[0]!.body).toEqual({ body: "hello", actor_id: ADA });
    expect(fetch.calls[0]!.headers.get("idempotency-key")).toMatch(IDEMPOTENCY_KEY);
    expect(fetch.calls[1]!.url.pathname).toBe(`/v1/communities/${COMMUNITY_ID}/posts/${POST_ID}/comments`);
    expect(fetch.calls[1]!.body).toEqual({ body: "first", actor_id: ADA });
  });

  it(".as(actorId) fills actor_id in a query that declares it", async () => {
    const fetch = createMockFetch();
    const c = client(fetch).community(COMMUNITY_ID).as(ADA);
    await c.posts.comments.list(POST_ID, { limit: 5 });
    expect(fetch.calls[0]!.url.pathname).toBe(`/v1/communities/${COMMUNITY_ID}/posts/${POST_ID}/comments`);
    expect(fetch.calls[0]!.url.searchParams.get("actor_id")).toBe(ADA);
    expect(fetch.calls[0]!.url.searchParams.get("limit")).toBe("5");
  });

  it("an explicit actor_id wins over .as(), and ops without actor_id get none", async () => {
    const fetch = createMockFetch();
    const c = client(fetch).community(COMMUNITY_ID).as(ADA);
    await c.posts.create({ body: "as grace", actor_id: GRACE });
    await c.posts.comments.list(POST_ID, { actor_id: GRACE });
    await c.hashtags.retrieve("sdk");
    await c.posts.retrieve(POST_ID); // declares actor_id (the viewer), so it is filled
    expect(fetch.calls[0]!.body).toEqual({ body: "as grace", actor_id: GRACE });
    expect(fetch.calls[1]!.url.searchParams.get("actor_id")).toBe(GRACE);
    expect(fetch.calls[2]!.url.pathname).toBe(`/v1/communities/${COMMUNITY_ID}/hashtags/sdk`);
    expect(fetch.calls[2]!.url.search).toBe("");
    expect(fetch.calls[3]!.url.searchParams.get("actor_id")).toBe(ADA);
  });

  it("without .as() nothing is filled and the scope stays reusable", async () => {
    const fetch = createMockFetch();
    const community = client(fetch).community(COMMUNITY_ID);
    const asAda = community.as(ADA);
    await community.posts.create({ body: "x", actor_id: GRACE });
    await asAda.posts.create({ body: "y" });
    expect(fetch.calls[0]!.body).toEqual({ body: "x", actor_id: GRACE });
    expect(fetch.calls[1]!.body).toEqual({ body: "y", actor_id: ADA });
  });

  it("workspace routes bind workspace_id; community and workspace webhooks are separate methods", async () => {
    const fetch = createMockFetch();
    const social = client(fetch);
    await social.communities.create({ display_name: "Founders", slug: "founders" });
    await social.webhooks.endpoints.list();
    await social.community(COMMUNITY_ID).webhooks.endpoints.list();
    await social.communities.webhooks.endpoints.list(COMMUNITY_ID);
    expect(fetch.calls.map((c) => c.url.pathname)).toEqual([
      `/v1/workspaces/${WORKSPACE_ID}/communities`,
      `/v1/workspaces/${WORKSPACE_ID}/webhooks/endpoints`,
      `/v1/communities/${COMMUNITY_ID}/webhooks/endpoints`,
      `/v1/workspaces/${WORKSPACE_ID}/communities/${COMMUNITY_ID}/webhooks/endpoints`,
    ]);
  });

  it("posts.tags.delete is the POST …/remove action", async () => {
    const fetch = createMockFetch();
    await client(fetch).community(COMMUNITY_ID).as(ADA).posts.tags.delete(POST_ID, GRACE);
    expect(fetch.calls[0]!.method).toBe("POST");
    expect(fetch.calls[0]!.url.pathname).toBe(`/v1/communities/${COMMUNITY_ID}/posts/${POST_ID}/tags/${GRACE}/remove`);
    expect(fetch.calls[0]!.body).toEqual({ actor_id: ADA });
  });

  it("auto-paginates posts.list over next_cursor", async () => {
    const fetch = createMockFetch({
      "posts.list": (call: { url: URL }) =>
        call.url.searchParams.get("cursor") === null
          ? { data: [{ id: "p1" }], pagination: { next_cursor: "c2", has_more: true } }
          : { data: [{ id: "p2" }], pagination: { next_cursor: null, has_more: false } },
    });
    const ids: string[] = [];
    for await (const p of client(fetch).community(COMMUNITY_ID).as(ADA).posts.list({ limit: 1 })) ids.push(p.id);
    expect(ids).toEqual(["p1", "p2"]);
    expect(fetch.calls[1]!.url.searchParams.get("cursor")).toBe("c2");
  });

  it("throws NotFoundError and BadRequestError with request ids and errors[]", async () => {
    const fetch = createMockFetch({
      "posts.retrieve": () =>
        new Response(JSON.stringify({ status_code: 404, code: "NOT_FOUND", message: "Post not found" }), {
          status: 404,
          headers: { "content-type": "application/json", "x-request-id": "req_header" },
        }),
      "posts.create": () =>
        new Response(JSON.stringify({ status_code: 400, code: "VALIDATION_FAILED", message: ["actor_id must be a UUID"], errors: [{ param: "actor_id", message: "actor_id must be a UUID", code: "isUuid" }], request_id: "req_body" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
    });
    const c = client(fetch).community(COMMUNITY_ID).as(ADA);
    const nf = await c.posts.retrieve("00000000-0000-0000-0000-000000000000").catch((e: unknown) => e);
    expect(nf).toBeInstanceOf(NotFoundError);
    expect((nf as NotFoundError).requestId).toBe("req_header");
    expect((nf as NotFoundError).docUrl).toBe("https://productcraft.co/docs/errors#NOT_FOUND");
    const bad = await c.posts.create({ body: "x", actor_id: "nope" }).catch((e: unknown) => e);
    expect(bad).toBeInstanceOf(BadRequestError);
    expect((bad as BadRequestError).errors[0]!.param).toBe("actor_id");
    expect((bad as BadRequestError).requestId).toBe("req_body");
  });

  it("keeps .client typed by the same paths", async () => {
    const fetch = createMockFetch();
    const social = client(fetch);
    const { data } = await social.client.GET("/v1/communities/{community_id}/posts/{post_id}", { params: { path: { community_id: COMMUNITY_ID, post_id: POST_ID } } });
    expect(data).toBeDefined();
    expect(fetch.calls[0]!.headers.get("authorization")).toBe("Bearer pcft_test");
  });
});
