import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function Field({
  id,
  label,
  description,
  error,
  children,
  className,
}: {
  id: string;
  label: string;
  description?: ReactNode;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(" ");
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {description && (
        <p id={descriptionId} className="text-sm text-muted-foreground">
          {description}
        </p>
      )}
      {children}
      {error && (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {describedBy && (
        <span className="sr-only" data-field-description={describedBy} />
      )}
    </div>
  );
}

export function fieldDescribedBy(
  id: string,
  hasDescription: boolean,
  hasError: boolean
) {
  return (
    [
      hasDescription ? `${id}-description` : null,
      hasError ? `${id}-error` : null,
    ]
      .filter(Boolean)
      .join(" ") || undefined
  );
}
