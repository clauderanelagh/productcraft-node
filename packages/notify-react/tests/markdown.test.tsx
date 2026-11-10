// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NOTIFY_LOCALES, notifyStrings, renderMarkdown, safeUrl } from "../src/index.js";

const md = (s: string): string => renderToStaticMarkup(<>{renderMarkdown(s)}</>);

describe("safeUrl (S12)", () => {
  it("keeps https and localhost http, drops everything else", () => {
    expect(safeUrl("https://example.com/a?b=1")).toBe("https://example.com/a?b=1");
    expect(safeUrl("http://localhost:3000/x")).toBe("http://localhost:3000/x");
    expect(safeUrl("http://127.0.0.1/x")).toBe("http://127.0.0.1/x");
    for (const bad of ["javascript:alert(1)", " JaVaScRiPt:alert(1)", "data:text/html,<script>", "http://example.com", "/relative", "//evil.test/x", "vbscript:x", "", null, undefined, "https//x"]) expect(safeUrl(bad)).toBeNull();
  });
});

describe("renderMarkdown", () => {
  it("renders the subset and never raw HTML", () => {
    expect(md("Hi **Ada**, see *this* and `code` ~~old~~")).toBe("<p>Hi <strong>Ada</strong>, see <em>this</em> and <code>code</code> <del>old</del></p>");
    expect(md("<img src=x onerror=alert(1)>")).toBe("<p>&lt;img src=x onerror=alert(1)&gt;</p>");
    expect(md("line one\nline two\n\nnext")).toBe("<p>line one<br/>line two</p><p>next</p>");
  });

  it("links only to safe URLs; escaped data stays literal", () => {
    expect(md("[doc](https://example.com)")).toBe('<p><a href="https://example.com/" rel="noopener noreferrer nofollow" target="_blank">doc</a></p>');
    expect(md("[x](javascript:alert(1))")).not.toMatch(/href|javascript:alert\(1\)<\/a/);
    // notify-api escapes interpolated data (`\[click\]\(…\)`), so it can never become a link.
    expect(md("\\[click\\]\\(https://evil.test\\)")).toBe("<p>[click](https://evil.test)</p>");
    expect(md("2 \\* 3 \\_x\\_")).toBe("<p>2 * 3 _x_</p>");
  });
});

describe("strings", () => {
  it("every locale has every key; fallbacks by language and to English", () => {
    const keys = Object.keys(notifyStrings("en")).sort();
    for (const l of NOTIFY_LOCALES) expect(Object.keys(notifyStrings(l)).sort()).toEqual(keys);
    expect(notifyStrings("pt").bell).toBe("Notificações");
    expect(notifyStrings("fr-CA").close).toBe("Fermer");
    expect(notifyStrings("pt-br").empty).toBe("Você está em dia.");
    expect(notifyStrings("xx").bell).toBe("Notifications");
  });
});
