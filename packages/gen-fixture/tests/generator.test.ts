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

describe("mock samples", () => {
  it("an allOf around an enum $ref samples to the enum value, not a spread string", async () => {
    // @ts-expect-error plain ESM script without type declarations
    const { sample } = await import("../../../scripts/gen-sdk/util.mjs");
    const schemas: Record<string, unknown> = { S: { type: "string", enum: ["queued", "done"] }, O: { type: "object", properties: { a: { type: "string" } } } };
    const deref = (x: { $ref?: string }) => (x.$ref ? schemas[x.$ref.split("/").pop()!] : x);
    expect(sample({ allOf: [{ $ref: "#/components/schemas/S" }], description: "d" }, deref)).toBe("queued");
    expect(sample({ allOf: [{ $ref: "#/components/schemas/O" }, { type: "object", properties: { b: { type: "integer" } } }] }, deref)).toEqual({ a: "string", b: 1 });
  });
});

describe("example variable names", () => {
  it("never names an example variable with a JS keyword (Mail's contacts.imports.list)", async () => {
    // @ts-expect-error plain ESM script without type declarations
    const { exampleVar } = await import("../../../scripts/gen-sdk/emit-code.mjs");
    expect(exampleVar("import")).toBe("importItem");
    expect(exampleVar("default", "Result")).toBe("defaultResult");
    expect(exampleVar("domain")).toBe("domain");
  });

  it("never shadows the client variable in an example (Waitlist's Waitlist model)", async () => {
    // @ts-expect-error plain ESM script without type declarations
    const { resultVar } = await import("../../../scripts/gen-sdk/emit-code.mjs");
    expect(resultVar("waitlist", "waitlist", "lists")).toBe("list");
    expect(resultVar("waitlist", "waitlist", "waitlists")).toBe("waitlistResult");
    expect(resultVar("domain", "mail", "domains")).toBe("domain");
    expect(resultVar("import", "mail", "contacts.imports", "Item")).toBe("importItem");
  });

  it("names an example result after the thing, not its shape (Trawl's WebhookEndpointWithSecret)", async () => {
    // @ts-expect-error plain ESM script without type declarations
    const { resultNoun } = await import("../../../scripts/gen-sdk/emit-code.mjs");
    expect(resultNoun("WebhookEndpointWithSecret")).toBe("WebhookEndpoint");
    expect(resultNoun("Stats")).toBe("Stats");
    expect(resultNoun("With")).toBe("With");
    expect(resultNoun(undefined)).toBeUndefined();
  });
});

