import { useId, useMemo, useState, type ReactElement } from "react";
import { resolvePreference, type PreferenceChannel } from "@productcraft/notify-js";
import { useNotifyContext, usePreferences, type NotifyPreferencesData } from "./provider.js";
import { fill, notifyStrings, type NotifyStrings } from "./strings.js";

export interface NotifyPreferencesProps {
  /** The channel columns, in order. Default all four: `inbox`, `email`, `push`, `webpush`. Leave out what your product does not use. */
  channels?: readonly PreferenceChannel[];
  /** Show the time zone and quiet-hours controls. Default `true`. */
  quietHours?: boolean;
  /** Show the "turn off all optional notifications" switch. Default `true`. */
  unsubscribeAll?: boolean;
  /** Extra class on the root element. */
  className?: string;
}

const ALL: readonly PreferenceChannel[] = ["inbox", "email", "push", "webpush"];
const LABEL: Record<PreferenceChannel, keyof NotifyStrings> = { inbox: "channelInbox", email: "channelEmail", push: "channelPush", webpush: "channelWebpush" };
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const zones = (current: string | null): string[] => {
  let list: string[] = [];
  try {
    list = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  } catch {
    /* older engines: only the current value and the device zone */
  }
  const device = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return [...new Set([...(current ? [current] : []), ...(device ? [device] : []), ...list])].sort();
};

/**
 * A preference centre: a table with one switch per category × channel (required ones locked, with
 * the reason), "turn off all optional notifications", the time zone (IANA) and a quiet-hours window.
 * Every switch saves just that cell, at once (rolled back with a message if the save fails).
 */
