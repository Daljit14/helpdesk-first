"use client";

import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Composer({
  value,
  onChange,
  onSend,
  disabled = false,
  placeholder = "Describe your IT problem…",
  hint = null,
  hintTone = "muted",
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
  placeholder?: string;
  /** Live, non-blocking hint shown under the textarea while typing. */
  hint?: string | null;
  hintTone?: "muted" | "warning" | "danger";
}) {
  return (
    <div>
      <div className="flex items-end gap-2">
        <label htmlFor="assistant-input" className="sr-only">
          Describe your IT problem
        </label>
        <textarea
          id="assistant-input"
          aria-label="Describe your IT problem"
          aria-describedby="assistant-input-hint"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (disabled) return;
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              onSend();
            }
          }}
          rows={2}
          placeholder={placeholder}
          className={cn(
            "min-h-11 flex-1 resize-none rounded-lg border border-input bg-card p-3 outline-none transition-[border-color,box-shadow] focus:border-primary",
            hint && hintTone === "warning" && "hf-asst-input-warn",
            hint && hintTone === "danger" && "hf-asst-input-danger"
          )}
        />
        <Button type="button" size="lg" onClick={onSend} disabled={disabled}>
          Send
        </Button>
      </div>
      <p
        id="assistant-input-hint"
        aria-live="polite"
        className={cn(
          "hf-asst-hint min-h-5 pt-1.5 text-xs",
          hintTone === "warning" && "hf-asst-hint-warn",
          hintTone === "danger" && "hf-asst-hint-danger",
          hintTone === "muted" && "text-muted-foreground"
        )}
      >
        {hint && (
          <span
            key={hint}
            className="hf-asst-hint-in inline-flex items-center gap-1.5"
          >
            <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {hint}
          </span>
        )}
      </p>
    </div>
  );
}
