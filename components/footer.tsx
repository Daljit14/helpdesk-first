"use client";

import { useState } from "react";
import { Button } from "./ui/button";
import { clearAllSessions, getAllSessions } from "@/lib/session";

export function Footer() {
  const [sessionCount, setSessionCount] = useState(
    () => getAllSessions().length
  );

  function handleClear() {
    clearAllSessions();
    setSessionCount(0);
  }

  return (
    <footer className="border-t border-zinc-200 px-6 py-8">
      <div className="mx-auto max-w-5xl space-y-4">
        <p className="text-sm text-zinc-600">
          <strong>Disclaimer:</strong> HelpDesk First provides Level-1 IT
          support guidance only. Not every problem can be resolved with
          self-service steps; follow your organization&apos;s safety policies
          and contact your IT team when instructions involve managed devices,
          shared networks, or anything outside your authority.
        </p>
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <p className="text-sm text-zinc-500">
            &copy; {new Date().getFullYear()} HelpDesk First. All rights
            reserved.
          </p>
          {sessionCount > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClear}
            >
              Clear my troubleshooting history ({sessionCount})
            </Button>
          )}
        </div>
      </div>
    </footer>
  );
}
