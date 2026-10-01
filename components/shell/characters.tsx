import {
  AVATAR_VIEWBOX,
  HUMAN_AVATARS,
  HUMAN_AVATAR_IDS,
  HumanFigure,
  humanAvatarBackground,
  type HumanAvatarId,
} from "@/components/avatar/human-avatars";
import { cn } from "@/lib/utils";

/** Selectable people avatars (illustrated humans, see components/avatar). */
export const CHARACTERS = HUMAN_AVATAR_IDS;

export type CharacterId = HumanAvatarId;

/** Ids saved by earlier versions of this picker (animals / robots). */
const LEGACY_CHARACTERS: Record<string, CharacterId> = {
  bot: "nova",
  cat: "mei",
  ghost: "ines",
  alien: "kai",
  owl: "amara",
  rocket: "leo",
  fox: "sol",
  panda: "ravi",
  astro: "juno",
};

/** Maps a stored character id (new or legacy) to a current one. */
export function resolveCharacterId(
  value: string | null | undefined
): CharacterId | null {
  if (!value) return null;
  if ((CHARACTERS as readonly string[]).includes(value)) {
    return value as CharacterId;
  }
  return LEGACY_CHARACTERS[value] ?? null;
}

export function characterLabel(id: CharacterId) {
  return HUMAN_AVATARS[id].label;
}

export function Character({
  id,
  className,
}: {
  id: CharacterId;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      data-character={id}
      className={cn(
        "hf-ava hf-ava3 inline-flex h-11 w-11 shrink-0 overflow-hidden rounded-full",
        className
      )}
      style={{ background: humanAvatarBackground(id) }}
    >
      <svg
        viewBox={AVATAR_VIEWBOX}
        width="100%"
        height="100%"
        className="block"
      >
        <HumanFigure id={id} index={CHARACTERS.indexOf(id)} />
      </svg>
    </span>
  );
}
