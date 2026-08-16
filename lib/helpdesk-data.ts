import {
  AppWindow,
  Headphones,
  Mail,
  Monitor,
  Printer,
  Wifi,
  type LucideIcon,
} from "lucide-react";

export type Category = {
  id: string;
  label: string;
  icon: LucideIcon;
};

export const categories: Category[] = [
  { id: "computer", label: "Computer", icon: Monitor },
  { id: "internet", label: "Internet and Wi-Fi", icon: Wifi },
  { id: "printer", label: "Printer", icon: Printer },
  { id: "email", label: "Email", icon: Mail },
  { id: "software", label: "Software", icon: AppWindow },
  { id: "audio-camera", label: "Audio and Camera", icon: Headphones },
];

export const platforms = ["Windows", "Mac", "Mobile", "Other"] as const;
export type Platform = (typeof platforms)[number];
