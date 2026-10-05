import type { ImageMediaType } from "../llm/client.js";

export const IMAGE_MEDIA_TYPES: readonly ImageMediaType[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

/**
 * The image format from the file's own first bytes, or null if it is none of
 * the four the provider accepts. The declared Content-Type is the caller's
 * claim; these bytes are what the file actually is, and a mismatch is refused
 * rather than forwarded.
 */
export function sniffImageType(bytes: Uint8Array): ImageMediaType | null {
  const starts = (...signature: number[]) => signature.every((byte, i) => bytes[i] === byte);

  if (starts(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (starts(0x47, 0x49, 0x46, 0x38)) return "image/gif";
  // RIFF....WEBP
  if (
    starts(0x52, 0x49, 0x46, 0x46) &&
    [0x57, 0x45, 0x42, 0x50].every((b, i) => bytes[8 + i] === b)
  ) {
    return "image/webp";
  }
  return null;
}
