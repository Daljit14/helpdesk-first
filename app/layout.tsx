import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, IBM_Plex_Mono } from "next/font/google";
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

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
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
    { media: "(prefers-color-scheme: light)", color: "#F6F5FB" },
    { media: "(prefers-color-scheme: dark)", color: "#16112A" },
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
      className={`${jakarta.variable} ${ibmPlexMono.variable} h-full antialiased light`}
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
            userId={user?.id ?? null}
            staff={staff}
            displayName={
              typeof user?.user_metadata?.full_name === "string"
                ? user.user_metadata.full_name
                : null
            }
            aiEnabled={process.env.NEXT_PUBLIC_AI_ENABLED === "true"}
            avatar={
              typeof user?.user_metadata?.avatar === "string"
                ? user.user_metadata.avatar
                : null
            }
          >
            {children}
          </AppShell>
          <InstallPrompt />
        </ThemeProvider>
      </body>
    </html>
  );
}
