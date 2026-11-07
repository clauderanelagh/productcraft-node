// Task 007 call-site acceptance, checked by `tsc` (the package's test script).
// The 0.x `.client` shape still compiles against the same paths.
import { PlatformAuth, NotFoundError, BadRequestError, APIError } from "../src/index.js";

declare const platform: PlatformAuth;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const assert = <T extends true>(_: T): void => undefined;

export async function acceptance(): Promise<void> {
  const me = await platform.apiKeys.self();
  const ws = await platform.workspaces.retrieve("testing-environment");
  for await (const k of platform.workspaces.apiKeys.list(ws.slug)) console.log(k.id);
  void me.workspace_id;

  // Workspace-scoped calls take the slug positionally; ids follow it.
  const minted = await platform.workspaces.apiKeys.create(ws.slug, { name: "sdk-smoke", policy_ids: ["11111111-1111-1111-1111-111111111111"] });
  void minted.token;
  await platform.workspaces.apiKeys.delete(ws.slug, minted.record.id, { force: true });
  // @ts-expect-error expires_in_days is 30 | 90 | 365 | null
  void platform.workspaces.apiKeys.create(ws.slug, { name: "x", preset: "readonly", expires_in_days: 7 });
  // Exactly one of preset or policy_ids (the spec's oneOf; the API answers 400 otherwise).
  void platform.workspaces.apiKeys.create(ws.slug, { name: "x", preset: "readonly" });
  // @ts-expect-error neither preset nor policy_ids
  void platform.workspaces.apiKeys.create(ws.slug, { name: "x" });
  // @ts-expect-error both preset and policy_ids
  void platform.workspaces.apiKeys.create(ws.slug, { name: "x", preset: "readonly", policy_ids: ["11111111-1111-1111-1111-111111111111"] });
  // @ts-expect-error neither, on the preview either
  void platform.workspaces.apiKeys.preview(ws.slug, {});
  // include_revoked is a boolean, like every other flag.
  for await (const k of platform.workspaces.apiKeys.list(ws.slug, { include_revoked: false })) void k;
  // @ts-expect-error not the string "false"
  void platform.workspaces.apiKeys.list(ws.slug, { include_revoked: "false" });
  const page = await platform.workspaces.members.list(ws.slug, { limit: 10 });
  void page.data;
  void page.has_more;
  const avatar = await platform.workspaces.avatar.upload(ws.slug, { file: new File(["png"], "logo.png", { type: "image/png" }) });
  void avatar;
  // @ts-expect-error the upload takes a Blob/File, not a string
  void platform.me.avatar.upload({ file: "logo.png" });

  const { data, requestId } = await platform.workspaces.retrieve(ws.slug).withResponse();
  void data.slug;
  void requestId;
  assert<Equal<typeof requestId, string | undefined>>(true);
  void ws.lastResponse.requestId;

  // Auth for the platform user itself (the console's own flows).
  const token = await platform.auth.signin({ identifier: "ada@example.com", password: "…", session_duration: 3600 });
  const asUser = new PlatformAuth({ auth: { type: "bearer", token: token.access_token } });
  for await (const w of asUser.workspaces.list()) console.log(w.slug);

  const introspected = await platform.introspect.apiKey();
  void introspected.workspace_id;

  try {
    await platform.workspaces.apiKeys.retrieve(ws.slug, "00000000-0000-0000-0000-000000000000");
  } catch (err) {
    if (err instanceof NotFoundError) console.log(err.requestId, err.docUrl);
    else if (err instanceof BadRequestError) err.errors.forEach((e) => console.log(e.param, e.message));
    else if (err instanceof APIError) console.log(err.status);
  }

  // The escape hatch keeps working, typed by the same paths (conquer-api's call).
  const res = await platform.client.POST("/v1/introspect/api-key");
  void res.data?.workspace_id;
  // Since platform-auth-api/021 the bearer is the security scheme, not a header parameter:
  // drop `params: { header: { authorization: "" } }` when upgrading from 0.0.x.
  // @ts-expect-error authorization is no longer a declared header parameter
  void platform.client.POST("/v1/introspect/api-key", { params: { header: { authorization: "" } } });
  const keys = await platform.client.GET("/v1/workspaces/{workspace_slug}/api-keys", { params: { path: { workspace_slug: "acme" }, query: { limit: 5 } } });
  void keys.data?.data;
}
