// @vitest-environment jsdom
// The preferences store (task 020 moved preference state into the core): subscribe loads once,
// optimistic per-cell updates, rollback on failure, last-update-wins, and resolvePreference.
import { afterEach, describe, expect, it } from "vitest";
import type { Notify } from "@productcraft/notify";
import { createNotifyClient, resolvePreference, type NotifyBrowserClient, type PreferencesState } from "../src/index.js";
import { apiError, fakeApi, flush, json, until } from "./helpers.js";

let client: NotifyBrowserClient | undefined;
afterEach(() => {
  client?.close();
  client = undefined;
});

const prefs = (over: Partial<Notify.ClientPreferences> = {}): Notify.ClientPreferences =>
  ({
    categories: [
      { key: "comments", name: "Comments", description: null, defaults: { inbox: "on", email: "off", push: "on", webpush: "on" } },
      { key: "security", name: "Security", description: "Sign-ins", defaults: { inbox: "mandatory", email: "mandatory", push: "on", webpush: "off" } },
    ],
    preferences: [],
    unsubscribed_all: false,
    timezone: null,
    quiet_hours: null,
    ...over,
  }) as Notify.ClientPreferences;

function setup() {
  const api = fakeApi();
  client = createNotifyClient({ getToken: () => "rt_1", baseUrl: "https://api.notify.test", fetch: api.fetch, document: null });
  return { api, client };
}

describe("preferences store", () => {
  it("the first subscriber loads once; the state is a new object per change", async () => {
    const { api, client } = setup();
    api.on("GET /v1/client/preferences", () => json(prefs()));
    const seen: PreferencesState[] = [];
    const off1 = client.preferences.subscribe((s) => seen.push(s));
    const off2 = client.preferences.subscribe(() => undefined);
    await until(() => client.preferences.getState().status === "ready");
    expect(api.calls.filter((c) => c.path === "/v1/client/preferences")).toHaveLength(1);
    expect(seen.map((s) => s.status)).toEqual(["idle", "loading", "ready"]);
    expect(new Set(seen).size).toBe(3);
    off1();
    off2();
  });

  it("update is optimistic, sends only the cells, and keeps the server's answer", async () => {
    const { api, client } = setup();
    api.on("GET /v1/client/preferences", () => json(prefs()));
    let release!: () => void;
    api.on("PATCH /v1/client/preferences", async (c) => {
      await new Promise<void>((r) => (release = r));
      const body = c.body as { preferences: Notify.PreferenceCell[] };
      return json(prefs({ preferences: body.preferences.map((p) => ({ ...p })) }));
    });
    await client.preferences.get();
    const p = client.preferences.update([{ scope: "category", key: "comments", channel: "email", enabled: true }]);
    await flush();
    expect(resolvePreference(client.preferences.getState().data!, "comments", "email")).toEqual({ enabled: true, mandatory: false, source: "category" });
    release();
    await p;
    const patch = api.calls.find((c) => c.method === "PATCH")!;
    expect(patch.body).toEqual({ preferences: [{ scope: "category", key: "comments", channel: "email", enabled: true }] });
    expect(client.preferences.getState().data!.preferences).toHaveLength(1);
  });

  it("a failed update rolls the cell back and records the error", async () => {
    const { api, client } = setup();
    api.on("GET /v1/client/preferences", () => json(prefs()));
    api.on("PATCH /v1/client/preferences", () => apiError(422, "PREFERENCE_MANDATORY"));
    await client.preferences.get();
    await expect(client.preferences.update([{ scope: "category", key: "comments", channel: "inbox", enabled: false }], { timezone: "Europe/Lisbon" })).rejects.toMatchObject({ code: "PREFERENCE_MANDATORY" });
    const s = client.preferences.getState();
    expect(s.data!.preferences).toEqual([]);
    expect(s.data!.timezone).toBeNull();
    expect(s.error).toMatchObject({ code: "PREFERENCE_MANDATORY" });
  });

  it("an earlier, slower answer does not undo a later switch", async () => {
    const { api, client } = setup();
    api.on("GET /v1/client/preferences", () => json(prefs()));
    const pending: Array<() => void> = [];
    let server: Notify.PreferenceCell[] = [];
    api.on("PATCH /v1/client/preferences", async (c) => {
      const body = c.body as { preferences: Notify.PreferenceCell[] };
      server = [...server.filter((x) => !body.preferences.some((b) => b.key === x.key && b.channel === x.channel)), ...body.preferences];
      const snapshot = server.map((x) => ({ ...x }));
      await new Promise<void>((r) => pending.push(r));
      return json(prefs({ preferences: snapshot }));
    });
    await client.preferences.get();
    const a = client.preferences.update([{ scope: "category", key: "comments", channel: "push", enabled: false }]);
    await flush();
    const b = client.preferences.update([{ scope: "category", key: "comments", channel: "webpush", enabled: false }]);
    await until(() => pending.length === 2);
    pending[1]!();
    await b;
    pending[0]!();
    await a;
    const data = client.preferences.getState().data!;
    expect(resolvePreference(data, "comments", "push").enabled).toBe(false);
    expect(resolvePreference(data, "comments", "webpush").enabled).toBe(false);
  });
});

describe("resolvePreference", () => {
  it("category × channel > category × * > all × channel > default; mandatory always on", () => {
    const p = prefs({
      preferences: [
        { scope: "all", key: null, channel: "push", enabled: false },
        { scope: "category", key: "comments", channel: "*", enabled: false },
        { scope: "category", key: "comments", channel: "inbox", enabled: true },
        { scope: "category", key: "security", channel: "email", enabled: false },
      ] as Notify.PreferenceCell[],
    });
    expect(resolvePreference(p, "comments", "inbox")).toMatchObject({ enabled: true, source: "category" });
    expect(resolvePreference(p, "comments", "email")).toMatchObject({ enabled: false, source: "category_all_channels" });
    expect(resolvePreference(p, "security", "push")).toMatchObject({ enabled: false, source: "all" });
    expect(resolvePreference(p, "security", "webpush")).toMatchObject({ enabled: false, source: "default" });
    expect(resolvePreference(p, "security", "email")).toEqual({ enabled: true, mandatory: true, source: "default" });
  });
});
