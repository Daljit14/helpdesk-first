export function isNetworkFamily(
  category: string | null,
  message: string | null
): boolean {
  return (
    /(network|wifi|wireless|vpn|internet|dns|ethernet|connection)/i.test(
      category ?? ""
    ) ||
    /(network|wifi|wireless|vpn|internet|dns|ethernet|connection)/i.test(
      message ?? ""
    )
  );
}
