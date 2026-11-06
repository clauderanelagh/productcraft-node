/**
 * Cursor pagination over the uniform `{ data, pagination: { next_cursor, has_more } }` shape.
 */

import { APIPromise, type RawResult, type LastResponse } from "./api-promise.js";
import { ProductCraftError } from "./errors.js";

/** The wire shape of every paginated list response. */
export interface PageResponse<Item> {
  data: Item[];
  pagination?: { next_cursor?: string | null; has_more?: boolean };
}

/** One page of a list. `await`ing a list call gives you this. */
export class Page<Item> {
  readonly data: Item[];
  readonly has_more: boolean;
  readonly next_cursor: string | null;
  declare readonly lastResponse: LastResponse;
  #fetchPage: (cursor: string) => PagePromise<Item>;

  constructor(body: PageResponse<Item>, fetchPage: (cursor: string) => PagePromise<Item>) {
    this.data = Array.isArray(body?.data) ? body.data : [];
    this.next_cursor = body?.pagination?.next_cursor ?? null;
    this.has_more = Boolean(body?.pagination?.has_more) && this.next_cursor !== null;
    this.#fetchPage = fetchPage;
  }

  hasNextPage(): boolean {
    return this.has_more;
  }

  /** Fetch the following page. Throws when there is none (check `hasNextPage()` first). */
  getNextPage(): PagePromise<Item> {
    if (!this.has_more || this.next_cursor === null) {
      throw new ProductCraftError("No next page; check hasNextPage() before calling getNextPage().");
    }
    return this.#fetchPage(this.next_cursor);
  }

  /** The wire shape, so `JSON.stringify(page)` matches the API response. */
  toJSON(): PageResponse<Item> {
    return { data: this.data, pagination: { next_cursor: this.next_cursor, has_more: this.has_more } };
  }
}

export interface ToArrayOptions {
  /** Required cap on how many items to collect across pages. `limit` stays the page size. */
  maxItems: number;
}

/**
 * Returned by paginated list methods. `await` it for the first `Page`;
 * `for await` over it for every item across pages; `.pages()` for pages.
 */
export class PagePromise<Item> extends APIPromise<Page<Item>> implements AsyncIterable<Item> {
  constructor(raw: Promise<RawResult>, parse: (raw: RawResult) => Promise<Page<Item>>) {
    super(raw, parse);
  }

  /** Iterate pages, starting with this one. */
  async *pages(): AsyncGenerator<Page<Item>, void, undefined> {
    let page: Page<Item> = await this;
    for (;;) {
      yield page;
      if (!page.hasNextPage()) return;
      page = await page.getNextPage();
    }
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<Item, void, undefined> {
    for await (const page of this.pages()) {
      for (const item of page.data) yield item;
    }
  }

  /** Collect items across pages, stopping at `maxItems`. */
  async toArray(options: ToArrayOptions): Promise<Item[]> {
    const max = options?.maxItems;
    if (typeof max !== "number" || !(max >= 0)) {
      throw new ProductCraftError("toArray() needs { maxItems }, a non-negative number.");
    }
    const out: Item[] = [];
    if (max === 0) return out;
    for await (const item of this) {
      out.push(item);
      if (out.length >= max) break;
    }
    return out;
  }
}