export function NotifyPreferences(props: NotifyPreferencesProps): ReactElement {
  const { channels = ALL, quietHours = true, unsubscribeAll = true, className } = props;
  const { locale, strings: overrides } = useNotifyContext("<NotifyPreferences>");
  const t = useMemo(() => notifyStrings(locale, overrides), [locale, overrides]);
  const prefs = usePreferences();
  const [failed, setFailed] = useState(false);
  const id = useId();
  const cls = className ? `pcn-prefs ${className}` : "pcn-prefs";
  const save = (p: Promise<unknown>): void => {
    setFailed(false);
    void p.catch(() => setFailed(true));
  };

  const data = prefs.data;
  if (!data) {
    return (
      <div className={cls}>
        {prefs.status === "error" ? (
          <div className="pcn-state pcn-error" role="alert">
            <p>{t.preferencesLoadError}</p>
            <button type="button" className="pcn-retry" onClick={() => void prefs.refresh().catch(() => undefined)}>
              {t.retry}
            </button>
          </div>
        ) : (
          <p className="pcn-state pcn-loading" role="status">
            {t.loading}
          </p>
        )}
      </div>
    );
  }

  const toggle = (category: string, channel: PreferenceChannel, enabled: boolean): void => {
    // Back to "follow the defaults" when the new value equals what applies without this cell.
    const without: NotifyPreferencesData = { ...data, preferences: data.preferences.filter((c) => !(c.scope === "category" && c.key === category && c.channel === channel)) };
    const fallback = resolvePreference(without, category, channel).enabled;
    save(prefs.update([{ scope: "category", key: category, channel, enabled: enabled === fallback ? null : enabled }]));
  };

  const hasMandatory = data.categories.some((c) => channels.some((ch) => resolvePreference(data, c.key, ch).mandatory));
  const qh = data.quiet_hours;
  const setQuiet = (next: { start: string; end: string } | null): void => {
    const extra: { quiet_hours: typeof next; timezone?: string } = { quiet_hours: next };
    // Quiet hours need a time zone: take the device's when none is set.
    if (next && !data.timezone) extra.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    save(prefs.update([], extra));
  };

  return (
    <div className={cls}>
      {data.categories.length === 0 ? (
        <p className="pcn-state pcn-empty">{t.noCategories}</p>
      ) : (
        <table className="pcn-matrix">
          <caption className="pcn-caption">{t.preferencesTitle}</caption>
          <thead>
            <tr>
              <th scope="col">{t.category}</th>
              {channels.map((ch) => (
                <th key={ch} scope="col">
                  {t[LABEL[ch]]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.categories.map((c) => (
              <tr key={c.key} className="pcn-row">
                <th scope="row" className="pcn-category">
                  <span className="pcn-category-name">{c.name}</span>
                  {c.description && <span className="pcn-category-description">{c.description}</span>}
                </th>
                {channels.map((ch) => {
                  const cell = resolvePreference(data, c.key, ch);
                  const off = data.unsubscribed_all && !cell.mandatory;
                  return (
                    <td key={ch} className="pcn-cell" data-mandatory={cell.mandatory ? "true" : undefined}>
                      <input
                        type="checkbox"
                        role="switch"
                        className="pcn-switch"
                        checked={cell.enabled && !off}
                        disabled={cell.mandatory || off}
                        aria-label={fill(t.cellLabel, { category: c.name, channel: t[LABEL[ch]] })}
                        aria-describedby={cell.mandatory ? `${id}-required` : undefined}
                        onChange={(e) => toggle(c.key, ch, e.currentTarget.checked)}
                      />
                      {cell.mandatory && (
                        <span className="pcn-locked" title={t.requiredHint}>
                          {t.required}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {hasMandatory && (
        <p id={`${id}-required`} className="pcn-hint">
          {t.requiredHint}
        </p>
      )}
      {unsubscribeAll && (
        <label className="pcn-field pcn-unsubscribe-all">
          <input type="checkbox" role="switch" className="pcn-switch" checked={data.unsubscribed_all} aria-describedby={`${id}-unsub`} onChange={(e) => save(prefs.update([], { unsubscribed_all: e.currentTarget.checked }))} />
          <span>{t.unsubscribeAll}</span>
          <span id={`${id}-unsub`} className="pcn-hint">
            {t.unsubscribeAllHint}
          </span>
        </label>
      )}
      {quietHours && (
        <fieldset className="pcn-quiet">
          <legend>{t.quietHours}</legend>
          <label className="pcn-field">
            <span>{t.timezone}</span>
            <select className="pcn-timezone" value={data.timezone ?? ""} onChange={(e) => save(prefs.update([], { timezone: e.currentTarget.value || null }))}>
              <option value="">{t.timezoneNone}</option>
              {zones(data.timezone).map((z) => (
                <option key={z} value={z}>
                  {z.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </label>
          <label className="pcn-field">
            <input type="checkbox" role="switch" className="pcn-switch pcn-quiet-toggle" checked={!!qh} aria-describedby={`${id}-quiet`} onChange={(e) => setQuiet(e.currentTarget.checked ? { start: "22:00", end: "08:00" } : null)} />
            <span>{t.quietHours}</span>
          </label>
          <span id={`${id}-quiet`} className="pcn-hint">
            {t.quietHoursHint}
          </span>
          {qh && (
            <div className="pcn-quiet-window">
              <label className="pcn-field">
                <span>{t.quietFrom}</span>
                <input type="time" className="pcn-quiet-start" value={qh.start} onChange={(e) => HHMM.test(e.currentTarget.value) && setQuiet({ start: e.currentTarget.value, end: qh.end })} />
              </label>
              <label className="pcn-field">
                <span>{t.quietTo}</span>
                <input type="time" className="pcn-quiet-end" value={qh.end} onChange={(e) => HHMM.test(e.currentTarget.value) && setQuiet({ start: qh.start, end: e.currentTarget.value })} />
              </label>
            </div>
          )}
        </fieldset>
      )}
      {failed && (
        <p className="pcn-save-error" role="alert">
          {t.saveError}
        </p>
      )}
    </div>
  );
}
