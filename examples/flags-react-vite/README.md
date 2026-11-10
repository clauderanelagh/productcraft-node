# Flags in a Vite + React app

```sh
npm install
VITE_FLAGS_SDK_KEY=pcf_sdk_… npm run dev
```

`src/main.tsx` wraps the app in `<FlagsProvider>` and reads `show_banner` and `banner_text` with `useFlag` / `useFlagDetails`. Vite picks the `browser` build of `@productcraft/flags` (no Node modules, the browser HTTP cache revalidates the config, polling pauses in a hidden tab).

The key ends up in the bundle: use a **client config** (its flags are public by design), never a server config's key.

`run-live.mjs` is the maintainers' live check: it creates a throwaway `sdk-smoke-<ts>` project in the testing-environment workspace, builds this app with that project's key, reads the flags in headless Chromium, flips one, and deletes the project. `LOCAL=1` links the workspace builds instead of the npm packages.
