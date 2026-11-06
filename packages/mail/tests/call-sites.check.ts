// Task 005 call-site acceptance, checked by `tsc` (the package's test script).
// The 0.x `.client` shape still compiles against the same paths.
import { Mail, NotFoundError, BadRequestError, APIError } from "../src/index.js";

declare const mail: Mail;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const assert = <T extends true>(_: T): void => undefined;

export async function acceptance(): Promise<void> {
  const sent = await mail.emails.send({ from: "SDK smoke <smoke@mail.example.com>", to: "success@simulator.amazonses.com", subject: "sdk-smoke", html: "<p>ok</p>" });
  void sent.id;
  await mail.templates.send("welcome", { to: "success@simulator.amazonses.com", data: { first_name: "Ada" } });
  for await (const m of mail.messages.list({ limit: 25, status: ["delivered"] })) console.log(m.id);
  // @ts-expect-error status is a literal union
  mail.messages.list({ status: ["nope"] });
  const { data, requestId } = await mail.domains.list().withResponse();
  void data;
  void requestId;
  assert<Equal<typeof requestId, string | undefined>>(true);
  const csv = await (await mail.messages.export({})).text();
  void csv;
  const raw: Response = await mail.received.raw("9b2f6c1e-0d6a-4a63-9a43-2f1c3e4d5a6b");
  void raw;
  await mail.messages.erase({ recipient: "success@simulator.amazonses.com" });
  // @ts-expect-error the per-recipient log is erased, not deleted
  void mail.messages.delete;
  const domain = await mail.domains.poll("9b2f6c1e-0d6a-4a63-9a43-2f1c3e4d5a6b", { intervalMs: 5_000 });
  void domain.status;
  const page = await mail.templates.list({ limit: 1 });
  void page.data;
  void sent.lastResponse.requestId;

  try {
    await mail.domains.retrieve("00000000-0000-0000-0000-000000000000");
  } catch (err) {
    if (err instanceof NotFoundError) console.log(err.requestId, err.docUrl);
    else if (err instanceof BadRequestError) err.errors.forEach((e) => console.log(e.param, e.message));
    else if (err instanceof APIError) console.log(err.status);
  }

  // Webhooks: array of secrets (default, per-domain, endpoint); the union narrows by `type`.
  const event = await mail.webhooks.unwrap({ payload: "{}", headers: new Headers(), secret: ["whsec_a", "whsec_b"] });
  if (event.type === "email.delivered") console.log(event.data);

  // The escape hatch keeps working, typed by the same paths.
  const brand = await mail.client.PUT("/v1/workspaces/{workspace_id}/brand", {
    params: { path: { workspace_id: "9b2f6c1e-0d6a-4a63-9a43-2f1c3e4d5a6b" } },
    body: { extras: { hero_title: "a" } },
  });
  void brand.data?.resolved;
}
