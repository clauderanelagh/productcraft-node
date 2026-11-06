// Task 004 call-site acceptance, checked by `tsc` (the package's test script).
// The generic on createAndPoll/poll types `result`; the 0.x `.client` shape still compiles.
import { Trawl, NotFoundError, BadRequestError, APIError } from "../src/index.js";

declare const trawl: Trawl;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const assert = <T extends true>(_: T): void => undefined;

const json_schema = { type: "object", properties: { tiers: { type: "array" } }, required: ["tiers"] };
type Tiers = { tiers: { name: string }[] };

export async function acceptance(): Promise<void> {
  const job = await trawl.jobs.create({ description: "Pricing tiers", json_schema, suggested_urls: ["https://example.com/pricing"] });
  const again = await trawl.jobs.retrieve(job.id);
  void again;
  await trawl.jobs.cancel(job.id);
  for await (const j of trawl.jobs.list({ limit: 10 })) console.log(j.id);
  const done = await trawl.jobs.createAndPoll<Tiers>(
    { description: "Pricing tiers", json_schema, suggested_urls: ["https://example.com/pricing"] },
    { timeoutMs: 300_000 },
  );
  assert<Equal<typeof done.result, Tiers | null>>(true);
  const first: string | undefined = done.result?.tiers[0]?.name;
  void first;
  // @ts-expect-error `result` is typed by the generic: no such field
  void done.result?.price;
  const polled = await trawl.jobs.poll<Tiers>(job.id, { intervalMs: 2_000 });
  assert<Equal<typeof polled.result, Tiers | null>>(true);
  void polled.status;
  // Without a type argument `result` keeps the spec's free-form type.
  const untyped = await trawl.jobs.poll(job.id);
  assert<Equal<typeof untyped.result, Trawl.Job["result"]>>(true);
  void untyped.status;
  // Status is an open union that still narrows.
  if (done.status === "failed") console.log(done.error);

  // Errors by class.
  try {
    await trawl.jobs.retrieve("00000000-0000-0000-0000-000000000000");
  } catch (err) {
    if (err instanceof NotFoundError) console.log(err.requestId, err.docUrl);
    else if (err instanceof BadRequestError) err.errors.forEach((e) => console.log(e.param, e.message));
    else if (err instanceof APIError) console.log(err.status);
  }

  // Webhooks: the typed union narrows by `type`.
  const event = await trawl.webhooks.unwrap({ payload: "{}", headers: new Headers() });
  if (event.type === "job.succeeded") console.log(event.data);

  // The escape hatch keeps working, typed by the same paths.
  const { data } = await trawl.client.GET("/v1/workspaces/{workspace_id}/jobs/{id}", {
    params: { path: { workspace_id: "9b2f6c1e-0d6a-4a63-9a43-2f1c3e4d5a6b", id: job.id } },
  });
  void data?.status;
}
