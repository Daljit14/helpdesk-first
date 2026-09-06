"use client";

import Link from "next/link";
import { User } from "@supabase/supabase-js";
import { buttonVariants } from "@/lib/button-variants";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme-provider";
import { logoutAction } from "@/app/actions/auth";
import { Moon, Sun, Menu, X, Headset } from "lucide-react";
import { useState } from "react";
import { usePathname } from "next/navigation";

export function Header({ user }: { user?: User | null }) {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const [open, setOpen] = useState(false);

  if (pathname?.startsWith("/admin")) return null;

  return (
    <header className="sticky top-3 z-40 px-4">
      <div className="glass-pill mx-auto flex max-w-6xl items-center justify-between px-5 py-2.5">
        <Link
          href="/"
          className="flex items-center gap-2 text-lg font-semibold tracking-tight"
        >
          <Headset className="h-5 w-5 text-indigo-500" aria-hidden />
          <span>HelpDesk First</span>
        </Link>

        <nav aria-label="Primary" className="hidden md:block">
            <ul className="flex items-center gap-2 text-sm font-medium">
            <li>
              <Link
                href="/"
                aria-current={pathname === "/" ? "page" : undefined}
                className={cn(
                  "rounded-full px-3 py-2 transition-colors hover:text-primary",
                  pathname === "/" && "bg-primary/10 text-primary"
                )}
              >
                Guides
              </Link>
            </li>
            {process.env.NEXT_PUBLIC_AI_ENABLED === "true" && (
              <li>
                <Link
                  href="/assistant"
                  aria-current={pathname === "/assistant" ? "page" : undefined}
                  className={cn(
                    "rounded-full px-3 py-2 transition-colors hover:text-primary",
                    pathname === "/assistant" && "bg-primary/10 text-primary"
                  )}
                >
                  Assistant
                </Link>
              </li>
            )}
            {user && (
              <li>
                <Link
                  href="/bookmarks"
                  aria-current={pathname === "/bookmarks" ? "page" : undefined}
                  className={cn(
                    "rounded-full px-3 py-2 transition-colors hover:text-primary",
                    pathname === "/bookmarks" && "bg-primary/10 text-primary"
                  )}
                >
                  Bookmarks
                </Link>
              </li>
            )}
            {user && (
              <li>
                <Link
                  href="/tickets"
                  aria-current={pathname === "/tickets" ? "page" : undefined}
                  className={cn(
                    "rounded-full px-3 py-2 transition-colors hover:text-primary",
                    pathname === "/tickets" && "bg-primary/10 text-primary"
                  )}
                >
                  Tickets
                </Link>
              </li>
            )}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            {theme === "dark" ? (
              <Sun className="h-5 w-5" />
            ) : (
              <Moon className="h-5 w-5" />
            )}
          </Button>

          {user ? (
            <form action={logoutAction}>
              <Button type="submit" variant="outline" size="sm">
                Log out
              </Button>
            </form>
          ) : (
            <Link
              href="/login"
              className={cn(buttonVariants({ variant: "default", size: "sm" }))}
            >
              Log in
            </Link>
          )}

          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle menu"
            aria-expanded={open}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {open && (
        <div className="glass mx-4 mt-2 md:hidden">
          <nav aria-label="Mobile" className="mx-auto max-w-6xl px-5 py-3">
            <ul className="flex flex-col gap-1 text-sm font-medium">
              <li>
                <Link href="/" className="block rounded-2xl px-3 py-3" onClick={() => setOpen(false)}>
                  Guides
                </Link>
              </li>
              {process.env.NEXT_PUBLIC_AI_ENABLED === "true" && (
                <li>
                  <Link href="/assistant" className="block rounded-2xl px-3 py-3" onClick={() => setOpen(false)}>
                    Assistant
                  </Link>
                </li>
              )}
              {user && (
                <li>
                  <Link href="/bookmarks" className="block rounded-2xl px-3 py-3" onClick={() => setOpen(false)}>
                    Bookmarks
                  </Link>
                </li>
              )}
              {user && (
                <li>
                  <Link href="/tickets" className="block rounded-2xl px-3 py-3" onClick={() => setOpen(false)}>
                    Tickets
                  </Link>
                </li>
              )}
            </ul>
          </nav>
        </div>
      )}
    </header>
  );
}
