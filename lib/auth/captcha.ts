export function getTurnstileSiteKey(): string | null {
  return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || null;
}

export function isCaptchaEnabled(): boolean {
  return getTurnstileSiteKey() !== null;
}

export function getCaptchaToken(formData: FormData): string | null {
  const value = formData.get("captchaToken");
  return typeof value === "string" && value.trim() ? value : null;
}

export function captchaRequired(formData: FormData): string | null {
  return isCaptchaEnabled() && !getCaptchaToken(formData)
    ? "Please complete the security check."
    : null;
}

export function captchaErrorMessage(error: { message?: string } | null) {
  return error?.message?.toLowerCase().includes("captcha")
    ? "Security check failed. Please try again."
    : null;
}
