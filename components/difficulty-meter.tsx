export function DifficultyMeter({ level }: { level: 1 | 2 | 3 }) {
  return (
    <div className="flex gap-1" aria-label={`Difficulty ${level} of 3`}>
      {[1, 2, 3].map((n) => (
        <span
          key={n}
          className={`h-1.5 w-1.5 rounded-sm ${
            n <= level ? "bg-foreground" : "bg-muted-foreground/30"
          }`}
        />
      ))}
    </div>
  );
}
