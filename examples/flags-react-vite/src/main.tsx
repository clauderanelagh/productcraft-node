// A browser app that reads flags with @productcraft/flags-react. The SDK key comes from VITE_FLAGS_SDK_KEY
// (a client config's key: it ships in the bundle, so that config is public by design).
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { FlagsProvider, useFlag, useFlagDetails, useFlagsReady } from "@productcraft/flags-react";

const cache = {
  get: (key: string) => localStorage.getItem(key),
  set: (key: string, value: string) => localStorage.setItem(key, value),
};

function Banner() {
  const ready = useFlagsReady();
  const on = useFlag("show_banner", false);
  const text = useFlagDetails("banner_text", "Welcome");
  return (
    <main>
      <p data-testid="ready">{String(ready)}</p>
      <p data-testid="show_banner">{String(on)}</p>
      <p data-testid="banner_text">
        {text.value} ({text.reason}, revision {text.revision})
      </p>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <FlagsProvider options={{ sdkKey: import.meta.env.VITE_FLAGS_SDK_KEY, cache }} user={{ identifier: "example-user" }}>
      <Banner />
    </FlagsProvider>
  </StrictMode>,
);
