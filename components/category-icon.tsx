import {
  Monitor,
  Wifi,
  Printer,
  Mail,
  AppWindow,
  Volume2,
  KeyRound,
  FolderOpen,
  Video,
  Smartphone,
  Cable,
  MessagesSquare,
  ShieldAlert,
  LucideIcon,
} from "lucide-react";
import { IssueCategoryId } from "@/lib/issues";

const iconMap: Record<IssueCategoryId, LucideIcon> = {
  computer: Monitor,
  network: Wifi,
  printer: Printer,
  email: Mail,
  software: AppWindow,
  audio: Volume2,
  accounts: KeyRound,
  files: FolderOpen,
  video: Video,
  mobile: Smartphone,
  peripherals: Cable,
  collab: MessagesSquare,
  security: ShieldAlert,
};

export function getCategoryIcon(id: IssueCategoryId): LucideIcon {
  return iconMap[id] ?? Monitor;
}

const toneMap: Record<IssueCategoryId, string> = {
  computer: "tone-violet",
  network: "tone-sky",
  printer: "tone-marigold",
  email: "tone-rose",
  software: "tone-teal",
  audio: "tone-leaf",
  accounts: "tone-marigold",
  files: "tone-sky",
  video: "tone-rose",
  mobile: "tone-teal",
  peripherals: "tone-leaf",
  collab: "tone-violet",
  security: "tone-rose",
};

/** Class name for a category's coloured icon tile (see `.tone-*` in globals.css). */
export function getCategoryTone(id: IssueCategoryId | string): string {
  return toneMap[id as IssueCategoryId] ?? "tone-violet";
}
