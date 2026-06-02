import type { Metadata } from "next";
import "./globals.css";

import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "Event Registration & Management System",
  description: "Public event creation, attendee registration, and host management."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}