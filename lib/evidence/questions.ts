export class DuplicateQuestionError extends Error {
  constructor(questionId: string) {
    super(`Diagnostic question already asked: ${questionId}`);
    this.name = "DuplicateQuestionError";
  }
}

export function filterUnaskedQuestions(
  candidateIds: string[],
  askedIds: Iterable<string>
): string[] {
  const asked = new Set(askedIds);
  return candidateIds.filter((id) => !asked.has(id));
}

export function mergeAskedQuestionIds(
  previous: Iterable<string>,
  next: Iterable<string>
): string[] {
  return [...new Set([...previous, ...next])];
}
