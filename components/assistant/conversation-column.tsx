import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function ConversationColumn({ children }: { children: ReactNode }) {
  return (
    <div
      role="log"
      aria-live="polite"
      className="mx-auto flex w-full max-w-[760px] flex-col gap-4"
    >
      {children}
    </div>
  );
}

export function ConversationBubble({
  role,
  children,
}: {
  role: "user" | "assistant";
  children: ReactNode;
}) {
  return (
    <div
      className={cn("flex", role === "user" ? "justify-end" : "justify-start")}
    >
      <div
        className={cn(
          "max-w-[85%] rounded-xl border border-border p-4",
          role === "user" ? "bg-card" : "bg-muted"
        )}
      >
        <span className="sr-only">
          {role === "user" ? "You: " : "Assistant: "}
        </span>
        {children}
      </div>
    </div>
  );
}
