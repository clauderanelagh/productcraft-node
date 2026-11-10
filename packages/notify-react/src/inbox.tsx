import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactElement } from "react";
import { useInbox, useNotifyContext, type NotifyInboxItem } from "./provider.js";
import { renderMarkdown, safeUrl } from "./markdown.js";
import { fill, notifyStrings, relativeTime, type NotifyStrings } from "./strings.js";

export interface NotifyInboxProps {
  /** Only items sent with this `tenant` (a workspace, team or org in your app). */
  tenant?: string;
  /** Only items of this category. */
  category?: string;
  /** Runs for each new item while mounted (for a toast). */
  onNew?: (item: NotifyInboxItem) => void;
  /**
   * Opens an item's or a button's link. Default: a full page load (`location.assign`) after the press is
   * recorded; pass your router's `push` for client-side navigation. Only `https:` (or `http:` on localhost) URLs get here.
   */
  onNavigate?: (url: string, item: NotifyInboxItem) => void;
  /** Items per page. Default 20. */
  limit?: number;
  /** Extra class on the root element. */
  className?: string;
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';
/** Visually hidden, still read by screen readers (inline, so it holds without the stylesheet). */
const SR: CSSProperties = { position: "absolute", width: 1, height: 1, margin: -1, padding: 0, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: 0 };
const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

/**
 * A bell button with the unread count and a popover inbox: real-time list, mark read / unread / all,
 * archive, up to two action buttons per item, load more. Opening it marks the shown items seen.
 * Accessible: the count is in the button's label, the popover traps focus and closes on Escape, the
 * items are a list that announces their read state. Unstyled except for class hooks
 * (`pcn-*`); `import "@productcraft/notify-react/styles.css"` for the default theme.
 */
export function NotifyInbox(props: NotifyInboxProps): ReactElement {
  const { tenant, category, onNew, onNavigate, limit, className } = props;
  const { locale, strings: overrides } = useNotifyContext("<NotifyInbox>");
  const t = useMemo(() => notifyStrings(locale, overrides), [locale, overrides]);
  const [open, setOpen] = useState(false);
  const [announce, setAnnounce] = useState("");
  const inbox = useInbox({
    tenant,
    category,
    limit,
    onNew(item) {
      setAnnounce(fill(t.newItem, { title: item.title }));
      onNew?.(item);
    },
  });
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const bell = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => Date.now());
  const unread = inbox.counts.unread;

  const close = (focusBell: boolean): void => {
    setOpen(false);
    if (focusBell) bell.current?.focus();
  };

