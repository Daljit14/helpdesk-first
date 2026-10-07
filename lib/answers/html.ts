const DROP_ELEMENTS =
  /<(script|style|noscript|template|svg|nav|header|footer|aside|form)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const BLOCK_ELEMENTS =
  /<\/?(?:address|article|blockquote|br|dd|div|dl|dt|h[1-6]|hr|li|main|ol|p|pre|section|table|tbody|td|th|thead|tr|ul)\b[^>]*>/gi;

export function decodeHtmlEntities(value: string): string {
  return value.replace(
    /&(?:amp|lt|gt|quot|apos|nbsp|#39|#\d{1,7}|#x[\da-f]{1,6});/gi,
    (entity) => {
      const normalized = entity.toLowerCase();
      const named: Record<string, string> = {
        "&amp;": "&",
        "&lt;": "<",
        "&gt;": ">",
        "&quot;": '"',
        "&apos;": "'",
        "&#39;": "'",
        "&nbsp;": " ",
      };
      if (normalized in named) return named[normalized];
      const hex = /^&#x([\da-f]+);$/i.exec(entity);
      const decimal = /^&#(\d+);$/.exec(entity);
      const codePoint = hex
        ? Number.parseInt(hex[1], 16)
        : decimal
          ? Number.parseInt(decimal[1], 10)
          : NaN;
      if (
        !Number.isInteger(codePoint) ||
        codePoint < 0 ||
        codePoint > 0x10ffff ||
        (codePoint >= 0xd800 && codePoint <= 0xdfff)
      )
        return entity;
      return String.fromCodePoint(codePoint);
    }
  );
}

export function htmlToText(value: string): string {
  return decodeHtmlEntities(
    value
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(DROP_ELEMENTS, " ")
      .replace(BLOCK_ELEMENTS, "\n\n")
      .replace(/<[^>]*>/g, " ")
  )
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, " ")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function extractPageText(html: string): string {
  const withoutCommentsAndChrome = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(DROP_ELEMENTS, " ");
  const main =
    /<main\b[^>]*>([\s\S]*?)<\/main\s*>/i.exec(withoutCommentsAndChrome)?.[1] ??
    /<article\b[^>]*>([\s\S]*?)<\/article\s*>/i.exec(
      withoutCommentsAndChrome
    )?.[1] ??
    withoutCommentsAndChrome;
  return htmlToText(main).slice(0, 6000);
}
