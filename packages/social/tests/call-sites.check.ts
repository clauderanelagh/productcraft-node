// Task 008 call-site acceptance, checked by `tsc` (the package's test script).
// The 1.0 `.client` shape still compiles against the same paths.
import { Social, NotFoundError, BadRequestError, APIError } from "../src/index.js";

declare const social: Social;
declare const communityId: string;
declare const actorId: string;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const assert = <T extends true>(_: T): void => undefined;

export async function acceptance(): Promise<void> {
  const c = social.community(communityId).as(actorId);
  const post = await c.posts.create({ body: "hello from the SDK smoke" });
  await c.posts.comments.create(post.id, { body: "first" });
  const firstPage = await c.posts.list({ limit: 1 });
  void firstPage.data;
  void firstPage.has_more;
  await c.posts.delete(post.id);

  // A required actor_id in the query is filled by .as() too.
  const listId = "11111111-1111-1111-1111-111111111111";
  for await (const item of c.lists.feed.list(listId)) void item;

  // Without .as(), pass actor_id yourself (the API answers 400 when a required one is missing).
  void social.community(communityId).posts.create({ body: "x", actor_id: actorId });

  const community = await social.communities.create({ display_name: "Founders", slug: "founders" });
  for await (const p of social.community(community.id).as(actorId).posts.list({ limit: 1 })) void p.id;
  const all = await social.communities.list().toArray({ maxItems: 10 });
  void all.length;

  const res0 = await c.posts.retrieve(post.id).withResponse();
  void res0.data.id;
  assert<Equal<typeof res0.requestId, string | undefined>>(true);
  void post.lastResponse.requestId;

  // Workspace-level and community-level webhooks are different methods with different param types.
  const endpoint = await social.community(communityId).webhooks.endpoints.create({ url: "https://example.com/hook" });
  void endpoint;
  const p1: Social.WebhookEndpointCreateParams | undefined = undefined;
  const p2: Social.CommunityScopedWebhookEndpointCreateParams | undefined = undefined;
  void p1;
  void p2;

  try {
    await c.posts.retrieve("00000000-0000-0000-0000-000000000000");
  } catch (err) {
    if (err instanceof NotFoundError) console.log(err.requestId, err.docUrl);
    else if (err instanceof BadRequestError) err.errors.forEach((e) => console.log(e.param, e.message));
    else if (err instanceof APIError) console.log(err.status);
  }

  // The escape hatch keeps working, typed by the same paths (1.0 call shape).
  const res = await social.client.POST("/v1/communities/{community_id}/posts", {
    params: { path: { community_id: communityId } },
    body: { actor_id: actorId, body: "raw" },
  });
  void res.data?.id;
  const list = await social.client.GET("/v1/workspaces/{workspace_id}/communities", { params: { path: { workspace_id: "w" }, query: { limit: 5 } } });
  void list.data?.data;
}
