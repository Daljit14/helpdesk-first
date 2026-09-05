"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function AutoRefresh() {
  const router = useRouter();
  const [updatedAt, setUpdatedAt] = useState(() => new Date());

  useEffect(() => {
    const interval = window.setInterval(() => {
      setUpdatedAt(new Date());
      router.refresh();
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [router]);

  return (
    <p className="text-sm text-muted-foreground">
      Updated {updatedAt.toLocaleTimeString()}
    </p>
  );
}
