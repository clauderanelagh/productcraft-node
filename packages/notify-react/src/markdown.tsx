import type { ReactNode } from "react";

/**
 * A URL safe to render as an `href` or `src` (S12): absolute `https:`, or `http:` on localhost.
 * Everything else (`javascript:`, `data:`, relative paths, junk) returns `null`.
 */
export function safeUrl(url: string | null | undefined): string | null {
  if (typeof url !== "string" || url.trim() === "") return null;
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  if (u.protocol === "https:") return u.href;
  if (u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "[::1]")) return u.href;
  return null;
}

const ESCAPABLE = "\\`*_{}[]()#+-.!|<>~";

/** Index of the next unescaped `marker` at or after `from`, or -1. */
function findClose(s: string, marker: string, from: number): number {
  for (let i = from; i < s.length; i++) {
    if (s[i] === "\\") {
      i++;
      continue;
    }
    if (s.startsWith(marker, i)) return i;
  }
  return -1;
}

/** The inline part of the subset: `\` escapes, `**strong**`, `*em*` / `_em_`, `~~del~~`, `` `code` `` and `[text](https://…)`. */
function inline(s: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  let text = "";
  let n = 0;
  const flush = (): void => {
    if (text) out.push(text);
    text = "";
  };
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (c === "\\" && i + 1 < s.length && ESCAPABLE.includes(s[i + 1]!)) {
      text += s[++i];
      continue;
    }
    const k = `${key}.${n++}`;
    if (c === "`") {
      const end = s.indexOf("`", i + 1);
      if (end > i + 1) {
        flush();
        out.push(<code key={k}>{s.slice(i + 1, end)}</code>);
        i = end;
        continue;
      }
    }
    const pair = s.startsWith("**", i) ? "**" : s.startsWith("__", i) ? "__" : s.startsWith("~~", i) ? "~~" : c === "*" || c === "_" ? c : null;
    if (pair) {
      const end = findClose(s, pair, i + pair.length);
      if (end > i + pair.length) {
        flush();
        const inner = inline(s.slice(i + pair.length, end), k);
        out.push(pair === "~~" ? <del key={k}>{inner}</del> : pair.length === 2 ? <strong key={k}>{inner}</strong> : <em key={k}>{inner}</em>);
        i = end + pair.length - 1;
        continue;
      }
    }
    if (c === "[") {
      const close = findClose(s, "]", i + 1);
      if (close > i && s[close + 1] === "(") {
        const paren = s.indexOf(")", close + 2);
        if (paren > close) {
          flush();
          const label = inline(s.slice(i + 1, close), k);
          const href = safeUrl(s.slice(close + 2, paren));
          // An unsafe or relative link keeps its text and loses the link.
          out.push(
            href ? (
              <a key={k} href={href} rel="noopener noreferrer nofollow" target="_blank">
                {label}
              </a>
            ) : (
              <span key={k}>{label}</span>
            ),
          );
          i = paren;
          continue;
        }
      }
    }
    text += c;
  }
  flush();
  return out;
}

const BULLET = /^ {0,3}[-*+][ \t]+(.*)$/;
const ORDERED = /^ {0,3}(\d{1,9})[.)][ \t]+(.*)$/;

/**
 * Renders the inbox body's Markdown subset as React elements, never as HTML: paragraphs (blank
 * line), line breaks, lists (`- item`, `* item`, `+ item` and `1. item`, one level), escapes, strong,
 * emphasis, strikethrough, inline code and https links. Raw HTML stays text, and so do headings and
 * images (their markers are shown as written). Notify escapes interpolated data (`\- item`), so
 * template data can never start a list.
 */
export function renderMarkdown(src: string): ReactNode {
  const out: ReactNode[] = [];
  src
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .filter((p) => p.trim() !== "")
    .forEach((block, b) => {
      // A block is runs of text lines (one paragraph, lines joined by <br>) and runs of list items.
      let text: string[] = [];
      let list: { ordered: boolean; start: number; items: string[] } | null = null;
      let n = 0;
      const flushText = (): void => {
        if (!text.length) return;
        const key = `${b}.${n++}`;
        out.push(
          <p key={key}>{text.flatMap((line, l) => (l === 0 ? inline(line, `${key}.${l}`) : [<br key={`br${l}`} />, ...inline(line, `${key}.${l}`)]))}</p>,
        );
        text = [];
      };
      const flushList = (): void => {
        if (!list) return;
        const key = `${b}.${n++}`;
        const items = list.items.map((item, i) => <li key={i}>{inline(item, `${key}.${i}`)}</li>);
        out.push(list.ordered ? <ol key={key} start={list.start === 1 ? undefined : list.start}>{items}</ol> : <ul key={key}>{items}</ul>);
        list = null;
      };
      for (const line of block.split("\n")) {
        const bullet = BULLET.exec(line);
        const ordered = bullet ? null : ORDERED.exec(line);
        if (bullet || ordered) {
          const isOrdered = Boolean(ordered);
          if (list && list.ordered !== isOrdered) flushList();
          flushText();
          if (!list) list = { ordered: isOrdered, start: ordered ? Number(ordered[1]) : 1, items: [] };
          list.items.push(bullet ? bullet[1]! : ordered![2]!);
        } else {
          flushList();
          text.push(line);
        }
      }
      flushText();
      flushList();
    });
  return out;
}
