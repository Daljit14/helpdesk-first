import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { ReactNode } from "react";
import "./globals.css";
import { Footer } from "@/components/footer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "HelpDesk First",
  description: "Level-1 IT support self-service portal.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-foreground focus:px-4 focus:py-2 focus:text-background"
        >
          Skip to main content
        </a>

        <header className="border-b border-zinc-200">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
            <span className="text-lg font-semibold">HelpDesk First</span>
            <nav aria-label="Primary">
              <ul className="flex gap-4">
                <li>
                  <Link href="/" className="hover:underline">
                    Dashboard
                  </Link>
                </li>
                {process.env.NEXT_PUBLIC_AI_ENABLED === "true" && (
                  <li>
                    <Link href="/assistant" className="hover:underline">
                      Ask the Assistant
                    </Link>
                  </li>
                )}
              </ul>
            </nav>
          </div>
        </header>

        <main
          id="main-content"
          tabIndex={-1}
          className="flex flex-1 flex-col focus:outline-none"
        >
          {children}
        </main>

        <Footer />
      </body>
    </html>
  );
}
