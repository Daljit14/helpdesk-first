import { catalogResponseSchema } from "@/lib/device-agent/protocol";
import {
  DEVICE_CATALOG_VERSION,
  publicCatalog,
} from "@/lib/device-agent/catalog";

export function catalogResponse() {
  return catalogResponseSchema.parse({
    version: DEVICE_CATALOG_VERSION,
    actions: publicCatalog(),
  });
}
