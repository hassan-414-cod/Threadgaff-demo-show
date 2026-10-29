/**
 * Scales a photo down (long side `maxPx`) at the given quality. Used only when the server says a
 * file is too big. Returns the original when the smaller copy would not really be smaller.
 */
export async function shrinkImage(file: File, maxPx: number, quality: number): Promise<File> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, maxPx / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const png = file.type === 'image/png';
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, png ? 'image/png' : 'image/jpeg', quality));
    return blob && blob.size < file.size ? new File([blob], file.name, { type: blob.type }) : file;
  } finally {
    URL.revokeObjectURL(url);
  }
}
