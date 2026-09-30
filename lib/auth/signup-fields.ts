import { DEVICES, type Device } from "@/lib/issues";

/** Client-safe signup field rules shared by the form and `signUpSchema`. */

export const FULL_NAME_MAX = 80;
export const JOB_TITLE_MAX = 100;
export const SIGNUP_DEVICES: readonly Device[] = DEVICES;

export function fullNameError(value: string): string | null {
  const name = value.replace(/\s+/g, " ").trim();
  if (!name) return "Enter your full name.";
  if (name.length < 2) return "Enter your full name.";
  if (name.length > FULL_NAME_MAX)
    return `Keep your name under ${FULL_NAME_MAX} characters.`;
  if (/[<>]/.test(name) || /https?:\/\//i.test(name))
    return "Enter your name without links or special characters.";
  return null;
}

export function jobTitleError(value: string): string | null {
  const title = value.trim();
  if (title.length > JOB_TITLE_MAX)
    return `Keep this under ${JOB_TITLE_MAX} characters.`;
  if (/[<>]/.test(title)) return "Remove the < and > characters.";
  return null;
}

export function primaryDeviceError(value: string): string | null {
  if (!value) return null;
  return (SIGNUP_DEVICES as readonly string[]).includes(value)
    ? null
    : "Choose a device from the list.";
}

export function acceptedTerms(value: unknown): boolean {
  return value === true || value === "on" || value === "true";
}

export const TERMS_ERROR =
  "Please agree to the acceptable-use and privacy terms.";

export type PasswordStrength = {
  /** 0 (empty) to 4 (strong). */
  score: 0 | 1 | 2 | 3 | 4;
  label: "" | "Too weak" | "Fair" | "Good" | "Strong";
  /** Requirements still missing for the server's minimum rule. */
  missing: string[];
};

export function passwordStrength(password: string): PasswordStrength {
  if (!password) return { score: 0, label: "", missing: [] };
  const missing = [
    password.length < 8 && "8+ characters",
    !/[A-Z]/.test(password) && "an uppercase letter",
    !/[a-z]/.test(password) && "a lowercase letter",
    !/[0-9]/.test(password) && "a number",
  ].filter(Boolean) as string[];
  if (missing.length > 0) return { score: 1, label: "Too weak", missing };
  let points = 0;
  if (password.length >= 12) points++;
  if (password.length >= 16) points++;
  if (/[^A-Za-z0-9]/.test(password)) points++;
  if (/(.)\1\1/.test(password) || /^(password|qwerty|letmein)/i.test(password))
    points = Math.max(0, points - 1);
  if (points >= 2) return { score: 4, label: "Strong", missing };
  if (points === 1) return { score: 3, label: "Good", missing };
  return { score: 2, label: "Fair", missing };
}
