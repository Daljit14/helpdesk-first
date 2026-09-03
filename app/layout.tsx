import type { Metadata, Viewport } from "next";
import { Space_Grotesk, IBM_Plex_Mono } from "next/font/google";
import { ReactNode } from "react";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { ServiceWorkerRegister } from "@/components/sw-register";
import { InstallPrompt } from "@/components/install-prompt";
import { getCurrentUser } from "@/lib/supabase/user";
import { isSupabaseConfigured } from "@/lib/supabase/config";

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
  themeColor: "#0b0e14",
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = isSupabaseConfigured() ? await getCurrentUser() : null;

  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${ibmPlexMono.variable} h-full antialiased dark`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-foreground focus:px-4 focus:py-2 focus:text-background"
        >
          Skip to main content
        </a>

        <ThemeProvider>
          <ServiceWorkerRegister />
          <Header user={user} />
          <main
            id="main-content"
            tabIndex={-1}
            className="flex flex-1 flex-col focus:outline-none"
          >
            {children}
          </main>
          <Footer />
          <InstallPrompt />
        </ThemeProvider>
      </body>
    </html>
  );
}
