# @productcraft/core

Shared transport + auth primitives for the ProductCraft Node.js SDKs.

You **don't install this directly**. It's a runtime dependency of every product SDK (`@productcraft/auth`, `@productcraft/mail`, `@productcraft/waitlist`, `@productcraft/social`, `@productcraft/platform-auth`) plus the `productcraft` umbrella. Installing one of those pulls `@productcraft/core` along automatically.

## What it provides

- `PCAuth` — discriminated union covering the three credential shapes the SDKs accept:
  ```ts
  | { type: "apiKey"; key: string }    // pcft_live_*
  | { type: "bearer"; token: string }  // pre-resolved JWT
  | { type: "cookie"; value: string }  // captured auth_token
  ```
- `PCClientConfig` — `{ auth?, baseUrl?, fetch? }`, the input shape every surface constructor takes. When `auth` is omitted, `resolveAuth` falls back to `PRODUCTCRAFT_API_KEY` from the environment (server-side only; never read without a `process` global).
- `PC_API_KEY_ENV` / `PC_AUTH_APP_ENV` / `readEnv` / `resolveAuth` — the env-fallback helpers. Hosts are never read from the environment.
- `PC_BASE_URL` — the per-surface prod base URLs, used as defaults.
- `makeClient<paths>(baseUrl, config)` — internal helper that wires an `openapi-fetch` client with the auth-header middleware.

## When you'd touch it directly

Only if you're writing a new ProductCraft SDK surface package. Authoring custom backend integrations against ProductCraft APIs is what the per-product packages are for — start with one of those.

## License

[MIT](https://github.com/clauderanelagh/productcraft-node/blob/main/LICENSE).
