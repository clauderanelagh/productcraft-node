import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";

export interface Recorded {
  method: string;
  url: string;
  path: string;
  query: URLSearchParams;
  headers: IncomingHttpHeaders;
  body: string;
}

export interface Reply {
  status?: number;
  headers?: Record<string, string>;
  /** Object → JSON, string → as-is. */
  body?: unknown;
  delayMs?: number;
  /** Destroy the socket without a response (connection error). */
  destroy?: boolean;
}

export type Handler = (req: Recorded, index: number) => Reply | Promise<Reply>;

export interface MockServer {
  url: string;
  requests: Recorded[];
  /** Replies are taken in order; the last one repeats. */
  reply(...replies: (Reply | Handler)[]): void;
  close(): Promise<void>;
}

export async function startMockServer(): Promise<MockServer> {
  const requests: Recorded[] = [];
  let replies: (Reply | Handler)[] = [{ status: 200, body: {} }];
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", async () => {
      const u = new URL(req.url ?? "/", "http://localhost");
      const rec: Recorded = {
        method: req.method ?? "GET",
        url: req.url ?? "/",
        path: u.pathname,
        query: u.searchParams,
        headers: req.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      };
      const index = requests.length;
      requests.push(rec);
      const entry = replies[Math.min(index, replies.length - 1)] as Reply | Handler;
      const r = typeof entry === "function" ? await entry(rec, index) : entry;
      if (r.delayMs) await new Promise((ok) => setTimeout(ok, r.delayMs));
      if (r.destroy) {
        req.socket.destroy();
        return;
      }
      const headers: Record<string, string> = { ...r.headers };
      let payload = "";
      if (r.body !== undefined) {
        if (typeof r.body === "string") payload = r.body;
        else {
          payload = JSON.stringify(r.body);
          headers["content-type"] ??= "application/json; charset=utf-8";
        }
      }
      if (res.destroyed) return;
      res.writeHead(r.status ?? 200, headers);
      res.end(payload);
    });
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    reply(...next) {
      replies = next;
      requests.length = 0;
    },
    close: () =>
      new Promise<void>((ok) => {
        server.closeAllConnections();
        server.close(() => ok());
      }),
  };
}
