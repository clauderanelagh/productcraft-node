// @vitest-environment jsdom
// Task 020: hooks bound to the core's stores, <NotifyInbox/> and <NotifyPreferences/> behaviour,
// accessibility (axe + keyboard), unsafe links, locales. The API is notify-js's fake behind `fetch`.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import axe from "axe-core";
import { StrictMode, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Notify } from "@productcraft/notify";
import { createNotifyClient, type NotifyBrowserClient } from "@productcraft/notify-js";
import { NotifyInbox, NotifyPreferences, NotifyProvider, useInbox, usePreferences, type NotifyProviderProps } from "../src/index.js";
import { fakeApi, inboxPage, item, json } from "../../notify-js/tests/helpers.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const BASE = "https://api.notify.test";
const clients: NotifyBrowserClient[] = [];
afterEach(() => {
  cleanup();
  for (const c of clients.splice(0)) c.close();
  vi.restoreAllMocks();
});

const prefs = (over: Partial<Notify.ClientPreferences> = {}): Notify.ClientPreferences =>
  ({
    categories: [
      { key: "comments", name: "Comments", description: "Replies and mentions", defaults: { inbox: "on", email: "off", push: "on", webpush: "on" } },
      { key: "security", name: "Security", description: null, defaults: { inbox: "mandatory", email: "mandatory", push: "on", webpush: "on" } },
    ],
    preferences: [],
    unsubscribed_all: false,
    timezone: "Europe/Lisbon",
    quiet_hours: null,
    ...over,
  }) as Notify.ClientPreferences;

function setup(items: Notify.InboxItem[] = [], opts: { realtime?: boolean } = {}) {
  const api = fakeApi();
  api.on("GET /v1/client/inbox", () => inboxPage(items));
  api.on("POST /v1/client/inbox/mark", (c) => json({ updated: 1, counts: { unseen: 0, unread: (c.body as { action: string }).action === "read" ? 0 : items.length } }));
  api.on("POST /v1/client/inbox/" + (items[0]?.id ?? "x") + "/interact", () => json({ ...items[0], interacted_at: new Date().toISOString(), read_at: new Date().toISOString() }));
  api.on("GET /v1/client/preferences", () => json(prefs()));
  api.on("PATCH /v1/client/preferences", (c) => {
    const body = c.body as { preferences?: Notify.PreferenceCell[]; timezone?: string; quiet_hours?: unknown };
    return json(prefs({ preferences: (body.preferences ?? []).filter((p) => p.enabled !== null), ...(body.timezone !== undefined ? { timezone: body.timezone } : {}), ...(body.quiet_hours !== undefined ? { quiet_hours: body.quiet_hours as never } : {}) }));
  });
  const client = createNotifyClient({ getToken: () => "rt_1", baseUrl: BASE, fetch: api.fetch, document: null, realtime: opts.realtime ?? false });
  clients.push(client);
  const wrap = (node: ReactNode, p: Partial<NotifyProviderProps> = {}) => (
    <NotifyProvider client={client} {...p}>
      {node}
    </NotifyProvider>
  );
  return { api, client, wrap };
}

