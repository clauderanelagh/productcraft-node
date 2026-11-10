// @vitest-environment jsdom
// FlagsProvider and the hooks (task 019): values from bootstrap before any download, re-render on
// configChanged (useSyncExternalStore), owned clients closed on unmount, StrictMode, misuse errors.
import { act, createElement, StrictMode, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FlagsClient } from "@productcraft/flags";
import { createTestClient } from "@productcraft/flags/testing";
import { FlagsProvider, useFlag, useFlagDetails, useFlagsClient, useFlagsReady } from "../src/index.js";
import { config, sdkKey } from "./helpers.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLElement;
async function render(node: ReactNode): Promise<HTMLElement> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root!.render(node));
  return container;
}
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = null;
  container?.remove();
});

const renders: string[] = [];
function Checkout(props: { user?: { identifier: string; custom?: Record<string, string> } }) {
  const on = useFlag("new_checkout", false, props.user);
  const limits = useFlag("limits", { max: 1 });
  const banner = useFlagDetails("banner", "Welcome");
  const text = `${on}|${limits.max}|${banner.value}|${banner.reason}`;
  renders.push(text);
  return createElement("p", null, text);
}

const RULED = {
  new_checkout: { type: "boolean", value: false, rules: [{ conditions: [{ user: { attribute: "plan", comparator: "eq", values: ["pro"] } }], serve: true }] },
  limits: { type: "json", value: '{"max":5}' },
  banner: { type: "string", value: "Hello" },
};

describe("FlagsProvider", () => {
  it("evaluates the bootstrap for the provider's user or the hook's", async () => {
    const el = await render(
      createElement(FlagsProvider, { options: { bootstrap: config(3, RULED), offline: true, logger: null }, user: { identifier: "u1", custom: { plan: "pro" } } }, createElement(Checkout), createElement(Checkout, { user: { identifier: "u2", custom: { plan: "free" } } })),
    );
    expect([...el.querySelectorAll("p")].map((p) => p.textContent)).toEqual(["true|5|Hello|STATIC", "false|5|Hello|STATIC"]);
  });

  it("serves defaults with PROVIDER_NOT_READY when there is no config", async () => {
    const client = new FlagsClient({ sdkKey: sdkKey(), polling: { mode: "manual" }, offline: true, logger: null });
    const el = await render(createElement(FlagsProvider, { client }, createElement(Checkout)));
    expect(el.textContent).toBe("false|1|Welcome|ERROR");
    client.close();
  });

  it("re-renders on configChanged, and only then", async () => {
    const client = createTestClient({ values: { new_checkout: false, banner: "A" } });
    const el = await render(createElement(FlagsProvider, { client }, createElement(Checkout)));
    expect(el.textContent).toBe("false|1|A|STATIC");
    renders.length = 0;
    await act(async () => client.set("new_checkout", true));
    expect(el.textContent).toBe("true|1|A|STATIC");
    await act(async () => client.set("banner", "B"));
    expect(el.textContent).toBe("true|1|B|STATIC");
    expect(renders).toEqual(["true|1|A|STATIC", "true|1|B|STATIC"]);
  });

  it("an owned client downloads after mount, re-renders with the fresh config and is closed on unmount", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(config(9, { ...RULED, banner: { type: "string", value: "Fresh" } })), { headers: { etag: 'W/"x"' } }));
    let seen: FlagsClient | null = null;
    function Probe() {
      seen = useFlagsClient();
      return createElement("i", null, String(useFlagsReady()));
    }
    const el = await render(createElement(FlagsProvider, { options: { sdkKey: sdkKey(), fetch, logger: null }, bootstrap: config(3, RULED) }, createElement(Checkout), createElement(Probe)));
    await act(async () => void (await seen!.waitForReady()));
    expect(fetch).toHaveBeenCalledTimes(1);
    // No If-None-Match from a page (design 6.3): the browser HTTP cache revalidates.
    expect(new Headers((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].headers).has("if-none-match")).toBe(false);
    expect(el.querySelector("p")!.textContent).toBe("false|5|Fresh|STATIC");
    expect(el.querySelector("i")!.textContent).toBe("true");
    await act(async () => root!.unmount());
    root = null;
    expect(seen!.state).toBe("closed");
  });

  it("survives StrictMode's unmount-remount with a live client", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(config(4, RULED))));
    let seen: FlagsClient | null = null;
    function Probe() {
      seen = useFlagsClient();
      return null;
    }
    await render(createElement(StrictMode, null, createElement(FlagsProvider, { options: { sdkKey: sdkKey(), fetch, logger: null } }, createElement(Probe), createElement(Checkout))));
    await act(async () => void (await seen!.waitForReady()));
    expect(seen!.state).toBe("ready");
    expect(container.textContent).toBe("false|5|Hello|STATIC");
  });

  it("leaves a client it was given open", async () => {
    const client = createTestClient({ values: { banner: "x" } });
    await render(createElement(FlagsProvider, { client }, createElement(Checkout)));
    await act(async () => root!.unmount());
    root = null;
    expect(client.state).not.toBe("closed");
    client.close();
  });

  it("hooks outside a provider throw a clear error", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(render(createElement(Checkout))).rejects.toThrow(/useFlagDetails\(\) must be called inside <FlagsProvider>/);
    expect(() => createElement(FlagsProvider, {})).not.toThrow();
    spy.mockRestore();
  });
});
