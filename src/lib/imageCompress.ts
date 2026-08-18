// Observation photos come straight from a phone camera and can easily be
// 4-8MB. On a weak site connection that's exactly what times out mid-upload.
// Shrinking to a sane max dimension + re-encoding as JPEG cuts that down to
// a few hundred KB with no visible quality loss for a safety photo, which
// both reduces upload failures and keeps the app's storage/bandwidth use
// from ballooning over time.

interface CompressionProfile {
  maxDimension: number;
  quality: number;
}

// Full quality when the connection can take it; more aggressive shrinking
// when it can't. A photo that arrives smaller-but-blurry on a 2G/3G link
// beats one that never arrives at all, and the Network Information API
// (where the device/browser supports it) is exactly what tells us which
// situation we're in *before* the upload starts timing out.
const GOOD_CONNECTION: CompressionProfile = { maxDimension: 1600, quality: 0.72 };
const MEDIUM_CONNECTION: CompressionProfile = { maxDimension: 1200, quality: 0.62 };
const WEAK_CONNECTION: CompressionProfile = { maxDimension: 900, quality: 0.5 };

function detectCompressionProfile(): CompressionProfile {
  if (typeof navigator === "undefined") return GOOD_CONNECTION;
  type NetworkInformation = { effectiveType?: string; saveData?: boolean };
  const nav = navigator as Navigator & {
    connection?: NetworkInformation;
    mozConnection?: NetworkInformation;
    webkitConnection?: NetworkInformation;
  };
  const conn = nav.connection ?? nav.mozConnection ?? nav.webkitConnection;
  if (!conn) return GOOD_CONNECTION;

  if (conn.saveData || conn.effectiveType === "slow-2g" || conn.effectiveType === "2g") {
    return WEAK_CONNECTION;
  }
  if (conn.effectiveType === "3g") {
    return MEDIUM_CONNECTION;
  }
  return GOOD_CONNECTION;
}

export async function compressImage(file: File, maxDimension?: number, quality?: number): Promise<File> {
  // Nothing to do for non-images or files that are already small.
  if (!file.type.startsWith("image/") || file.size <= 350 * 1024) return file;

  const profile = detectCompressionProfile();
  const targetDimension = maxDimension ?? profile.maxDimension;
  const targetQuality = quality ?? profile.quality;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, targetDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", targetQuality));
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
