export function isMasterKeyValid(
  value = process.env.HELP_DESK_MASTER_KEY
): boolean {
  if (!value || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
  const unpadded = value.replace(/=+$/, "");
  const decodedLength = Math.floor((unpadded.length * 6) / 8);
  return decodedLength === 32;
}
