"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export function AnalyticsTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !pathname) return;
    const privatePath = [
      "/admin",
      "/api",
      "/tickets",
      "/bookmarks",
      "/login",
      "/signup",
      "/reset-password",
      "/forgot-password",
      "/check-email",
      "/auth",
    ].some((prefix) => pathname.startsWith(prefix));
    if (privatePath) return;
    const send = (type: "page_view" | "heartbeat") => {
      void fetch("/api/analytics/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, path: pathname }),
        keepalive: true,
      }).catch(() => {});
    };
    if (document.visibilityState === "visible") send("page_view");
    let interval: number | undefined;
    const startHeartbeat = () => {
      if (document.visibilityState !== "visible") return;
      window.clearInterval(interval);
      interval = window.setInterval(() => send("heartbeat"), 45_000);
    };
    const handleVisibility = () => {
      window.clearInterval(interval);
      if (document.visibilityState === "visible") {
        send("heartbeat");
        startHeartbeat();
      }
    };
    startHeartbeat();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [pathname]);

  return null;
}
