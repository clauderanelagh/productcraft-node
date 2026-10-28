import { describe, it, expect } from "vitest";
import { Mail } from "../src/index.js";

/**
 * Brand `extras` and `social_links` are maps whose keys the customer
 * chooses, and mail-api stores and returns them verbatim
 * (monorepo tasks/mail-api/061). The SDK must not re-case them either:
 * a snake_case key goes out and comes back exactly as written.
 */
describe("Mail brand extras keep the customer's keys", () => {
  it("sends and reads back snake_case and camelCase extras keys verbatim", async () => {
    const extras = { hero_title: "a", heroTitle: "b" };
    const social_links = { my_blog: "https://acme.example/blog" };
    let sent: unknown;

    const fetchStub: typeof fetch = async (input) => {
      const req = input as Request;
      sent = await req.json();
      const tokens = { extras, social_links };
      return new Response(
        JSON.stringify({ resolved: tokens, raw: tokens }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };

    const mail = new Mail({
      baseUrl: "https://mail.example",
      auth: { type: "apiKey", key: "pcft_live_test" },
      fetch: fetchStub,
    });

    const { data, error } = await mail.client.PUT(
      "/v1/workspaces/{workspace_id}/brand",
      {
        params: { path: { workspace_id: "7b0c2a52-3f3e-4c1e-9d9a-0d6f4c1f2a11" } },
        body: { extras, social_links },
      },
    );

    expect(error).toBeUndefined();
    expect(sent).toEqual({ extras, social_links });
    expect(data?.resolved.extras).toEqual(extras);
    expect(data?.raw?.extras).toEqual(extras);
    expect(data?.resolved.social_links).toEqual(social_links);
  });
});
