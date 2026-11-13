// The page under test: the built @productcraft/notify-react with its default theme, as an app would use it.
// Query: `left` puts the bell on the left; `html=<class>` / `data-theme=<value>` mark the app's theme on
// <html> (as Tailwind / next-themes do); `theme=<light|dark|auto>` passes the provider's theme prop.
import { createRoot } from "react-dom/client";
import { NotifyInbox, NotifyPreferences, NotifyProvider } from "@productcraft/notify-react";

const q = new URLSearchParams(location.search);
if (q.get("html")) document.documentElement.className = q.get("html");
if (q.get("data-theme")) document.documentElement.dataset.theme = q.get("data-theme");
window.__toasts = [];
window.__navigated = [];
createRoot(document.getElementById("root")).render(
  <NotifyProvider baseUrl={location.origin} getToken={() => fetch("/token").then((r) => r.text())} theme={q.get("theme") ?? undefined}>
    <header style={{ display: "flex", justifyContent: q.has("left") ? "flex-start" : "flex-end", padding: 16 }}>
      <NotifyInbox onNew={(i) => window.__toasts.push(i.title)} onNavigate={(url) => window.__navigated.push(url)} />
    </header>
    <main style={{ padding: 16, maxWidth: 720 }}>
      <NotifyPreferences channels={["inbox", "email", "webpush"]} />
    </main>
  </NotifyProvider>,
);
