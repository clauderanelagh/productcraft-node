// Type-level rules of docs/sdk-standard.md section 3.4, checked by `tsc` on the
// generated fixture (the package's test script runs it before vitest).
// Each `@ts-expect-error` line is a rule: if the generator stops enforcing it,
// the directive becomes unused and tsc fails.

import { Fixture, NotFoundError, type FixtureErrorCode } from "../src/index.js";
import type { Page, PagePromise, APIPromise } from "@productcraft/core";

declare const fixture: Fixture;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const assert = <T extends true>(_: T): void => undefined;

export async function rules(): Promise<void> {
  // Product type namespace: models, params and enum value arrays.
  const params: Fixture.WidgetCreateParams = { name: "Gadget" };
  const statuses: readonly Fixture.WidgetStatus[] = Fixture.WidgetStatus.values;
  void statuses;

  // Request enums are closed.
  // @ts-expect-error "green" is not a colour the API accepts
  const bad: Fixture.WidgetCreateParams = { name: "x", color: "green" };
  void bad;

  // An enum path argument is its union, not string.
  await fixture.widgets.paint("5d1e2f3a-4b5c-4d6e-8f70-8192a3b4c5d6", "red");
  // @ts-expect-error "green" is not a colour the path accepts
  void fixture.widgets.paint("5d1e2f3a-4b5c-4d6e-8f70-8192a3b4c5d6", "green");

  // Defaults: optional in requests (color, quantity, retention_days) ...
  await fixture.widgets.create(params);
  await fixture.settings.update({});
  await fixture.widgets.parts.create("w", { label: "Bolt", sku: "B-100" });
  // ... and required in responses.
  const settings = await fixture.settings.retrieve();
  const days: number = settings.retention_days;
  void days;

  // A request oneOf (Mail's html / text / template rule) is a union: one of them, not none, not both.
  await fixture.widgets.parts.create("w", { label: "Bolt", catalog_ref: "cat_42" });
  // @ts-expect-error neither a sku nor a catalogue entry
  await fixture.widgets.parts.create("w", { label: "Bolt" });
  // @ts-expect-error a sku and a catalogue entry
  await fixture.widgets.parts.create("w", { label: "Bolt", sku: "B-100", catalog_ref: "cat_42" });

  // Renames keep the former names as deprecated aliases: the model, the method and its types.
  assert<Equal<Fixture.Area, Fixture.Region>>(true);
  const tally = await fixture.widgets.tally();
  void tally;
  assert<Equal<Fixture.WidgetTallyParams, Fixture.WidgetCountParams>>(true);
  // x-pc-sdk.args names a positional argument.
  await fixture.widgets.parts.delete("w", "p");

  // The runtime's types come from the product package (core is only a transitive dependency).
  const regionPage: Fixture.Page<Fixture.Region> | undefined = undefined;
  void regionPage;
  const opts: Fixture.RequestOptions = { maxRetries: 0 };
  void opts;

  // Response enums are open: a value added later is not a type error.
  const widget = await fixture.widgets.retrieve("id");
  const later: Fixture.Widget["status"] = "frozen-by-a-future-release";
  const colour: Fixture.Widget["color"] = "magenta";
  void later;
  void colour;
  // ... but known values still autocomplete and narrow.
  const known: Fixture.Widget["status"] = "active";
  void known;
  // Nullable stays nullable.
  assert<Equal<typeof widget.nickname, string | null>>(true);

  // Every returned object carries lastResponse.
  const requestId: string | undefined = widget.lastResponse.requestId;
  void requestId;

  // Paginated lists return a PagePromise of the model; options-only call shape.
  const pages: PagePromise<Fixture.Widget> = fixture.widgets.list();
  const page: Page<Fixture.Widget> = await fixture.widgets.list({}, { timeout: 5_000 });
  void pages;
  void page;
  for await (const w of fixture.widgets.list({ status: ["active"] })) {
    const typed: Fixture.Widget = w;
    void typed;
  }

  // Positional path arguments, outermost first.
  await fixture.widgets.parts.delete("widget-id", "part-id");
  // @ts-expect-error the part id is required
  await fixture.widgets.parts.delete("widget-id");

  // Non-JSON success content resolves to the raw Response; 204 to void.
  const csv: APIPromise<Response> = fixture.widgets.export();
  void csv;
  const erased: void = await fixture.widgets.erase({ before: "2026-01-01T00:00:00.000Z" });
  void erased;
  // @ts-expect-error erase needs `before`
  await fixture.widgets.erase();

  // Polling from x-pc-sdk.poll.
  const done: Fixture.Widget = await fixture.widgets.poll("id", { timeoutMs: 1_000 });
  const created: Fixture.Widget = await fixture.widgets.createAndPoll({ name: "Gadget" }, { intervalMs: 10 });
  void done;
  void created;
  // x-pc-sdk.poll.result: the free-form field is typed by the caller's generic; optionality stays.
  type Shape = { tier: string };
  const typed = await fixture.widgets.createAndPoll<Shape>({ name: "Gadget" });
  assert<Equal<typeof typed.metadata, Shape | undefined>>(true);
  const polled = await fixture.widgets.poll<Shape>("id");
  const tier: string | undefined = polled.metadata?.tier;
  void tier;
  // Without a type argument it keeps the spec's free-form type.
  assert<Equal<typeof done.metadata, Fixture.Widget["metadata"]>>(true);
  // @ts-expect-error the generic types `metadata`, so a wrong field is caught
  void typed.metadata?.price;

  // Scopes: bound community, .as() fills actor_id (so it becomes optional).
  const community = fixture.community("c").as("actor");
  await community.posts.create({ body: "Hello" });
  await community.posts.comments.create("post-id", { body: "First!" });
  // Without .as(), the type still accepts actor_id.
  await fixture.community("c").posts.create({ body: "Hi", actor_id: "a" });
  // @ts-expect-error bound params are not positional
  await fixture.community("c").posts.comments.create("community", "post", { body: "x" });

  // Public scope: named fields so the slugs cannot be swapped.
  const entry: Fixture.Entry = await fixture.public({ workspace: "acme", waitlist: "beta" }).entries.create({ email: "ada@example.com" });
  void entry;

  // Webhooks: the union narrows on type and keeps compiling for unknown types.
  const event = await fixture.webhooks.unwrap({ payload: "{}", headers: new Headers(), secret: "whsec_x" });
  switch (event.type) {
    case "widget.created":
      assert<Equal<typeof event.data, Fixture.Widget>>(true);
      break;
    case "widget.archived":
      assert<Equal<typeof event.data.archived_by, string>>(true);
      break;
    default:
      assert<Equal<typeof event, Fixture.UnknownWebhookEvent>>(true);
      console.log("unhandled", String(event.type), event.id);
  }

  // Error codes are an open union; error classes come from core.
  const code: FixtureErrorCode = "WIDGET_LOCKED";
  const future: FixtureErrorCode = "SOMETHING_NEW";
  void code;
  void future;
  void NotFoundError;

  // Reserved names are not resources; the escape hatch is typed by the same paths.
  const raw = await fixture.client.GET("/v1/regions");
  void raw.data;

  // Deprecated ops are still callable (and tagged @deprecated in JSDoc).
  await fixture.widgets.archive("id");
}
