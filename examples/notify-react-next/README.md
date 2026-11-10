# Notify in a Next.js App Router app

```sh
npm install
PRODUCTCRAFT_API_KEY=pcft_… PRODUCTCRAFT_WORKSPACE_ID=<workspace> NOTIFY_DEMO_RECIPIENT=user_123 npm run dev
```

- `app/api/notify-token/route.ts` mints a short-lived recipient token on the server (your API key never reaches the browser). A real app takes the recipient from its session instead of `NOTIFY_DEMO_RECIPIENT`.
- `app/providers.tsx` is the one client file: `<NotifyProvider getToken>` (a function cannot cross from a Server Component to a Client Component).
- `app/page.tsx` is a Server Component that renders `<NotifyInbox/>` and `<NotifyPreferences/>` straight from `@productcraft/notify-react`, which works because the package is a client module (`"use client"`).
- `app/layout.tsx` loads the optional default theme, `@productcraft/notify-react/styles.css`.

While the workspace lists no client origins, `http://localhost:*` may call the client API (development only). Add your site's origin in the console before you ship.

`run.mjs` is the maintainers' check: `--local --build-only` is the CI fixture (`next build` with the workspace packages); without `--build-only` it runs the app against the testing-environment workspace with a throwaway notification type and recipient, in headless Chromium, and deletes them afterwards.
