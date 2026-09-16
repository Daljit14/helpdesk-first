export function isConnectorKeyValid(
  value = process.env.HELP_DESK_CONNECTOR_KEY
): boolean {
  if (!value || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
  const decodedLength = Math.floor((value.replace(/=+$/, "").length * 6) / 8);
  return decodedLength === 32;
}
