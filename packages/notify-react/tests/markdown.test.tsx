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

describe("renderMarkdown lists", () => {
  it("renders bullet and numbered lists, with text around them", () => {
    expect(md("New comments:\n\n- first item\n- second **one**")).toBe("<p>New comments:</p><ul><li>first item</li><li>second <strong>one</strong></li></ul>");
    expect(md("Steps:\n1. Open\n2. Save\nDone.")).toBe("<p>Steps:</p><ol><li>Open</li><li>Save</li></ol><p>Done.</p>");
    expect(md("* a\n+ b")).toBe("<ul><li>a</li><li>b</li></ul>");
    expect(md("3. third\n4. fourth")).toBe('<ol start="3"><li>third</li><li>fourth</li></ol>');
    expect(md("- a\n1. b")).toBe("<ul><li>a</li></ul><ol><li>b</li></ol>");
  });

  it("escaped data and look-alikes stay text", () => {
    // notify-api escapes interpolated data: `- x` arrives as `\\- x`.
    expect(md("\\- not a list")).toBe("<p>- not a list</p>");
    expect(md("-not a list")).toBe("<p>-not a list</p>");
    expect(md("*emphasis* here")).toBe("<p><em>emphasis</em> here</p>");
    expect(md("2024. was a year")).toBe("<ol start=\"2024\"><li>was a year</li></ol>");
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
    expect(notifyStrings("pt-BR").preferencesLoadError).toBe("Não foi possível carregar suas configurações de notificação.");
  });
});
