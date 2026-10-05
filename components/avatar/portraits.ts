export const HUMAN_AVATAR_IDS = [
  "nova",
  "kai",
  "amara",
  "leo",
  "mei",
  "zuri",
  "sol",
  "ravi",
  "juno",
  "ines",
  "theo",
  "ada",
  "remy",
  "noor",
  "finn",
  "luca",
] as const;

export type HumanAvatarId = (typeof HUMAN_AVATAR_IDS)[number];

export const PORTRAITS: Record<HumanAvatarId, { label: string }> = {
  nova: { label: "Curly hair with glasses" },
  kai: { label: "Short dark hair with earbuds" },
  amara: { label: "Rose hijab" },
  leo: { label: "Buzz cut with beard" },
  mei: { label: "Top bun with stud earrings" },
  zuri: { label: "Braids with gold hoops" },
  sol: { label: "Long auburn hair" },
  ravi: { label: "Short hair with square glasses" },
  juno: { label: "Wavy hair with beanie" },
  ines: { label: "Pink bob" },
  theo: { label: "Silver hair with glasses" },
  ada: { label: "Space buns with earbuds" },
  remy: { label: "Bald with grey beard" },
  noor: { label: "Patterned head wrap" },
  finn: { label: "Cap with freckles" },
  luca: { label: "Locs with headband" },
};

export function portraitSrc(id: HumanAvatarId, px: 96 | 256) {
  return `/avatars/${id}-${px}.webp`;
}
