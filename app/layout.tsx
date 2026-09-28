import type { Metadata, Viewport } from "next";
import { Space_Grotesk, IBM_Plex_Mono } from "next/font/google";
import Script from "next/script";
import { ReactNode } from "react";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { AppShell } from "@/components/shell/app-shell";
import { ServiceWorkerRegister } from "@/components/sw-register";
import { InstallPrompt } from "@/components/install-prompt";
import { getCurrentUser } from "@/lib/supabase/user";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { membershipFor } from "@/lib/admin/auth";
import { AnalyticsTracker } from "@/components/analytics-tracker";
import { isUiV2Enabled } from "@/lib/ui-v2";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: { default: "HelpDesk First", template: "%s · HelpDesk First" },
  description:
    "Level-1 IT support self-service portal with safe guided troubleshooting.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F6F8FB" },
    { media: "(prefers-color-scheme: dark)", color: "#0B1220" },
  ],
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabaseConfigured = isSupabaseConfigured();
  const user = supabaseConfigured ? await getCurrentUser() : null;
  let staff = false;
  if (supabaseConfigured && user) {
    try {
      staff = Boolean(await membershipFor(user));
    } catch {
      staff = false;
    }
  }

  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${ibmPlexMono.variable} h-full antialiased light`}
      data-ui={isUiV2Enabled() ? "v2" : undefined}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans">
        <Script id="theme-preload" strategy="beforeInteractive">
          {`(function(){try{var t=localStorage.getItem("hf-theme");document.documentElement.classList.remove("light","dark");document.documentElement.classList.add(t==="dark"?"dark":"light")}catch(e){document.documentElement.classList.add("light")}})()`}
        </Script>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-foreground focus:px-4 focus:py-2 focus:text-background"
        >
          Skip to main content
        </a>

        <ThemeProvider>
          <ServiceWorkerRegister />
          <AnalyticsTracker />
          <AppShell
            email={user?.email ?? null}
            staff={staff}
            aiEnabled={process.env.NEXT_PUBLIC_AI_ENABLED === "true"}
          >
            {children}
          </AppShell>
          <InstallPrompt />
        </ThemeProvider>
      </body>
    </html>
  );
}
