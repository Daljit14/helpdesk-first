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

export function Header({ user }: { user?: User | null }) {
  const { theme, toggleTheme } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link
          href="/"
          className="flex items-center gap-2 text-lg font-semibold tracking-tight"
        >
          <Headset className="h-5 w-5 text-indigo-500" aria-hidden />
          <span>HelpDesk First</span>
        </Link>

        <nav aria-label="Primary" className="hidden md:block">
          <ul className="flex items-center gap-6 text-sm font-medium">
            <li>
              <Link href="/" className="hover:text-indigo-500">
                Guides
              </Link>
            </li>
            {user && (
              <li>
                <Link href="/bookmarks" className="hover:text-indigo-500">
                  Bookmarks
                </Link>
              </li>
            )}
            {user && (
              <li>
                <Link href="/tickets" className="hover:text-indigo-500">
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
        <div className="border-t border-border/40 md:hidden">
          <nav aria-label="Mobile" className="mx-auto max-w-6xl px-6 py-4">
            <ul className="flex flex-col gap-3 text-sm font-medium">
              <li>
                <Link href="/" onClick={() => setOpen(false)}>
                  Guides
                </Link>
              </li>
              {user && (
                <li>
                  <Link href="/bookmarks" onClick={() => setOpen(false)}>
                    Bookmarks
                  </Link>
                </li>
              )}
              {user && (
                <li>
                  <Link href="/tickets" onClick={() => setOpen(false)}>
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
