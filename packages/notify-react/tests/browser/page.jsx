// The page under test: the built @productcraft/notify-react with its default theme, as an app would use it.
import { createRoot } from "react-dom/client";
import { NotifyInbox, NotifyPreferences, NotifyProvider } from "@productcraft/notify-react";

window.__toasts = [];
window.__navigated = [];
createRoot(document.getElementById("root")).render(
  <NotifyProvider baseUrl={location.origin} getToken={() => fetch("/token").then((r) => r.text())}>
    <header style={{ display: "flex", justifyContent: location.search === "?left" ? "flex-start" : "flex-end", padding: 16 }}>
      <NotifyInbox onNew={(i) => window.__toasts.push(i.title)} onNavigate={(url) => window.__navigated.push(url)} />
    </header>
    <main style={{ padding: 16, maxWidth: 720 }}>
      <NotifyPreferences channels={["inbox", "email", "webpush"]} />
    </main>
  </NotifyProvider>,
);
