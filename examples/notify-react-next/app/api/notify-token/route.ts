// Mints a recipient token for the signed-in user. Here the "signed-in user" is NOTIFY_DEMO_RECIPIENT;
// a real app takes it from its session. The workspace credential stays on the server.
import { Notify } from "@productcraft/notify";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const notify = new Notify({
    ...(process.env.NOTIFY_DEMO_BEARER ? { auth: { type: "bearer" as const, token: process.env.NOTIFY_DEMO_BEARER } } : {}),
    ...(process.env.NOTIFY_BASE_URL ? { baseUrl: process.env.NOTIFY_BASE_URL } : {}),
  });
  const recipient = process.env.NOTIFY_DEMO_RECIPIENT;
  if (!recipient) return new Response("no recipient", { status: 500 });
  const { token } = await notify.recipientTokens.mint({ recipient, ttl_seconds: 300 });
  return new Response(token, { headers: { "cache-control": "no-store", "content-type": "text/plain" } });
}
