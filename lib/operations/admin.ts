export function isOperationsAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const allowed = (process.env.OPERATIONS_ADMIN_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.toLowerCase());
}
