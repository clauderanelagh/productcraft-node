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

/**
 * Renders the inbox body's Markdown subset as React elements, never as HTML: paragraphs (blank
 * line), line breaks, escapes, strong, emphasis, strikethrough, inline code and https links. Raw
 * HTML stays text, and so do headings, lists and images (their markers are shown as written).
 */
export function renderMarkdown(src: string): ReactNode {
  return src
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .filter((p) => p.trim() !== "")
    .map((para, p) => (
      <p key={p}>
        {para.split("\n").flatMap((line, l) => (l === 0 ? inline(line, `${p}.${l}`) : [<br key={`br${l}`} />, ...inline(line, `${p}.${l}`)]))}
      </p>
    ));
}
