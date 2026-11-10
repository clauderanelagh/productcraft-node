import type { ReactNode } from "react";
import "@productcraft/notify-react/styles.css";

export const metadata = { title: "Notify + Next.js App Router" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0 }}>{children}</body>
    </html>
  );
}
