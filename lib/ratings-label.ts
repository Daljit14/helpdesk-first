export function ratingSummary(totals: { up: number; down: number }): {
  buttonLabel: string;
  summary: string;
} {
  const total = totals.up + totals.down;
  return {
    buttonLabel: "Log in to rate",
    summary:
      total === 0
        ? "No ratings yet"
        : `${totals.up} of ${total} found this helpful`,
  };
}
