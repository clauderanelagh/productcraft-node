// A Server Component (no "use client" here) that renders the package's components directly: this only
// builds because @productcraft/notify-react's entry carries "use client".
import { NotifyInbox, NotifyPreferences } from "@productcraft/notify-react";
import { Providers } from "./providers";

export default function Page() {
  return (
    <Providers>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 24px", borderBottom: "1px solid #e4e4e7" }}>
        <strong>Acme</strong>
        <NotifyInbox />
      </header>
      <main style={{ padding: 24, maxWidth: 760 }}>
        <NotifyPreferences channels={["inbox", "email", "webpush"]} />
      </main>
    </Providers>
  );
}
