// Golden-file and failure-case tests for scripts/gen-sdk.mjs on the fixture spec.
// Goldens live in tests/__golden__/; after an intended generator change run
// `pnpm --filter @productcraft/gen-fixture exec vitest run -u` and review the diff.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM script without type declarations
import { generate, ROOT } from "../../../scripts/gen-sdk.mjs";

type Spec = { paths: Record<string, Record<string, Record<string, unknown>>>; components: { schemas: Record<string, Record<string, unknown>> }; [k: string]: unknown };
const SPEC_PATH = join(ROOT, "packages/gen-fixture/fixture.openapi.json");
const fresh = (): Spec => JSON.parse(readFileSync(SPEC_PATH, "utf8"));
const W = "/v1/workspaces/{workspace_id}";

async function problems(mutate: (spec: Spec) => void): Promise<string[]> {
  const spec = fresh();
  mutate(spec);
  try {
    await generate("gen-fixture", spec);
  } catch (err) {
    return (err as { problems?: string[] }).problems ?? [String(err)];
  }
  return [];
}

describe("golden output", () => {
  it("matches the checked-in goldens for every generated file", async () => {
    const { files } = await generate("gen-fixture");
    for (const [path, content] of Object.entries(files as Record<string, string>)) {
      if (!path.includes("/_generated/")) continue; // checked-in docs are diffed by gen-sdk --check
      const name = path.replace(/^.*\/_generated\//, "");
      await expect(content).toMatchFileSnapshot(`./__golden__/${name}.txt`);
    }
  });

  it("is deterministic", async () => {
    const a = await generate("gen-fixture");
    const b = await generate("gen-fixture");
    expect(a.files).toEqual(b.files);
    for (const content of Object.values(a.files as Record<string, string>)) {
      expect(content).not.toMatch(/\/home\/|\/tmp\/|\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?!\.000Z)/);
    }
  });

  it("names every section 3.2 shape from x-pc-sdk", async () => {
    const { files } = await generate("gen-fixture");
    const manifest = JSON.parse(files["packages/gen-fixture/src/_generated/manifest.json"]).operations;
    const sig = (id: string) => manifest[id].signature as string;
    expect(sig("WidgetController_list")).toBe("fixture.widgets.list(params?, options?): PagePromise<Fixture.Widget>");
    expect(sig("WidgetController_create")).toBe("fixture.widgets.create(params, options?): Fixture.Widget");
    expect(sig("WidgetController_get")).toBe("fixture.widgets.retrieve(id, options?): Fixture.Widget");
    expect(sig("WidgetController_update")).toBe("fixture.widgets.update(id, params?, options?): Fixture.Widget");
    expect(sig("WidgetController_remove")).toBe("fixture.widgets.delete(id, options?): void");
    expect(sig("SettingsController_get")).toBe("fixture.settings.retrieve(options?): Fixture.Settings");
    expect(sig("SettingsController_put")).toBe("fixture.settings.update(params?, options?): Fixture.Settings");
    expect(sig("WidgetController_archive")).toBe("fixture.widgets.archive(id, options?): Fixture.Widget");
    expect(sig("WidgetController_bulkDelete")).toBe("fixture.widgets.bulkDelete(params, options?): Fixture.WidgetBulkDeleteResponse");
    expect(sig("WidgetController_count")).toBe("fixture.widgets.count(params?, options?): Fixture.WidgetCountResponse");
    expect(sig("WidgetController_history")).toBe("fixture.widgets.history(id, options?): Fixture.WidgetHistoryResponse");
    expect(sig("WidgetController_export")).toBe("fixture.widgets.export(options?): Response");
    expect(sig("WidgetController_setStatus")).toBe("fixture.widgets.updateStatus(id, params, options?): Fixture.Widget");
    expect(sig("WidgetController_erase")).toBe("fixture.widgets.erase(params, options?): void");
    expect(sig("PartController_remove")).toBe("fixture.widgets.parts.delete(widgetId, partId, options?): void");
    expect(sig("PostController_create")).toBe("fixture.community(…).posts.create(params, options?): Fixture.Post");
    expect(sig("PublicEntryController_create")).toBe("fixture.public({ … }).entries.create(params, options?): Fixture.Entry");
    expect(sig("RegionController_list")).toBe("fixture.regions.list(options?): Fixture.RegionListResponse");
    expect(manifest.LegacyController_ping).toBeUndefined();
    expect(manifest.WidgetController_create).toMatchObject({ idempotent: true, paginated: false });
    expect(manifest.PublicEntryController_create).toMatchObject({ public: true, idempotent: false });
    expect(manifest.PostController_list).toMatchObject({ actor: "query", scope: "community" });
    expect(manifest.PostController_create).toMatchObject({ actor: "body" });
    expect(manifest.WidgetController_get.poll).toEqual({ field: "status", terminal: ["active", "archived"] });
  });

  it("makes defaulted fields optional in requests and required in responses", async () => {
    const { files } = await generate("gen-fixture");
    const paths = files["packages/gen-fixture/src/_generated/paths.d.ts"] as string;
    const block = (name: string) => paths.slice(paths.indexOf(`${name}: {`), paths.indexOf("};", paths.indexOf(`${name}: {`)));
    expect(block("UpdateSettingsDto")).toMatch(/retention_days\?: number/);
    expect(block("SettingsResponseDto")).toMatch(/retention_days: number/);
    expect(block("CreateWidgetDto")).toMatch(/color\?: "red" \| "blue"/);
  });
});

