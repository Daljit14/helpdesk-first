import { z } from "zod";
import { sanitizeServiceText } from "@/lib/service-health/url";
import {
  chatStacks,
  emailStacks,
  mdmProviders,
  ssoProviders,
  standardPlatforms,
} from "./constants";
export {
  chatStacks,
  emailStacks,
  mdmProviders,
  ssoProviders,
  standardPlatforms,
} from "./constants";

const sanitizedText = (maxLength: number) =>
  z
    .string()
    .transform((value) => sanitizeServiceText(value, maxLength))
    .pipe(z.string().min(1).max(maxLength));

const textList = (itemMax: number, listMax: number) =>
  z
    .array(sanitizedText(itemMax))
    .max(listMax)
    .transform((values) => [...new Set(values)]);

export const orgEnvironmentInputSchema = z
  .object({
    vpnClient: sanitizedText(80).nullable(),
    mdmProvider: z.enum(mdmProviders).nullable(),
    emailStack: z.enum(emailStacks).nullable(),
    chatStack: z.enum(chatStacks).nullable(),
    ssoProvider: z.enum(ssoProviders).nullable(),
    standardPlatforms: z
      .array(z.enum(standardPlatforms))
      .max(5)
      .transform((values) => [...new Set(values)]),
    standardOsVersions: textList(40, 10),
    printerFleet: textList(80, 20),
    approvedSoftware: textList(80, 50),
  })
  .strict();

export type OrgEnvironmentInput = z.infer<typeof orgEnvironmentInputSchema>;
export type OrgEnvironmentProfile = OrgEnvironmentInput & {
  status: "draft" | "confirmed";
  confirmedAt: string | null;
};
