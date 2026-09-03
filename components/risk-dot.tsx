import { Risk } from "@/lib/issues";

const riskClass: Record<Risk, string> = {
  Low: "bg-emerald-500",
  Medium: "bg-amber-500",
  High: "bg-rose-500",
};

export function RiskDot({ risk }: { risk: Risk }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${riskClass[risk] ?? "bg-muted-foreground"}`}
        aria-hidden
      />
      <span className="font-mono text-xs text-muted-foreground">{risk} risk</span>
    </span>
  );
}
