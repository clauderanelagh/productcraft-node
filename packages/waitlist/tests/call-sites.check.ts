// Task 006 call-site acceptance, checked by `tsc` (the package's test script).
// The 0.x `.client` shape still compiles against the same paths.
import { Waitlist, NotFoundError, BadRequestError, APIError } from "../src/index.js";

declare const waitlist: Waitlist;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const assert = <T extends true>(_: T): void => undefined;

export async function acceptance(): Promise<void> {
  const wl = await waitlist.lists.create({ display_name: "Beta", slug: `sdk-smoke-${Date.now()}` });
  await new Waitlist().public({ workspace: "testing-environment", waitlist: wl.slug }).entries.create({ email: "success@simulator.amazonses.com", name: "SDK smoke" });
  for await (const e of waitlist.lists.entries.list(wl.id)) console.log(e.email);
  await waitlist.lists.delete(wl.id);

  await waitlist.lists.updateStatus(wl.id, { status: "active" });
  // @ts-expect-error status is a literal union
  void waitlist.lists.updateStatus(wl.id, { status: "nope" });
  const { count } = await waitlist.lists.entries.count(wl.id);
  void count;
  const csv: Response = await waitlist.lists.entries.export(wl.id);
  void csv;
  const { data, requestId } = await waitlist.lists.retrieve(wl.id).withResponse();
  void data.slug;
  void requestId;
  assert<Equal<typeof requestId, string | undefined>>(true);
  void wl.lastResponse.requestId;
  // @ts-expect-error the slugs are named, so they cannot be swapped
  void waitlist.public("testing-environment", "beta");
  const info = await waitlist.public({ workspace: "acme", waitlist: "beta" }).info.retrieve();
  void info;

  try {
    await waitlist.lists.retrieve("00000000-0000-0000-0000-000000000000");
  } catch (err) {
    if (err instanceof NotFoundError) console.log(err.requestId, err.docUrl);
    else if (err instanceof BadRequestError) err.errors.forEach((e) => console.log(e.param, e.message));
    else if (err instanceof APIError) console.log(err.status);
  }

  const event = await waitlist.webhooks.unwrap({ payload: "{}", headers: new Headers() });
  if (event.type === "entry.created") console.log(event.data);

  // The escape hatch keeps working, typed by the same paths.
  const res = await waitlist.client.POST("/v1/waitlists/{workspace_slug}/{waitlist_slug}/entries", {
    params: { path: { workspace_slug: "acme", waitlist_slug: "beta" } },
    body: { email: "success@simulator.amazonses.com", name: "SDK smoke" },
  });
  void res.data;
}
