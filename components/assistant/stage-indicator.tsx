import { Badge } from "@/components/ui/badge";

const stages = [
  "Understanding",
  "Finding a fix",
  "Trying it",
  "Checking result",
];

export function StageIndicator({
  current,
  terminal,
}: {
  current?: number;
  terminal?: "Done" | "Escalated";
}) {
  if (current === undefined && !terminal) {
    return <h1 className="text-2xl font-semibold">Assistant</h1>;
  }
  const active = terminal ? stages.length : Math.max(0, current ?? 0);
  return (
    <div aria-label="Assistant progress" className="flex flex-wrap gap-2">
      {stages.map((stage, index) => (
        <Badge
          key={stage}
          variant={
            index < active ? "success" : index === active ? "info" : "neutral"
          }
        >
          {index < active ? "✓" : index === active ? "●" : "○"} {stage}
        </Badge>
      ))}
      {terminal && (
        <Badge variant={terminal === "Done" ? "success" : "warning"}>
          {terminal}
        </Badge>
      )}
    </div>
  );
}
