"use client";

import { useEffect } from "react";
import { pushRecentlyViewed } from "@/lib/recent";

export function RecentTracker({ issueId }: { issueId: string }) {
  useEffect(() => {
    pushRecentlyViewed(issueId);
  }, [issueId]);

  return null;
}
