export const CHUNK_SIZE = 2000;
export const CHUNK_OVERLAP = 256;
export const MAX_CHUNKS = 100;
export const PREVIEW_LENGTH = 200;

export function chunkContent(content: string): string[] {
  if (content.length <= CHUNK_SIZE) return [content];

  const chunks: string[] = [];
  let start = 0;

  while (start < content.length && chunks.length < MAX_CHUNKS) {
    const end = Math.min(start + CHUNK_SIZE, content.length);
    chunks.push(content.slice(start, end));
    if (end === content.length) break;
    start += CHUNK_SIZE - CHUNK_OVERLAP;
  }

  return chunks;
}
