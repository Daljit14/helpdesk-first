import { describe, expect, test } from "vitest";
import { inspectPdf, sanitizeFilename, sniffMime } from "./inspect";

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
const webp = new TextEncoder().encode("RIFF1234WEBP");
const pdf = (body = "/Type /Page") =>
  new TextEncoder().encode(`%PDF-1.7\n${body}\n%%EOF`);

describe("secure attachment inspection", () => {
  test.each([
    [png, "image/png"],
    [jpeg, "image/jpeg"],
    [webp, "image/webp"],
    [pdf(), "application/pdf"],
  ])("sniffs %s", (bytes, mime) => {
    expect(sniffMime(bytes)).toBe(mime);
  });

  test("rejects unknown and mismatched signatures", () => {
    expect(sniffMime(new TextEncoder().encode("not an image"))).toBeNull();
    expect(sniffMime(new TextEncoder().encode("RIFF1234PNG "))).toBeNull();
  });

  test.each([
    "/Encrypt",
    "/JavaScript",
    "/JS",
    "/Launch",
    "/OpenAction",
    "/AA",
    "/EmbeddedFile",
    "/RichMedia",
    "/XFA",
  ])("rejects dangerous PDF token %s", (token) => {
    expect(inspectPdf(pdf(token))).toMatchObject({ ok: false });
  });

  test("rejects a missing header and overlarge page count", () => {
    expect(inspectPdf(new TextEncoder().encode("not pdf"))).toMatchObject({
      ok: false,
    });
    expect(
      inspectPdf(
        pdf(Array.from({ length: 501 }, () => "/Type /Page").join("\n"))
      )
    ).toMatchObject({ ok: false, pageCount: 501 });
  });

  test("counts pages without counting Pages nodes", () => {
    expect(inspectPdf(pdf("/Type /Pages\n/Type /Page"))).toMatchObject({
      ok: true,
      pageCount: 1,
    });
  });

  test("sanitizes paths, controls, and long names", () => {
    const result = sanitizeFilename("../folder/hello\u0000-world.png");
    expect(result).toBe("hello-world.png");
    expect(sanitizeFilename("a".repeat(200) + ".pdf")).toHaveLength(120);
  });
});
