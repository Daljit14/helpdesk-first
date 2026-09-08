import { z } from "zod";

export const organizationSchema = z.object({
  name: z.string().trim().min(2).max(120),
  ownerEmail: z.string().trim().toLowerCase().email().optional(),
});

export const domainSchema = z.object({
  domain: z.string().trim().min(3).max(255),
});

export const invitationSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(["requester", "support_agent", "org_admin"]),
});

export const roleSchema = z.enum(["requester", "support_agent", "org_admin"]);
