import { getCategoryIcon } from "@/components/category-icon";
import {
  CATEGORIES as ISSUE_CATEGORIES,
  DEVICES,
  type IssueCategoryId,
  type Device,
} from "./issues";

export type Category = {
  id: IssueCategoryId;
  label: string;
  icon: ReturnType<typeof getCategoryIcon>;
};

export const categories: Category[] = ISSUE_CATEGORIES.map((c) => ({
  id: c.id,
  label: c.label,
  icon: getCategoryIcon(c.id),
}));

export const platforms = DEVICES;
export type Platform = Device;