describe("failures name the operation and exit non-zero", () => {
  it("missing x-pc-sdk", async () => {
    const p = await problems((s) => delete s.paths[`${W}/widgets`]!.get!["x-pc-sdk"]);
    expect(p).toEqual([expect.stringMatching(/GET \/v1\/workspaces\/\{workspace_id\}\/widgets \(WidgetController_list\): missing x-pc-sdk/)]);
  });

  it("name collision", async () => {
    const p = await problems((s) => ((s.paths[`${W}/widgets/count`]!.get!["x-pc-sdk"] as Record<string, unknown>).method = "list"));
    expect(p.join()).toMatch(/WidgetController_count\): name collision, widgets\.list is also WidgetController_list/);
  });

  it("method colliding with a resource", async () => {
    const p = await problems((s) => ((s.paths[`${W}/widgets/count`]!.get!["x-pc-sdk"] as Record<string, unknown>).method = "parts"));
    expect(p.join()).toMatch(/widgets\.parts collides with a resource/);
  });

  it.each(["client", "withResponse", "as", "lastResponse", "poll", "then"])("reserved name %s", async (name) => {
    const p = await problems((s) => ((s.paths[`${W}/widgets/count`]!.get!["x-pc-sdk"] as Record<string, unknown>).method = name));
    expect(p.join()).toMatch(new RegExp(`WidgetController_count\\): "${name}" is reserved`));
  });

  it("reserved resource segment and webhooks.unwrap", async () => {
    expect((await problems((s) => ((s.paths[`${W}/widgets/count`]!.get!["x-pc-sdk"] as Record<string, unknown>).resource = "community"))).join()).toMatch(/"community" is reserved/);
    expect((await problems((s) => Object.assign(s.paths[`${W}/webhooks/endpoints`]!.get!["x-pc-sdk"] as object, { resource: "webhooks", method: "unwrap" }))).join()).toMatch(/webhooks\.unwrap" is reserved/);
  });

  it("verbs outside the closed vocabulary", async () => {
    const p = await problems((s) => ((s.paths[`${W}/widgets/{id}`]!.delete!["x-pc-sdk"] as Record<string, unknown>).method = "remove"));
    expect(p.join()).toMatch(/WidgetController_remove\): verb "remove" is not in the closed vocabulary/);
  });

  it("standard verb on the wrong HTTP method", async () => {
    const p = await problems((s) => ((s.paths[`${W}/widgets/{id}/archive`]!.post!["x-pc-sdk"] as Record<string, unknown>).method = "list"));
    expect(p.join()).toMatch(/WidgetController_archive\): "list" cannot be a POST/);
  });

  it("id-less DELETE named delete", async () => {
    const p = await problems((s) => ((s.paths[`${W}/widgets`]!.delete!["x-pc-sdk"] as Record<string, unknown>).method = "delete"));
    expect(p.join()).toMatch(/WidgetController_erase\): DELETE without an id cannot be "delete"/);
  });

  it("unresolved $ref", async () => {
    const p = await problems((s) => ((s.paths[`${W}/widgets`]!.post!.requestBody as { content: Record<string, { schema: unknown }> }).content["application/json"]!.schema = { $ref: "#/components/schemas/Nope" }));
    expect(p.join()).toMatch(/WidgetController_create\): unresolved \$ref #\/components\/schemas\/Nope/);
  });

  it("Record<string, never> in a request body", async () => {
    const p = await problems((s) => ((s.components.schemas.CreateWidgetDto!.properties as Record<string, unknown>).metadata = { type: "object" }));
    expect(p.join()).toMatch(/WidgetController_create\): request body object at .*metadata has no properties and no additionalProperties/);
  });

  it("bind without a configured scope", async () => {
    const p = await problems((s) => ((s.paths[`${W}/widgets/{widget_id}/parts`]!.get!["x-pc-sdk"] as Record<string, unknown>).bind = ["workspace_id", "widget_id"]));
    expect(p.join()).toMatch(/PartController_list\): bind \["widget_id"\] has no scope/);
  });

  it("paginated without the page shape", async () => {
    const p = await problems((s) => ((s.paths[`${W}/widgets/count`]!.get!["x-pc-sdk"] as Record<string, unknown>).paginated = true));
    expect(p.join()).toMatch(/WidgetController_count\): x-pc-sdk.paginated but the response is not/);
  });

  it("poll on a field the response lacks", async () => {
    const p = await problems((s) => ((s.paths[`${W}/widgets/{id}`]!.get!["x-pc-sdk"] as { poll: { field: string } }).poll.field = "phase"));
    expect(p.join()).toMatch(/WidgetController_get\): x-pc-sdk.poll.field "phase" is not in the response/);
  });

  it("query and body declaring the same key", async () => {
    const p = await problems((s) => (s.paths[`${W}/widgets`]!.post!.parameters as unknown[]).push({ name: "name", in: "query", schema: { type: "string" } }));
    expect(p.join()).toMatch(/WidgetController_create\): query and body both declare name/);
  });

  it("public type name collision", async () => {
    const p = await problems((s) => (s.components.schemas.PartResponseDto!["x-pc-sdk-model"] = "Widget"));
    expect(p.join()).toMatch(/type name collision: Widget/);
  });

  it("reports every problem at once", async () => {
    const p = await problems((s) => {
      delete s.paths[`${W}/widgets`]!.get!["x-pc-sdk"];
      (s.paths[`${W}/widgets/{id}`]!.delete!["x-pc-sdk"] as Record<string, unknown>).method = "remove";
    });
    expect(p).toHaveLength(2);
  });
});
