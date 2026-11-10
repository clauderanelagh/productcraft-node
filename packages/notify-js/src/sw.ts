/**
 * The Notify service worker, as source text (`@productcraft/notify-js/sw`). The same code ships as the file
 * `@productcraft/notify-js/notify-sw.js`: copy it to your site root, or append this string to your own worker.
 *
 * - `push`: shows the notification (`title`, `body`, `icon`, `tag`, `url`; up to 2 `actions` when the payload has them).
 * - `notificationclick`: tells one open page to record the press (`interact`, when the payload names an inbox
 *   `item_id`), then focuses a tab already on `url` or opens it (same-origin or https only).
 * - `pushsubscriptionchange`: subscribes again with the same key and asks the open pages to register the new
 *   subscription (the page holds the recipient token; the worker never does).
 */
export const NOTIFY_SW_SOURCE = `/* @productcraft/notify-js service worker */
(function () {
  var NS = "productcraft-notify:";
  function safeUrl(u) {
    if (typeof u !== "string" || !u) return null;
    try {
      var x = new URL(u, self.location.origin);
      return x.origin === self.location.origin || x.protocol === "https:" ? x.href : null;
    } catch (e) {
      return null;
    }
  }
  function windows() {
    return self.clients.matchAll({ type: "window", includeUncontrolled: true });
  }
  self.addEventListener("push", function (event) {
    var p = {};
    try {
      p = event.data ? event.data.json() : {};
    } catch (e) {
      p = { title: event.data ? event.data.text() : "" };
    }
    var opts = { body: p.body || "", data: p };
    if (p.icon) opts.icon = p.icon;
    if (p.tag) opts.tag = p.tag;
    if (Array.isArray(p.actions)) {
      opts.actions = p.actions.slice(0, 2).filter(function (a) { return a && a.action_key && a.label; }).map(function (a) {
        return { action: a.action_key, title: a.label };
      });
    }
    event.waitUntil(self.registration.showNotification(p.title || "", opts));
  });
  self.addEventListener("notificationclick", function (event) {
    event.notification.close();
    var p = event.notification.data || {};
    var action = event.action || null;
    var target = null;
    if (action && Array.isArray(p.actions)) {
      p.actions.forEach(function (a) { if (a && a.action_key === action && a.url) target = a.url; });
    }
    var url = safeUrl(target || p.url);
    event.waitUntil(windows().then(function (list) {
      if (p.item_id && list[0]) list[0].postMessage({ type: NS + "action", item_id: p.item_id, action_key: action, notification_id: p.notification_id });
      if (url) {
        for (var i = 0; i < list.length; i++) if (list[i].url === url && "focus" in list[i]) return list[i].focus();
        return self.clients.openWindow ? self.clients.openWindow(url) : undefined;
      }
      if (list[0] && "focus" in list[0]) return list[0].focus();
    }));
  });
  self.addEventListener("pushsubscriptionchange", function (event) {
    var old = event.oldSubscription;
    var next = event.newSubscription
      ? Promise.resolve(event.newSubscription)
      : old && old.options && old.options.applicationServerKey
        ? self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: old.options.applicationServerKey })
        : Promise.resolve(null);
    event.waitUntil(next.then(function (sub) {
      if (!sub) return;
      var json = sub.toJSON();
      return windows().then(function (list) {
        list.forEach(function (c) { c.postMessage({ type: NS + "subscriptionchange", subscription: json }); });
      });
    }));
  });
})();
`;