  // While open: tick relative times, close on an outside press, focus the panel.
  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    const tick = setInterval(() => setNow(Date.now()), 60_000);
    const outside = (e: PointerEvent): void => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    // Escape anywhere while open (focus may have dropped to the body, say after a button got disabled).
    const escape = (e: globalThis.KeyboardEvent): void => {
      if (e.key === "Escape" && !e.defaultPrevented) close(true);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    (panel.current?.querySelector<HTMLElement>(FOCUSABLE) ?? panel.current)?.focus();
    return () => {
      clearInterval(tick);
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  // While open, what is shown is seen.
  const unseen = inbox.items.filter((i) => !i.seen_at).map((i) => i.id);
  const unseenKey = unseen.join();
  useEffect(() => {
    if (open && unseen.length) void inbox.markSeen(unseen).catch(() => undefined);
  }, [open, unseenKey]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === "Escape") {
      e.preventDefault();
      return close(true);
    }
    if (e.key !== "Tab" || !panel.current) return;
    const f = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (!f.length) return e.preventDefault();
    const first = f[0]!;
    const last = f[f.length - 1]!;
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === panel.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const go = (e: MouseEvent, item: NotifyInboxItem, href: string | null, actionKey?: string): void => {
    const pressed = inbox.interact(item.id, actionKey).catch(() => undefined);
    if (!href) return;
    if (onNavigate) {
      e.preventDefault();
      onNavigate(href, item);
      return;
    }
    // A new-tab click keeps the browser's behaviour; otherwise record the press first (briefly), then leave.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
    e.preventDefault();
    void Promise.race([pressed, new Promise((r) => setTimeout(r, 800))]).then(() => window.location.assign(href));
  };

  return (
    <div ref={root} className={className ? `pcn-inbox ${className}` : "pcn-inbox"}>
      <button
        ref={bell}
        type="button"
        className="pcn-bell"
        aria-label={unread ? fill(t.bellUnread, { count: unread }) : t.bell}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <svg className="pcn-bell-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
          <path fill="currentColor" d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 0 0-5.5-6.84V3.5a1.5 1.5 0 0 0-3 0v.66A7 7 0 0 0 5 11v5l-2 2v1h18v-1l-2-2Z" />
        </svg>
        {unread > 0 && (
          <span className="pcn-badge" aria-hidden="true">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      <span className="pcn-sr" style={SR} aria-live="polite">
        {announce}
      </span>
      {open && (
        <div ref={panel} id={id} className="pcn-popover" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} tabIndex={-1} onKeyDown={onKeyDown}>
          <div className="pcn-header">
            <h2 id={`${id}-title`} className="pcn-title">
              {t.title}
            </h2>
            <button type="button" className="pcn-mark-all" disabled={unread === 0} onClick={() => {
                // The button turns disabled: keep focus in the dialog.
                panel.current?.focus();
                void inbox.markAllRead().catch(() => undefined);
              }}
            >
              {t.markAllRead}
            </button>
            <button type="button" className="pcn-close" aria-label={t.close} onClick={() => close(true)}>
              <span aria-hidden="true">×</span>
            </button>
          </div>
          <Body inbox={inbox} t={t} locale={locale} now={now} go={go} />
        </div>
      )}
    </div>
  );
}

function Body(props: { inbox: ReturnType<typeof useInbox>; t: NotifyStrings; locale: string; now: number; go: (e: MouseEvent, item: NotifyInboxItem, href: string | null, key?: string) => void }): ReactElement {
  const { inbox, t, locale, now, go } = props;
  if (inbox.status === "error" && !inbox.items.length)
    return (
      <div className="pcn-state pcn-error" role="alert">
        <p>{t.loadError}</p>
        <button type="button" className="pcn-retry" onClick={() => void inbox.refresh().catch(() => undefined)}>
          {t.retry}
        </button>
      </div>
    );
  if (inbox.status !== "ready" && !inbox.items.length)
    return (
      <p className="pcn-state pcn-loading" role="status">
        {t.loading}
      </p>
    );
  if (!inbox.items.length) return <p className="pcn-state pcn-empty">{t.empty}</p>;
  return (
    <>
      <ul className="pcn-list">
        {inbox.items.map((item) => (
          <Item key={item.id} item={item} inbox={inbox} t={t} locale={locale} now={now} go={go} />
        ))}
      </ul>
      {inbox.hasMore && (
        <button type="button" className="pcn-load-more" onClick={() => void inbox.loadMore().catch(() => undefined)}>
          {t.loadMore}
        </button>
      )}
    </>
  );
}

function Item(props: { item: NotifyInboxItem; inbox: ReturnType<typeof useInbox>; t: NotifyStrings; locale: string; now: number; go: (e: MouseEvent, item: NotifyInboxItem, href: string | null, key?: string) => void }): ReactElement {
  const { item, inbox, t, locale, now, go } = props;
  const read = Boolean(item.read_at);
  const href = safeUrl(item.action_url);
  const avatar = safeUrl(item.actor?.avatar_url ?? item.avatar_url);
  const name = item.actor?.name ?? null;
  const title = (
    <>
      {!read && <span className="pcn-sr" style={SR}>{t.unread}: </span>}
      {item.title}
    </>
  );
  return (
    <li className="pcn-item" data-read={read ? "true" : "false"}>
      {avatar ? (
        <img className="pcn-avatar" src={avatar} alt="" width={32} height={32} loading="lazy" referrerPolicy="no-referrer" />
      ) : name ? (
        <span className="pcn-avatar pcn-avatar-initials" aria-hidden="true">
          {initials(name)}
        </span>
      ) : null}
      <div className="pcn-content">
        {name && <span className="pcn-actor">{name}</span>}
        {href ? (
          <a className="pcn-item-title" href={href} onClick={(e) => go(e, item, href)}>
            {title}
          </a>
        ) : (
          <button type="button" className="pcn-item-title" onClick={(e) => go(e, item, null)}>
            {title}
          </button>
        )}
        {item.body && <div className="pcn-body">{renderMarkdown(item.body)}</div>}
        <time className="pcn-time" dateTime={item.created_at}>
          {relativeTime(item.created_at, locale, now, t)}
        </time>
        {item.actions.length > 0 && (
          <div className="pcn-actions">
            {item.actions.slice(0, 2).map((a, i) => (
              <button key={i} type="button" className={i === 0 ? "pcn-action pcn-action-primary" : "pcn-action"} onClick={(e) => go(e, item, safeUrl(a.url), a.action_key)}>
                {a.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="pcn-tools">
        <button type="button" className="pcn-toggle-read" aria-label={read ? t.markUnread : t.markRead} title={read ? t.markUnread : t.markRead} onClick={() => void (read ? inbox.markUnread([item.id]) : inbox.markRead([item.id])).catch(() => undefined)}>
          <span aria-hidden="true">{read ? "○" : "●"}</span>
        </button>
        <button type="button" className="pcn-archive" aria-label={t.archive} title={t.archive} onClick={() => void inbox.archive([item.id]).catch(() => undefined)}>
          <span aria-hidden="true">✕</span>
        </button>
      </div>
    </li>
  );
}
