// Burns a small info panel into the bottom-left corner of a photo — the
// same idea as "Timestamp Camera": who took it, when, and where, baked
// permanently into the image itself (not hidden metadata that gets
// stripped the moment the photo is shared anywhere outside this app).

export interface StampInfo {
  name: string;
  lat: number;
  lng: number;
  zoneName: string | null;
  date?: Date;
}

function formatStampDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

export async function stampPhoto(file: File, info: StampInfo): Promise<File> {
  if (!file.type.startsWith("image/")) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    ctx.drawImage(bitmap, 0, 0);
    bitmap.close?.();

    const lines = [
      info.name,
      formatStampDate(info.date ?? new Date()),
      `${info.lat.toFixed(6)}, ${info.lng.toFixed(6)}`,
      info.zoneName ? `Zone: ${info.zoneName}` : null,
    ].filter((l): l is string => !!l);

    // Font sized relative to the photo's resolution so the stamp stays
    // legible (and proportionally the same) whether this came off a
    // 12MP camera or a small gallery image, and stays correctly
    // proportioned if the image gets downscaled again during upload
    // compression later.
    const fontSize = Math.max(18, Math.round(canvas.width * 0.026));
    const lineHeight = Math.round(fontSize * 1.35);
    const padding = Math.round(fontSize * 0.7);

    ctx.font = `${fontSize}px sans-serif`;
    ctx.textBaseline = "top";
    const maxTextWidth = Math.max(...lines.map((l) => ctx.measureText(l).width));

    const bannerWidth = Math.min(canvas.width, maxTextWidth + padding * 2);
    const bannerHeight = lines.length * lineHeight + padding * 2;

    ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
    ctx.fillRect(0, canvas.height - bannerHeight, bannerWidth, bannerHeight);

    ctx.fillStyle = "#ffffff";
    ctx.font = `${fontSize}px sans-serif`;
    ctx.textBaseline = "top";
    lines.forEach((line, i) => {
      ctx.fillText(line, padding, canvas.height - bannerHeight + padding + i * lineHeight);
    });

    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!blob) return file;

    const newName = file.name.replace(/\.[^./]+$/, "") + "-stamped.jpg";
    return new File([blob], newName, { type: "image/jpeg", lastModified: Date.now() });
  } catch (err) {
    // A missing stamp is far better than a lost photo — never block the
    // report over a rendering failure.
    console.error("Photo stamping failed, using original file:", err);
    return file;
  }
}