describe("form uploads", () => {
  it("a multipart/form-data body becomes typed fields (binary as Blob) sent as FormData (Platform's avatar upload)", async () => {
    const spec = fresh();
    spec.paths[`${W}/widgets/{widget_id}/image`] = {
      post: {
        security: [{ bearer: [] }],
        operationId: "WidgetController_uploadImage",
        summary: "Upload a widget image",
        tags: ["widgets"],
        parameters: [
          { name: "workspace_id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
          { name: "widget_id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        requestBody: {
          required: true,
          content: { "multipart/form-data": { schema: { type: "object", required: ["file"], properties: { file: { type: "string", format: "binary", description: "PNG, at most 2 MB." }, caption: { type: "string" } } } } },
        },
        responses: { "204": { description: "Stored." } },
        "x-pc-sdk": { resource: "widgets.image", method: "upload", bind: ["workspace_id"], paginated: false },
      },
    };
    const { files } = await generate("gen-fixture", spec);
    const g = "packages/gen-fixture/src/_generated";
    expect(files[`${g}/types.ts`]).toContain('export type WidgetImageUploadParams = { /** PNG, at most 2 MB. */ file: Blob; caption?: NonNullable<');
    expect(files[`${g}/resources.ts`]).toContain("function formData(fields: object | undefined): FormData {");
    expect(files[`${g}/resources.ts`]).toContain("body: formData(params)");
    expect(files[`${g}/types.ts`]).not.toContain("BodyInit");
    const opsTest = files["packages/gen-fixture/tests/_generated/operations.test.ts"];
    expect(opsTest).toContain('{ file: new File(["…"], "image.png", { type: "image/png" }) }');
    expect(opsTest).toContain('expect((call.body as FormData).get("file")).toBeInstanceOf(Blob);');
  });

  it("emits no formData helper for a spec without form uploads", async () => {
    const { files } = await generate("gen-fixture");
    expect(files["packages/gen-fixture/src/_generated/resources.ts"]).not.toContain("function formData(");
  });
});

describe("README examples use a credential the route accepts (Platform review: a keyed client demoing a session-only route)", () => {
  const section = (readme: string, title: string) => readme.split(`## ${title}`)[1]?.split("\n## ")[0] ?? "";
  const readmeOf = async (spec?: Spec) => ((await generate("gen-fixture", spec)) as { files: Record<string, string> }).files["packages/gen-fixture/README.md"]!;

  it("uses the workspace key by default", async () => {
    const idem = section(await readmeOf(), "Idempotency");
    expect(idem).toContain("new Fixture({ apiKey: process.env.PRODUCTCRAFT_API_KEY })");
    expect(idem).not.toContain("sessionToken");
  });

  it("uses a person's session for an op whose 403 lists PAK_NOT_PERMITTED, and passes its positional arguments", async () => {
    const spec = fresh();
    for (const item of Object.values(spec.paths)) {
      for (const op of Object.values(item)) {
        const x = op["x-pc-sdk"] as { method?: string } | undefined;
        if (x?.method !== "create") continue;
        const responses = (op.responses ??= {}) as Record<string, Record<string, unknown>>;
        responses["403"] = { description: "Session only.", "x-pc-error-codes": ["FORBIDDEN", "PAK_NOT_PERMITTED"] };
      }
    }
    const idem = section(await readmeOf(spec), "Idempotency");
    expect(idem).toContain('declare const sessionToken: string;');
    expect(idem).toContain('new Fixture({ auth: { type: "bearer", token: sessionToken } })');
    expect(idem).not.toContain("PRODUCTCRAFT_API_KEY");
  });
});

describe("names are unique per scope (Social's workspace and community webhooks)", () => {
  const withRootPosts = (s: Spec) => {
    const op = structuredClone(s.paths["/v1/communities/{community_id}/posts"]!.post!);
    op.operationId = "WorkspacePostController_create";
    op["x-pc-sdk"] = { resource: "posts", method: "create", bind: ["workspace_id"], paginated: false };
    op.parameters = [{ name: "workspace_id", in: "path", required: true, schema: { type: "string" } }, ...((op.parameters as { in: string }[]) ?? []).filter((p) => p.in !== "path")];
    s.paths[`${W}/posts`] = { post: op };
  };

  it("the same resource.method on the root and in a scope is not a collision; the scoped copy's types carry the scope", async () => {
    const spec = fresh();
    withRootPosts(spec);
    const { files } = (await generate("gen-fixture", spec)) as { files: Record<string, string> };
    const types = files["packages/gen-fixture/src/_generated/types.ts"]!;
    expect(types).toMatch(/export type PostCreateParams = /);
    expect(types).toMatch(/export type CommunityScopedPostCreateParams = /);
    const resources = files["packages/gen-fixture/src/_generated/resources.ts"]!;
    expect(resources).toMatch(/T\.WithOptionalActor<T\.CommunityScopedPostCreateParams>/);
  });

  it("still fails on a duplicate inside one scope", async () => {
    const p = await problems((s) => ((s.paths["/v1/communities/{community_id}/posts/{post_id}/comments"]!.post!["x-pc-sdk"] as Record<string, unknown>).resource = "posts"));
    expect(p.join()).toMatch(/CommentController_create\): name collision, community\(…\)\.posts\.create is also PostController_create/);
  });
});

describe("delete on a POST action (Social's POST …/tags/{tagged_actor_id}/remove)", () => {
  it("is accepted when it names one object", async () => {
    const p = await problems((s) => ((s.paths[`${W}/widgets/{id}/archive`]!.post!["x-pc-sdk"] as Record<string, unknown>).method = "delete"));
    expect(p.join()).toMatch(/WidgetController_archive\): name collision, widgets\.delete/);
    expect(p.join()).not.toMatch(/cannot be a POST/);
  });

  it("still needs an id", async () => {
    const p = await problems((s) => ((s.paths[`${W}/widgets/bulk-delete`]!.post!["x-pc-sdk"] as Record<string, unknown>).method = "delete"));
    expect(p.join()).toMatch(/WidgetController_bulkDelete\): DELETE without an id cannot be "delete"/);
  });
});

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
    // x-pc-sdk.args names the second argument.
    expect(sig("PartController_remove")).toBe("fixture.widgets.parts.delete(widgetId, partNumber, options?): void");
    expect(sig("PostController_create")).toBe("fixture.community(…).posts.create(params, options?): Fixture.Post");
    expect(sig("PublicEntryController_create")).toBe("fixture.public({ … }).entries.create(params, options?): Fixture.Entry");
    expect(sig("RegionController_list")).toBe("fixture.regions.list(options?): Fixture.RegionListResponse");
    expect(manifest.LegacyController_ping).toBeUndefined();
    expect(manifest.WidgetController_create).toMatchObject({ idempotent: true, paginated: false });
    expect(manifest.PublicEntryController_create).toMatchObject({ public: true, idempotent: false });
    expect(manifest.PostController_list).toMatchObject({ actor: "query", scope: "community" });
    expect(manifest.PostController_create).toMatchObject({ actor: "body" });
    expect(manifest.WidgetController_get.poll).toEqual({ field: "status", terminal: ["active", "archived"], result: "metadata" });
  });

  it("chains .as() in docs and examples only where the call fills actor_id; the per-op test always chains it", async () => {
    const { files } = await generate("gen-fixture");
    const api = files["packages/gen-fixture/api.md"] as string;
    const section = (call: string) => api.slice(api.indexOf(`### \`${call}`), api.indexOf("### ", api.indexOf(`### \`${call}`) + 4));
    expect(section("fixture.community(…).posts.create(")).toMatch(/fixture\.community\("[^"]+"\)\.as\("/);
    expect(section("fixture.community(…).posts.delete(")).toMatch(/fixture\.community\("[^"]+"\)\.posts\.delete\(/);
    expect(section("fixture.community(…).posts.delete(")).not.toContain(".as(");
    expect(files["packages/gen-fixture/tests/_generated/operations.test.ts"]).toMatch(/fixture\.community\("community-id-1"\)\.as\("[^"]+"\)\.posts\.delete\(/);
  });

  it("x-pc-sdk.deprecated keeps the method, marked @deprecated with the note, on the method, its params type and in api.md", async () => {
    const { files } = await generate("gen-fixture");
    const res = files["packages/gen-fixture/src/_generated/resources.ts"] as string;
    expect(res).toMatch(/@deprecated The same transitions as `widgets\.history`, which SDK code should use\. Kept for this major; removed from the SDK in the next one\.[\s\S]*?\n {2}timeline\(id: string/);
    expect(files["packages/gen-fixture/api.md"]).toMatch(/widgets\/\{id\}\/timeline` → `[^`]+` · \*\*deprecated\*\*\n\n[^\n]*\n\n\*\*Deprecated:\*\* The same transitions as `widgets\.history`/);
  });

  it("x-pc-sdk.deprecated must be a note", async () => {
    const p = await problems((s) => ((s.paths[`${W}/widgets/{id}/timeline`]!.get!["x-pc-sdk"] as Record<string, unknown>).deprecated = ""));
    expect(p.join()).toMatch(/WidgetController_timeline\): x-pc-sdk.deprecated must be a note/);
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

  it("poll.result that is missing or not a free-form object", async () => {
    const set = (r: string) => (s: Spec) => ((s.paths[`${W}/widgets/{id}`]!.get!["x-pc-sdk"] as { poll: { result?: string } }).poll.result = r);
    expect((await problems(set("nope"))).join()).toMatch(/WidgetController_get\): x-pc-sdk.poll.result "nope" is not in the response/);
    expect((await problems(set("name"))).join()).toMatch(/WidgetController_get\): x-pc-sdk.poll.result "name" is not a free-form object/);
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

// Task 009 (Auth on the generator): methods on a scope's root, nested scope accessors with
// aliases and exposed binds, hand-written member names, and generated 0.x compat aliases.
describe("scope roots, accessors and compat aliases", () => {
  const C = "/v1/communities/{community_id}";
  const join = (s: Spec, x: Record<string, unknown> = { resource: "", method: "join", bind: ["community_id"] }) => {
    s.paths[`${C}/join`] = {
      post: {
        operationId: "CommunityController_join",
        summary: "Join the community",
        parameters: [{ name: "community_id", in: "path", required: true, schema: { type: "string", format: "uuid" } }],
        responses: { "204": { description: "Joined" } },
        "x-pc-sdk": x,
      },
    };
  };
  // @ts-expect-error plain ESM script without type declarations
  const surfaces = async () => (await import("../../../scripts/gen-sdk.mjs")).SURFACES as Record<string, Record<string, unknown>>;
  async function withConfig<T>(patch: (cfg: Record<string, unknown>) => void, run: () => Promise<T>): Promise<T> {
    const cfg = (await surfaces())["gen-fixture"]!;
    const saved = structuredClone(cfg);
    patch(cfg);
    try {
      return await run();
    } finally {
      for (const k of Object.keys(cfg)) delete cfg[k];
      Object.assign(cfg, saved);
    }
  }

  it("an empty resource puts the method on the scope's root", async () => {
    const spec = fresh();
    join(spec);
    const { files } = await generate("gen-fixture", spec);
    const res = files["packages/gen-fixture/src/_generated/resources.ts"] as string;
    expect(res).toMatch(/export class FixtureCommunity extends APIResource \{[\s\S]*?\n {2}join\(options\?: RequestOptions\): APIPromise<void> \{/);
    expect(files["packages/gen-fixture/api.md"]).toContain('fixture.community(…).join(options?)');
    expect(files["packages/gen-fixture/tests/_generated/operations.test.ts"]).toContain('fixture.community("community-id-1").as("');
  });

  it("an empty resource outside a bound scope fails", async () => {
    const p = await problems((s) => join(s, { resource: "", method: "join", bind: [] }));
    expect(p.join()).toMatch(/CommunityController_join\): an empty x-pc-sdk resource is only valid inside a bound scope/);
  });

  it("a generated name that hand-written code owns on the scope fails (SURFACES members)", async () => {
    const p = await withConfig(
      (cfg) => (((cfg.scopes as Record<string, Record<string, unknown>>).community!.members = ["join", "jwks"])),
      () => problems((s) => join(s)),
    );
    expect(p.join()).toMatch(/"join" is owned by hand-written code on community\(…\)/);
  });

  it("a nested accessor with an alias and an exposed bind (auth.admin.app(id), auth.app(id), .appId)", async () => {
    const { files } = await withConfig(
      (cfg) => Object.assign((cfg.scopes as Record<string, Record<string, unknown>>).community!, { accessor: "admin.community", aliases: ["group"], expose: { communityId: "community_id" } }),
      () => generate("gen-fixture", fresh()),
    );
    const client = files["packages/gen-fixture/src/_generated/client.ts"] as string;
    expect(client).toContain("get admin(): { community(communityId: string): FixtureCommunity } {");
    expect(client).toContain("group(communityId: string): FixtureCommunity {");
    expect(client).not.toMatch(/\n {2}community\(communityId: string\)/);
    expect(files["packages/gen-fixture/src/_generated/resources.ts"]).toContain("get communityId(): string {");
    expect(files["packages/gen-fixture/api.md"]).toContain("fixture.admin.community(…).posts.create(");
  });

  it("compat.json names become deprecated aliases that call the same route, across scopes", async () => {
    const compat = {
      methods: {
        root: { "regions.list": { operationId: "RegionController_list" } },
        community: {
          "posts.list": { operationId: "PostController_list" },
          "feed.publish": { operationId: "PostController_create" },
          "comments.add": { operationId: "CommentController_create" },
          "verifyToken": { handwritten: "CommunityScope.verifyToken" },
        },
      },
      types: { OldPost: "Post" },
    };
    const { files } = await withConfig((cfg) => (cfg.compat = compat), () => generate("gen-fixture", fresh()));
    const res = files["packages/gen-fixture/src/_generated/resources.ts"] as string;
    // Same name in the same scope: nothing emitted. Others: an alias in its 0.x namespace.
    expect(res).not.toContain("0.x name for `fixture.regions.list()`");
    expect(res).toMatch(/@deprecated Use `fixture\.community\(…\)\.posts\.create\(\)`[\s\S]*?\n {2}publish\(params: T\.WithOptionalActor<T\.PostCreateParams>, options\?: RequestOptions\)[^\n]*\{\n {4}return this\._client\.request\(\{ method: "POST", path: "\/v1\/communities\/\{community_id\}\/posts", pathParams: \{ community_id: this\._b\.community_id \}/);
    expect(res).toMatch(/\n {2}add\(postId: string, params/);
    expect(res).toMatch(/@deprecated 0\.x namespace[^\n]*\n {2}get feed\(\)/);
    expect(files["packages/gen-fixture/src/_generated/compat.ts"]).toContain('export type OldPost = components["schemas"]["Post"];');
  });

  it("compat failures: unknown operationId, a name the generator already uses elsewhere", async () => {
    const bad = { methods: { community: { "posts.get": { operationId: "Nope" }, "posts.create": { operationId: "CommentController_create" } } } };
    const p = await withConfig((cfg) => (cfg.compat = bad), () => problems(() => {}));
    expect(p.join()).toMatch(/compat community:posts\.get: operationId Nope is not a generated operation/);
    expect(p.join()).toMatch(/compat community:posts\.create: collides with a generated name/);
  });
});