async function noAxeViolations(el: Element): Promise<void> {
  const r = await axe.run(el, { rules: { "color-contrast": { enabled: false } } });
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(" | ")}`)).toEqual([]);
}

describe("hooks", () => {
  it("useInbox follows the core store: first page, streamed item.created, onNew", async () => {
    const first = item({ title: "First" });
    const { api, wrap } = setup([first], { realtime: true });
    const onNew = vi.fn();
    function List() {
      const { items, counts, status } = useInbox({ onNew });
      return (
        <p data-testid="out">
          {status}:{counts.unread}:{items.map((i) => i.title).join(",")}
        </p>
      );
    }
    render(wrap(<List />));
    await waitFor(() => expect(screen.getByTestId("out").textContent).toBe("ready:1:First"));
    await waitFor(() => expect(api.streams.length).toBe(1));
    const second = item({ title: "Second" });
    await act(async () => {
      api.lastStream.send("item.created", { item: second }, second.id);
      api.lastStream.send("counts", { unseen: 2, unread: 2 });
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(screen.getByTestId("out").textContent).toBe("ready:2:Second,First");
    expect(onNew).toHaveBeenCalledWith(expect.objectContaining({ title: "Second" }));
  });

  it("useInbox with the same filters shares one store; tenant filters reach the API", async () => {
    const { api, wrap } = setup([]);
    function Two() {
      const a = useInbox({ tenant: "org_42" });
      const b = useInbox({ tenant: "org_42" });
      return <p data-testid="same">{String(a.store === b.store)}</p>;
    }
    render(wrap(<Two />));
    expect(screen.getByTestId("same").textContent).toBe("true");
    await waitFor(() => expect(api.calls.some((c) => c.path === "/v1/client/inbox")).toBe(true));
    expect(api.calls.filter((c) => c.path === "/v1/client/inbox").every((c) => new URL(c.url).searchParams.get("tenant") === "org_42")).toBe(true);
  });

  it("usePreferences loads and updates one cell", async () => {
    const { api, wrap } = setup();
    let hook!: ReturnType<typeof usePreferences>;
    function P() {
      hook = usePreferences();
      return <p data-testid="p">{hook.status}</p>;
    }
    render(wrap(<P />));
    await waitFor(() => expect(screen.getByTestId("p").textContent).toBe("ready"));
    await act(() => hook.update([{ scope: "category", key: "comments", channel: "email", enabled: true }]).then(() => undefined));
    expect(api.calls.find((c) => c.method === "PATCH")!.body).toEqual({ preferences: [{ scope: "category", key: "comments", channel: "email", enabled: true }] });
    expect(hook.preferences!.preferences).toHaveLength(1);
  });

  it("a provider with getToken owns its client, survives StrictMode and closes on unmount", async () => {
    const api = fakeApi();
    api.on("GET /v1/client/inbox", () => inboxPage([item({ title: "Mine" })]));
    const getToken = vi.fn(() => "rt_owned");
    function L() {
      const { items } = useInbox();
      return <p data-testid="l">{items.map((i) => i.title).join()}</p>;
    }
    const { unmount } = render(
      <StrictMode>
        <NotifyProvider getToken={getToken} baseUrl={BASE} fetch={api.fetch} realtime={false} document={null}>
          <L />
        </NotifyProvider>
      </StrictMode>,
    );
    await waitFor(() => expect(screen.getByTestId("l").textContent).toBe("Mine"));
    expect(api.calls.every((c) => c.headers.authorization === "Bearer rt_owned")).toBe(true);
    unmount();
  });

  it("hooks outside a provider say so", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const Bad = () => (useInbox(), null);
    expect(() => render(<Bad />)).toThrow(/inside <NotifyProvider>/);
  });
});

describe("<NotifyInbox/>", () => {
  const items = () => [
    item({
      title: "Ada mentioned you",
      body: "See **this** [doc](https://example.com/doc) and [bad](javascript:alert(1)) <b>raw</b>",
      action_url: "javascript:alert(document.cookie)",
      actor: { external_id: "ada", name: "Ada Lovelace", avatar_url: "javascript:alert(2)" },
      actions: [
        { label: "Accept", action_key: "accept", url: "https://example.com/accept" },
        { label: "Decline", action_key: "decline" },
        { label: "Third", action_key: "third" },
      ] as Notify.InboxAction[],
    }),
  ];

  it("bell label carries the count; opening marks seen, traps focus, Escape closes back to the bell", async () => {
    const list = items();
    const { api, wrap } = setup(list);
    render(wrap(<NotifyInbox />));
    const bell = await screen.findByRole("button", { name: "Notifications, 1 unread" });
    expect(bell.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(bell);
    const dialog = await screen.findByRole("dialog", { name: "Notifications" });
    expect(bell.getAttribute("aria-expanded")).toBe("true");
    expect(dialog.contains(document.activeElement)).toBe(true);
    await waitFor(() => expect(api.calls.some((c) => c.path === "/v1/client/inbox/mark" && (c.body as { action: string }).action === "seen")).toBe(true));
    // The item is announced as unread.
    const li = within(dialog).getAllByRole("listitem")[0]!;
    expect(li.textContent).toContain("Unread: Ada mentioned you");
    // Focus wraps from the last focusable element to the first.
    const focusables = [...dialog.querySelectorAll<HTMLElement>("a[href],button:not([disabled])")];
    focusables.at(-1)!.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement).toBe(focusables[0]);
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(bell);
  });

  it("never renders unsafe URLs; Markdown is a subset with no raw HTML; at most two action buttons", async () => {
    const { wrap } = setup(items());
    const { container } = render(wrap(<NotifyInbox />));
    fireEvent.click(await screen.findByRole("button", { name: /Notifications/ }));
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(within(dialog).queryAllByRole("listitem")).toHaveLength(1));
    const hrefs = [...container.querySelectorAll("[href],[src]")].map((e) => e.getAttribute("href") ?? e.getAttribute("src"));
    expect(hrefs).toEqual(["https://example.com/doc"]);
    expect(container.innerHTML).not.toMatch(/javascript:/);
    expect(container.querySelector("b")).toBeNull();
    expect(dialog.querySelector(".pcn-body strong")?.textContent).toBe("this");
    expect(dialog.querySelector(".pcn-body")?.textContent).toContain("<b>raw</b>");
    // The title has no link (unsafe action_url), so it is a button; the avatar falls back to initials.
    expect(within(dialog).getByRole("button", { name: "Unread: Ada mentioned you" })).toBeTruthy();
    expect(dialog.querySelector(".pcn-avatar-initials")?.textContent).toBe("AL");
    expect(within(dialog).queryByRole("button", { name: "Third" })).toBeNull();
  });

  it("an action button records the press with its action_key and navigates through onNavigate", async () => {
    const list = items();
    const { api, wrap } = setup(list);
    const onNavigate = vi.fn();
    render(wrap(<NotifyInbox onNavigate={onNavigate} />));
    fireEvent.click(await screen.findByRole("button", { name: /Notifications/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Accept" }));
    await waitFor(() => expect(api.calls.some((c) => c.path.endsWith("/interact"))).toBe(true));
    expect(api.calls.find((c) => c.path.endsWith("/interact"))!.body).toEqual({ action_key: "accept" });
    expect(onNavigate).toHaveBeenCalledWith("https://example.com/accept", expect.objectContaining({ id: list[0]!.id }));
  });

  it("mark all as read updates the badge; axe finds nothing open or closed", async () => {
    const { api, wrap } = setup(items());
    const { container } = render(wrap(<NotifyInbox />));
    const bell = await screen.findByRole("button", { name: "Notifications, 1 unread" });
    await noAxeViolations(container);
    fireEvent.click(bell);
    await screen.findByRole("dialog");
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(1));
    await noAxeViolations(container);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Mark all as read" })));
    await waitFor(() => expect(bell.getAttribute("aria-label")).toBe("Notifications"));
    expect(api.calls.find((c) => c.path === "/v1/client/inbox/mark" && (c.body as { action: string }).action === "read")!.body).toMatchObject({ action: "read" });
  });

  it("locale switch: pt-PT strings and relative time, overrides on top", async () => {
    const { wrap } = setup([item({ title: "Olá", created_at: new Date(Date.now() - 3 * 3_600_000).toISOString() })]);
    render(wrap(<NotifyInbox />, { locale: "pt-PT", strings: { markAllRead: "Ler tudo" } }));
    fireEvent.click(await screen.findByRole("button", { name: "Notificações, 1 por ler" }));
    const dialog = await screen.findByRole("dialog", { name: "Notificações" });
    await waitFor(() => expect(within(dialog).getAllByRole("listitem")).toHaveLength(1));
    expect(within(dialog).getByRole("button", { name: "Ler tudo" })).toBeTruthy();
    expect(dialog.querySelector("time")!.textContent).toBe("há 3 horas");
  });
});

describe("<NotifyPreferences/>", () => {
  it("a table of labelled switches; mandatory cells locked with the reason; axe clean", async () => {
    const { wrap } = setup();
    const { container } = render(wrap(<NotifyPreferences />));
    const table = await screen.findByRole("table", { name: "Notification preferences" });
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Category", "In-app", "Email", "Mobile push", "Browser push"]);
    const locked = screen.getByRole("switch", { name: "Security: Email" }) as HTMLInputElement;
    expect(locked.disabled).toBe(true);
    expect(locked.checked).toBe(true);
    expect(document.getElementById(locked.getAttribute("aria-describedby")!)!.textContent).toMatch(/can't be turned off/);
    expect((screen.getByRole("switch", { name: "Comments: Email" }) as HTMLInputElement).checked).toBe(false);
    await noAxeViolations(container);
  });

  it("a switch saves just that cell; back to the default sends enabled: null", async () => {
    const { api, wrap } = setup();
    render(wrap(<NotifyPreferences />));
    const sw = (await screen.findByRole("switch", { name: "Comments: Email" })) as HTMLInputElement;
    await act(async () => fireEvent.click(sw));
    await waitFor(() => expect(sw.checked).toBe(true));
    const patches = () => api.calls.filter((c) => c.method === "PATCH").map((c) => c.body);
    expect(patches()).toEqual([{ preferences: [{ scope: "category", key: "comments", channel: "email", enabled: true }] }]);
    await act(async () => fireEvent.click(sw));
    await waitFor(() => expect(sw.checked).toBe(false));
    expect(patches()[1]).toEqual({ preferences: [{ scope: "category", key: "comments", channel: "email", enabled: null }] });
  });

  it("time zone and quiet hours go through the same per-field PATCH; a failure rolls back with a message", async () => {
    const { api, wrap } = setup();
    render(wrap(<NotifyPreferences channels={["inbox", "email"]} />));
    const tz = (await screen.findByRole("combobox", { name: "Time zone" })) as HTMLSelectElement;
    expect(tz.value).toBe("Europe/Lisbon");
    await act(async () => fireEvent.change(tz, { target: { value: "America/New_York" } }));
    await act(async () => fireEvent.click(screen.getByRole("switch", { name: "Quiet hours" })));
    await waitFor(() => expect((screen.getByLabelText("From") as HTMLInputElement).value).toBe("22:00"));
    const bodies = api.calls.filter((c) => c.method === "PATCH").map((c) => c.body);
    expect(bodies).toEqual([{ timezone: "America/New_York" }, { quiet_hours: { start: "22:00", end: "08:00" } }]);

    api.on("PATCH /v1/client/preferences", () => json({ code: "VALIDATION_FAILED", message: "no", status: 422 }, 422));
    const push = screen.getByRole("switch", { name: "Comments: In-app" }) as HTMLInputElement;
    await act(async () => fireEvent.click(push));
    await screen.findByRole("alert");
    expect(push.checked).toBe(true);
  });

  it("German strings", async () => {
    const { wrap } = setup();
    render(wrap(<NotifyPreferences />, { locale: "de" }));
    expect(await screen.findByRole("table", { name: "Benachrichtigungseinstellungen" })).toBeTruthy();
    expect(screen.getByRole("switch", { name: "Security: In der App" })).toBeTruthy();
  });
});
