/**
 * Custom HTTP client passed to kubb-generated request functions.
 *
 * Each generated client function accepts an optional `{ client }`
 * override matching kubb's `Client` shape:
 *   <TData, TError, TVars>(config: RequestConfig<TVars>) => Promise<ResponseConfig<TData>>
 *
 * We construct one per `Auth` instance — bound to that instance's
 * baseUrl + auth credential — so generated functions don't need to
 * know anything about authentication or environment selection.
 */

import type { PCAuth } from "@productcraft/core";
import type {
  Client,
  RequestConfig,
  ResponseConfig,
} from "@kubb/plugin-client/clients/fetch";

export interface AuthHttpClientOptions {
  baseUrl: string;
  auth?: PCAuth;
  fetch?: typeof fetch;
}

/** Thrown for any non-2xx response; `response.data` is the parsed body. */
export class AuthHttpError<TData = unknown> extends Error {
  public readonly status: number;
  public readonly statusText: string;
  public readonly data: TData;

  constructor(response: ResponseConfig<TData>) {
    super(
      `Auth request failed: ${response.status} ${response.statusText}`,
    );
    this.name = "AuthHttpError";
    this.status = response.status;
    this.statusText = response.statusText;
    this.data = response.data;
  }
}

function applyAuthHeader(headers: Headers, auth: PCAuth | undefined): void {
  if (!auth) return;
  switch (auth.type) {
    case "apiKey":
      headers.set("Authorization", `Bearer ${auth.key}`);
      break;
    case "bearer":
      headers.set("Authorization", `Bearer ${auth.token}`);
      break;
    case "cookie":
      headers.set("Cookie", `auth_token=${auth.value}`);
      break;
  }
}

function buildUrl(baseUrl: string, path: string, params: unknown): URL {
  const url = new URL(path, baseUrl);
  if (params && typeof params === "object") {
    for (const [k, v] of Object.entries(params as Record<string, unknown>)) {
      if (v === undefined || v === null) continue;
      if (Array.isArray(v)) {
        for (const item of v) url.searchParams.append(k, String(item));
      } else {
        url.searchParams.set(k, String(v));
      }
    }
  }
  return url;
}

export function makeAuthHttpClient(
  options: AuthHttpClientOptions,
): Client {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (!fetchImpl) {
    throw new Error(
      "@productcraft/auth: no `fetch` available — pass `fetch` in the config or run on Node 18+",
    );
  }

  // Generic shape mirrors kubb's `Client` type — 3 generics including a
  //  _TError slot we don't use here; underscored to mark intentional.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return async function client<TData, _TError = unknown, TVars = unknown>(
    req: RequestConfig<TVars>,
  ): Promise<ResponseConfig<TData>> {
    const url = buildUrl(req.baseURL ?? options.baseUrl, req.url ?? "", req.params);
    const headers = new Headers(req.headers as Record<string, string> | undefined);
    applyAuthHeader(headers, options.auth);

    const hasBody = req.data !== undefined && req.method !== "GET" && req.method !== "HEAD";
    const isFormData = typeof FormData !== "undefined" && req.data instanceof FormData;
    if (hasBody && !isFormData && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const body = hasBody
      ? isFormData
        ? (req.data as FormData)
        : JSON.stringify(req.data)
      : undefined;

    const res = await fetchImpl(url, {
      method: req.method,
      headers,
      body,
      credentials: req.credentials,
      signal: req.signal,
    });

    // Parse body honoring responseType (defaults to JSON when content-type is JSON-ish)
    let data: unknown = undefined;
    const ctype = res.headers.get("content-type") ?? "";
    if (req.responseType === "text") {
      data = await res.text();
    } else if (req.responseType === "blob") {
      data = await res.blob();
    } else if (req.responseType === "arraybuffer") {
      data = await res.arrayBuffer();
    } else if (ctype.includes("application/json") || ctype.includes("application/problem+json")) {
      data = await res.json().catch(() => undefined);
    } else if (res.status !== 204) {
      const text = await res.text().catch(() => "");
      data = text || undefined;
    }

    const response: ResponseConfig<TData> = {
      data: data as TData,
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
    };

    if (!res.ok) throw new AuthHttpError(response);
    return response;
  };
}
