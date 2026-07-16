const STRIP_PATTERN = /<\/?((?:html|head|body)(?:\s[^>]*)?)>/gi;

/**
 * Strips structural HTML tags that indicate a full document.
 * Keeps everything else intact. Applied before rendering fragments.
 */
export function stripDocumentTags(html: string): string {
  return html.replace(STRIP_PATTERN, "");
}
