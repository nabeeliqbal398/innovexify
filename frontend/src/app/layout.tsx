import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { ReactNode } from "react";

import { THEME_INIT_SCRIPT } from "@/components/features/workspace/theme-toggle";
import { AppProviders } from "@/providers/AppProviders";

import "@/styles/globals.css";

export const metadata: Metadata = {
  title: { default: "Innovexify CRM", template: "%s · Innovexify" },
  description: "Client, case and compliance workspace for formation services.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
