// The page under test: vanilla JS over the built package, as an app would use it.
import { createNotifyClient } from "@productcraft/notify-js";

const notify = createNotifyClient({
  baseUrl: location.origin,
  getToken: () => fetch("/token").then((r) => r.text()),
});
const list = document.getElementById("list");
const badge = document.getElementById("badge");
const rt = document.getElementById("realtime");
const toasts = [];
notify.inbox.onNew((item) => toasts.push(item.title));
notify.inbox.subscribe(({ items, counts, status, realtime }) => {
  badge.textContent = String(counts.unread);
  rt.textContent = realtime;
  list.dataset.status = status;
  list.replaceChildren(
    ...items.map((i) => {
      const li = document.createElement("li");
      li.textContent = i.title;
      li.dataset.read = i.read_at ? "1" : "0";
      return li;
    }),
  );
});
window.__notify = notify;
window.__toasts = toasts;
