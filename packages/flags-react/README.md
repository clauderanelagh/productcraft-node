# @productcraft/flags-react

React bindings for [ProductCraft Flags](https://productcraft.co/docs/flags): a provider, hooks, and server-side rendering without a flash of default values. It wraps [`FlagsClient`](https://github.com/clauderanelagh/productcraft-node/tree/main/packages/flags#readme), which downloads one config per environment and evaluates flags **locally**: user attributes never leave the app.

```sh
npm install @productcraft/flags @productcraft/flags-react
```

Peers: `react` 18 or later, `@productcraft/flags`. Works in Vite, Next.js (App and Pages Router), Remix and React Native.

> **A key used in a browser or mobile app makes its whole config public.** Anyone can read every flag key, segment key and cleartext rule value of that config. Put client-side flags in their own config with no internal rules, and keep server configs' keys on the server.

## Usage

```tsx
import { FlagsProvider, useFlag, useFlagDetails } from "@productcraft/flags-react";

export function App({ user }: { user: { id: string; plan: string } }) {
  return (
    <FlagsProvider options={{ sdkKey: import.meta.env.VITE_FLAGS_SDK_KEY }} user={{ identifier: user.id, custom: { plan: user.plan } }}>
      <Checkout />
    </FlagsProvider>
  );
}

function Checkout() {
  const newCheckout = useFlag("new_checkout", false);             // boolean, from the default's type
  const limits = useFlag("limits", { max: 5 });                    // a json setting, parsed
  const banner = useFlagDetails("banner_text", "Welcome");         // value + reason, rule, revision
  return newCheckout ? <NewCheckout max={limits.max} banner={banner.value} /> : <OldCheckout />;
}
```

| Export | What it does |
|---|---|
| `<FlagsProvider>` | `options` (any `FlagsClientOptions`: polling, `cache`, overrides …) builds a `FlagsClient` on mount and closes it on unmount; or pass `client` for one you own. Optional `bootstrap` (a config JSON) and `user` (the default user for the hooks). |
| `useFlag(key, default, user?)` | The value, typed after the default. The default until a config is there, or on any failure; never throws. |
| `useFlagDetails(key, default, user?)` | The value plus `reason`, `ruleIndex`, `percentageIndex`, `errorCode` and `revision`. |
| `useFlagsClient()` | The provider's `FlagsClient` (`getAllValues`, `forceRefresh`, events). |
| `useFlagsReady()` | `false` until the client's start-up settled (first download, or `maxInitWaitSeconds`). Always `false` on the server. |

Hooks evaluate synchronously against the client's current config and re-render (through `useSyncExternalStore`) only when the config or the client's state changes. A hook's own `user` replaces the provider's `user` as a whole. In the browser, auto polling pauses while the tab is hidden.

## Server-side rendering (no flash, no hydration mismatch)

Evaluate on the server with a `FlagsClient` that holds the **same config** as the browser key (the client config), and pass its `snapshot().toJSON()` as `bootstrap`. The server render and the browser's first render (hydration) both evaluate that bootstrap, so they agree; the browser's own download starts after mount and re-renders if anything changed since.

### Next.js App Router

```tsx
// lib/flags.ts: one client per server process (the client config's key)
import { FlagsClient } from "@productcraft/flags";
export const serverFlags = new FlagsClient({ sdkKey: process.env.NEXT_PUBLIC_FLAGS_SDK_KEY! });

// app/layout.tsx (a server component)
import { FlagsProvider } from "@productcraft/flags-react";
import { serverFlags } from "@/lib/flags";
import { currentUser } from "@/lib/auth";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await serverFlags.waitForReady();
  const user = await currentUser();
  return (
    <html lang="en">
      <body>
        <FlagsProvider
          options={{ sdkKey: process.env.NEXT_PUBLIC_FLAGS_SDK_KEY! }}
          bootstrap={serverFlags.snapshot().toJSON()}
          user={{ identifier: user.id }}
        >
          {children}
        </FlagsProvider>
      </body>
    </html>
  );
}
```

`@productcraft/flags-react` is marked `"use client"`, so a server component can render `<FlagsProvider>` directly; pass `options` (plain data), not a `client`, across that boundary. Server components that only need a value call `serverFlags.snapshot().getValue(key, default, user)` themselves. On the server the provider never downloads.

### Next.js Pages Router

Return the bootstrap from `getServerSideProps` (or `getStaticProps` with `revalidate`), and wrap the page in `_app.tsx`:

```tsx
// pages/_app.tsx
import type { AppProps } from "next/app";
import { FlagsProvider } from "@productcraft/flags-react";

export default function MyApp({ Component, pageProps }: AppProps) {
  return (
    <FlagsProvider options={{ sdkKey: process.env.NEXT_PUBLIC_FLAGS_SDK_KEY! }} bootstrap={pageProps.flagsBootstrap} user={pageProps.flagsUser}>
      <Component {...pageProps} />
    </FlagsProvider>
  );
}

// in a page: getServerSideProps returns { props: { flagsBootstrap: serverFlags.snapshot().toJSON(), flagsUser: { identifier: user.id } } }
```

The bootstrap is the config JSON the browser would download anyway (plus any overrides the server client has, so do not set server-only overrides on that client).

## Testing

Pass a test client from `@productcraft/flags/testing`:

```tsx
import { render, screen, act } from "@testing-library/react";
import { createTestClient } from "@productcraft/flags/testing";
import { FlagsProvider } from "@productcraft/flags-react";

const flags = createTestClient({ values: { new_checkout: true } });
render(<FlagsProvider client={flags}><Checkout /></FlagsProvider>);
act(() => flags.set("new_checkout", false)); // re-renders
```

## React Native

The `react-native` export condition of `@productcraft/flags` gives Metro the same build as browsers (no `node:` modules). There is no page visibility there, so auto polling keeps its interval; call `useFlagsClient().forceRefresh()` from an `AppState` listener if you want a refresh on foreground. For a persistent cache pass `options.cache` over AsyncStorage (`get` and `set` may return promises).

## License

MIT
