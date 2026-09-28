"use client";

import { Button } from "@/components/ui/button";

export function Composer({
  value,
  onChange,
  onSend,
  disabled = false,
  placeholder = "Describe your IT problem…",
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="flex items-end gap-2">
      <label htmlFor="assistant-input" className="sr-only">
        Describe your IT problem
      </label>
      <textarea
        id="assistant-input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            onSend();
          }
        }}
        rows={2}
        placeholder={placeholder}
        className="min-h-11 flex-1 resize-none rounded-lg border border-input bg-card p-3 outline-none focus:border-primary"
      />
      <Button type="button" size="lg" onClick={onSend} disabled={disabled}>
        Send
      </Button>
    </div>
  );
}
