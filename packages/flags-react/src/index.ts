/**
 * @productcraft/flags-react: React bindings for ProductCraft Flags. `FlagsProvider` holds a
 * FlagsClient (local evaluation; user attributes never leave the app), the hooks read it
 * synchronously and re-render when the config changes. SSR: pass `snapshot().toJSON()` from the
 * server as `bootstrap`.
 *
 * A key used in a browser or mobile app makes its whole config public: keep client flags in their
 * own config, with no internal rules.
 */
export { FlagsProvider, useFlag, useFlagDetails, useFlagsClient, useFlagsReady, type FlagDefault, type FlagsProviderProps } from "./provider.js";
