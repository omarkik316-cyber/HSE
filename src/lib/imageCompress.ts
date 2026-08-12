// Observation photos come straight from a phone camera and can easily be
// 4-8MB. On a weak site connection that's exactly what times out mid-upload.
// Shrinking to a sane max dimension + re-encoding as JPEG cuts that down to
// a few hundred KB with no visible quality loss for a safety photo, which
// both reduces upload failures and keeps the app's storage/bandwidth use
// from ballooning over time.
export async function compressImage(file: File, maxDimension = 1600, quality = 0.72): Promise<File> {
  // Nothing to do for non-images or files that are already small.
  if (!file.type.startsWith("image/") || file.size <= 350 * 1024) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob || blob.size >= file.size) return file; // never trade a smaller original for a bigger "compressed" one

    const newName = file.name.replace(/\.[^./]+$/, "") + ".jpg";
    return new File([blob], newName, { type: "image/jpeg", lastModified: Date.now() });
  } catch (err) {
    // Compression is a nice-to-have, never a hard requirement — if the
    // browser/WebView can't do it, just send the original file.
    console.error("Image compression failed, using original file:", err);
    return file;
  }
}
