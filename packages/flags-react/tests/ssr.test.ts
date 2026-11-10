// @vitest-environment jsdom
// SSR (task 019): the server renders from a FlagsClient's snapshot().toJSON(); hydrateRoot with the same
// bootstrap shows no mismatch, then the browser's own download re-renders with the fresh config.
import { act, createElement } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { FlagsClient } from "@productcraft/flags";
import { FlagsProvider, useFlag, useFlagsClient, useFlagsReady } from "../src/index.js";
import { config, sdkKey } from "./helpers.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SETTINGS = {
  split: { type: "string", value: "control", percentages: [{ percentage: 50, value: "a" }, { percentage: 50, value: "b" }] },
  banner: { type: "string", value: "Server" },
};

let client: FlagsClient | null = null;
function Page() {
  client = useFlagsClient();
  const split = useFlag("split", "none");
  const banner = useFlag("banner", "Default");
  return createElement("main", null, createElement("b", null, split), createElement("i", null, banner), createElement("u", null, String(useFlagsReady())));
}

describe("SSR bootstrap", () => {
  it("hydrates the server HTML without a mismatch, then updates from the download", async () => {
    // Server side: a FlagsClient that already holds the config (as after waitForReady()).
    const server = new FlagsClient({ bootstrap: config(5, SETTINGS), offline: true, logger: null });
    const bootstrap = server.snapshot().toJSON();
    server.close();
    const user = { identifier: "user-42" };
    const options = { sdkKey: sdkKey(), logger: null, fetch: vi.fn(async () => new Response(JSON.stringify(config(6, { ...SETTINGS, banner: { type: "string", value: "Fresh" } })))) };
    const tree = () => createElement(FlagsProvider, { options, bootstrap, user }, createElement(Page));

    // react-dom/server under jsdom still sees `window`: hide it so the provider takes its server path.
    const win = globalThis.window;
    vi.stubGlobal("window", undefined);
    const html = renderToString(tree());
    vi.stubGlobal("window", win);
    expect(options.fetch).not.toHaveBeenCalled();
    const split = new FlagsClient({ bootstrap: bootstrap ?? undefined, offline: true, logger: null }).snapshot().getValue("split", "none", user);
    expect(["a", "b"]).toContain(split);
    expect(html).toContain(`<b>${split}</b><i>Server</i><u>false</u>`);

    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.appendChild(container);
    const recoverable = vi.fn();
    const errors = vi.spyOn(console, "error");
    let root: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => {
      root = hydrateRoot(container, tree(), { onRecoverableError: recoverable });
    });
    expect(recoverable).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
    await act(async () => void (await client!.waitForReady()));
    expect(container.innerHTML).toBe(`<main><b>${split}</b><i>Fresh</i><u>true</u></main>`);
    await act(async () => root!.unmount());
    errors.mockRestore();
  });
});
