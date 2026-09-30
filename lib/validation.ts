import { z } from "zod";
import { getIssueBySlug } from "./search";
import {
  acceptedTerms,
  fullNameError,
  jobTitleError,
  primaryDeviceError,
  TERMS_ERROR,
} from "./auth/signup-fields";

function optionalText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export const signUpSchema = z
  .object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .superRefine((value, ctx) => {
        if (!value) {
          ctx.addIssue({
            code: "custom",
            message: "Enter your email address.",
          });
        } else if (!z.string().email().safeParse(value).success) {
          ctx.addIssue({
            code: "custom",
            message: "Enter a valid email address.",
          });
        }
      }),
    password: z.string().superRefine((value, ctx) => {
      if (!value) {
        ctx.addIssue({ code: "custom", message: "Enter a password." });
        return;
      }
      const missing = [
        value.length < 8 && "at least 8 characters",
        !/[A-Z]/.test(value) && "an uppercase letter",
        !/[a-z]/.test(value) && "a lowercase letter",
        !/[0-9]/.test(value) && "a number",
      ].filter(Boolean) as string[];
      if (missing.length > 0) {
        const [first, ...rest] = missing;
        ctx.addIssue({
          code: "custom",
          message: `Password must be ${first}${rest.length ? ` and include ${rest.join(", ")}` : ""}.`,
        });
      }
    }),
    confirmPassword: z.string().superRefine((value, ctx) => {
      if (!value)
        ctx.addIssue({ code: "custom", message: "Confirm your password." });
    }),
    fullName: z
      .unknown()
      .transform((value) => optionalText(value).replace(/\s+/g, " ").trim())
      .superRefine((value, ctx) => {
        const message = fullNameError(value);
        if (message) ctx.addIssue({ code: "custom", message });
      }),
    jobTitle: z
      .unknown()
      .optional()
      .transform((value) => optionalText(value).replace(/\s+/g, " ").trim())
      .superRefine((value, ctx) => {
        const message = jobTitleError(value);
        if (message) ctx.addIssue({ code: "custom", message });
      }),
    primaryDevice: z
      .unknown()
      .optional()
      .transform((value) => optionalText(value).trim())
      .superRefine((value, ctx) => {
        const message = primaryDeviceError(value);
        if (message) ctx.addIssue({ code: "custom", message });
      }),
    acceptTerms: z
      .unknown()
      .transform((value) => acceptedTerms(value))
      .refine((value) => value, { message: TERMS_ERROR }),
  })
  .refine(
    (data) =>
      Boolean(data.password) &&
      Boolean(data.confirmPassword) &&
      data.password === data.confirmPassword,
    {
      message: "Passwords do not match.",
      path: ["confirmPassword"],
    }
  );

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
});

export const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, "Password must be at least 8 characters.")
      .regex(/[A-Z]/, "Include at least one uppercase letter.")
      .regex(/[a-z]/, "Include at least one lowercase letter.")
      .regex(/[0-9]/, "Include at least one number."),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export const submitTicketSchema = z.object({
  issueId: z
    .string()
    .trim()
    .refine(
      (issueId) => Boolean(getIssueBySlug(issueId)),
      "Choose a valid issue."
    ),
  message: z
    .string()
    .trim()
    .min(10, "Message must be at least 10 characters.")
    .max(2000, "Message must be 2000 characters or fewer."),
  attachmentPath: z.string().trim().min(1).optional(),
  attachmentIds: z.array(z.string().uuid()).max(50).default([]),
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type TicketInput = z.infer<typeof submitTicketSchema>;
