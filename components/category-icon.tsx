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
