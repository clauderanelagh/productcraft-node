"use client";
// The one client file the app writes: the token fetcher is a function, and functions cannot cross from
// a Server Component to a Client Component. Everything from @productcraft/notify-react is a client module.
import type { ReactNode } from "react";
import { NotifyProvider } from "@productcraft/notify-react";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <NotifyProvider baseUrl={process.env.NEXT_PUBLIC_NOTIFY_BASE_URL} getToken={() => fetch("/api/notify-token", { cache: "no-store" }).then((r) => r.text())}>
      {children}
    </NotifyProvider>
  );
}
