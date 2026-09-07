export type AttachmentMime =
  "image/png" | "image/jpeg" | "image/webp" | "application/pdf";

function startsWith(bytes: Uint8Array, values: number[]): boolean {
  return values.every((value, index) => bytes[index] === value);
}

function text(bytes: Uint8Array): string {
  return new TextDecoder("latin1").decode(bytes);
}

export function sniffMime(bytes: Uint8Array): AttachmentMime | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    bytes.length >= 12 &&
    startsWith(bytes.slice(8), [0x57, 0x45, 0x42, 0x50])
  ) {
    return "image/webp";
  }
  if (text(bytes.slice(0, 5)) === "%PDF-") return "application/pdf";
  return null;
}

const DANGEROUS_PDF_TOKENS = [
  "/Encrypt",
  "/JavaScript",
  "/JS",
  "/Launch",
  "/OpenAction",
  "/AA",
  "/EmbeddedFile",
  "/RichMedia",
  "/XFA",
];

export function inspectPdf(bytes: Uint8Array): {
  ok: boolean;
  reason?: string;
  pageCount: number | null;
} {
  const header = text(bytes.slice(0, 1024));
  if (!header.includes("%PDF-")) {
    return { ok: false, reason: "Invalid PDF header.", pageCount: null };
  }

  const contents = text(bytes);
  const dangerous = DANGEROUS_PDF_TOKENS.find((token) =>
    contents.includes(token)
  );
  if (dangerous) {
    return {
      ok: false,
      reason: `PDF contains blocked token ${dangerous}.`,
      pageCount: null,
    };
  }

  const pageCount = (
    contents.match(/\/Type\s*\/Page(?!s)(?:\b|[^A-Za-z])/g) ?? []
  ).length;
  if (pageCount > 500) {
    return { ok: false, reason: "PDF exceeds the 500-page limit.", pageCount };
  }
  return { ok: true, pageCount };
}

export function sanitizeFilename(name: string): string {
  const leaf = name.split(/[\\/]/).pop() ?? "attachment";
  const cleaned = leaf
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .replace(/^\.+$/, "");
  const safe = cleaned || "attachment";
  const extensionMatch = safe.match(/(\.[^.]*)$/);
  const extension = extensionMatch?.[1] ?? "";
  const base = extension ? safe.slice(0, -extension.length) : safe;
  const maxBaseLength = Math.max(1, 120 - extension.length);
  return `${base.slice(0, maxBaseLength)}${extension}`;
}
