/**
 * Scales a photo down before it leaves the phone.
 *
 * A modern phone photo is several megabytes and thousands of pixels across;
 * the model reads ingredients just as well at about 1,500 pixels, and anything
 * larger only costs upload time, tokens and a request-size limit. Re-encoding
 * through a canvas also drops the file's EXIF data — including where it was
 * taken — which this app has no business sending anywhere.
 *
 * Falls back to the original file wherever the browser cannot do this (or in
 * a test environment without a canvas); the API checks size and type either way.
 */
const MAX_EDGE = 1_568;
const QUALITY = 0.85;

export async function shrinkImage(file: File): Promise<Blob> {
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") {
    return file;
  }

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (context === null) {
      return file;
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", QUALITY);
    });
    return blob ?? file;
  } catch {
    return file;
  }
}
